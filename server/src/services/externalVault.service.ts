import * as https from 'node:https';
import * as http from 'node:http';
import prisma from '../lib/prisma';
import { encryptWithServerKey, decryptWithServerKey } from './crypto.service';
import { AppError } from '../middleware/error.middleware';
import * as auditService from './audit.service';
import { logger } from '../utils/logger';
import type { ResolvedCredentials } from '../types';

const HCV_FETCH_TIMEOUT_MS = 10_000; // 10 seconds

const log = logger.child('external-vault');

// ---------- Types ----------

export interface VaultProviderInput {
  name: string;
  serverUrl: string;
  authMethod: 'TOKEN' | 'APPROLE';
  namespace?: string;
  mountPath?: string;
  authPayload: string; // JSON string: { token } or { roleId, secretId }
  caCertificate?: string;
  cacheTtlSeconds?: number;
}

export interface VaultProviderUpdateInput {
  name?: string;
  serverUrl?: string;
  authMethod?: 'TOKEN' | 'APPROLE';
  namespace?: string | null;
  mountPath?: string;
  authPayload?: string;
  caCertificate?: string | null;
  cacheTtlSeconds?: number;
  enabled?: boolean;
}

interface CachedToken {
  clientToken: string;
  expiresAt: number;
}

interface CachedSecret {
  data: Record<string, string>;
  expiresAt: number;
}

// ---------- In-memory caches ----------

// AppRole client token cache: providerId -> CachedToken
const tokenCache = new Map<string, CachedToken>();

// Secret data cache: `${providerId}:${path}` -> CachedSecret
const secretCache = new Map<string, CachedSecret>();

// Cleanup expired entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of tokenCache.entries()) {
    if (entry.expiresAt < now) tokenCache.delete(key);
  }
  for (const [key, entry] of secretCache.entries()) {
    if (entry.expiresAt < now) secretCache.delete(key);
  }
}, 60_000);

// ---------- HashiCorp Vault REST client ----------

/**
 * Low-level HTTP/HTTPS request helper for HashiCorp Vault.
 * Uses Node's built-in http/https modules so that a custom CA certificate can
 * be wired into an https.Agent for per-request TLS verification, and a
 * configurable timeout can be enforced to prevent indefinite hangs.
 */
async function hcvFetch(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: Record<string, unknown>;
    namespace?: string;
    caCertificate?: string;
    timeoutMs?: number;
  } = {},
): Promise<Record<string, unknown>> {
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['X-Vault-Token'] = options.token;
  if (options.namespace) headers['X-Vault-Namespace'] = options.namespace;

  const bodyStr = options.body ? JSON.stringify(options.body) : undefined;
  if (bodyStr) headers['Content-Length'] = String(Buffer.byteLength(bodyStr));

  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === 'https:';
  const timeoutMs = options.timeoutMs ?? HCV_FETCH_TIMEOUT_MS;

  // Build an https.Agent with a custom CA when provided
  const agent = isHttps && options.caCertificate
    ? new https.Agent({ ca: options.caCertificate })
    : undefined;

  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const reqOptions: https.RequestOptions | http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + (parsedUrl.search || ''),
      method: options.method ?? 'GET',
      headers,
      agent,
      timeout: timeoutMs,
    };

    const mod = isHttps ? https : http;
    const req = mod.request(reqOptions, (res: http.IncomingMessage) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => {
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new AppError(
            `HashiCorp Vault API error (${res.statusCode ?? 0}): ${body.slice(0, 200)}`,
            502,
          ));
          return;
        }
        try {
          resolve(JSON.parse(body) as Record<string, unknown>);
        } catch {
          reject(new AppError('HashiCorp Vault returned invalid JSON response', 502));
        }
      });
    });

    req.on('error', (err: Error) => {
      reject(new AppError(`HashiCorp Vault connection error: ${err.message}`, 502));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new AppError(`HashiCorp Vault request timed out after ${timeoutMs}ms`, 504));
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ---------- Authentication ----------

async function resolveClientToken(provider: {
  id: string;
  serverUrl: string;
  authMethod: string;
  namespace: string | null;
  encryptedAuthPayload: string;
  authPayloadIV: string;
  authPayloadTag: string;
  caCertificate: string | null;
}): Promise<string> {
  // Decrypt and parse payload, surfacing clear errors on invalid data
  const payloadJson = decryptWithServerKey({
    ciphertext: provider.encryptedAuthPayload,
    iv: provider.authPayloadIV,
    tag: provider.authPayloadTag,
  });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    throw new AppError(
      'External vault auth payload is corrupted or not valid JSON. Please reconfigure the provider.',
      500,
    );
  }

  if (provider.authMethod === 'TOKEN') {
    if (!payload.token || typeof payload.token !== 'string') {
      throw new AppError(
        'External vault TOKEN auth payload is missing a valid "token" field. Please reconfigure the provider.',
        500,
      );
    }
    return payload.token;
  }

  // AppRole: validate required fields
  const missingRole = !payload.roleId || typeof payload.roleId !== 'string';
  const missingSecret = !payload.secretId || typeof payload.secretId !== 'string';
  if (missingRole || missingSecret) {
    throw new AppError(
      'External vault APPROLE auth payload is missing "roleId" or "secretId" fields. Please reconfigure the provider.',
      500,
    );
  }

  // Check cache first
  const cached = tokenCache.get(provider.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.clientToken;
  }

  // AppRole login
  const result = await hcvFetch(provider.serverUrl, '/v1/auth/approle/login', {
    method: 'POST',
    body: { role_id: payload.roleId, secret_id: payload.secretId },
    namespace: provider.namespace ?? undefined,
    caCertificate: provider.caCertificate ?? undefined,
  });

  const auth = result.auth as { client_token: string; lease_duration: number } | undefined;
  if (!auth?.client_token) {
    throw new AppError('AppRole login did not return a client token', 502);
  }

  // Cache with a buffer of 30s before actual expiry
  const ttlMs = (auth.lease_duration - 30) * 1000;
  if (ttlMs > 0) {
    tokenCache.set(provider.id, {
      clientToken: auth.client_token,
      expiresAt: Date.now() + ttlMs,
    });
  }

  return auth.client_token;
}

// ---------- Secret retrieval ----------

async function readSecret(
  provider: {
    id: string;
    serverUrl: string;
    authMethod: string;
    namespace: string | null;
    mountPath: string;
    encryptedAuthPayload: string;
    authPayloadIV: string;
    authPayloadTag: string;
    caCertificate: string | null;
    cacheTtlSeconds: number;
  },
  secretPath: string,
): Promise<Record<string, string>> {
  // Check secret cache
  const cacheKey = `${provider.id}:${secretPath}`;
  const cached = secretCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const clientToken = await resolveClientToken(provider);

  // KV v2 read: GET /v1/{mount}/data/{path}
  const mount = provider.mountPath || 'secret';
  const result = await hcvFetch(
    provider.serverUrl,
    `/v1/${mount}/data/${secretPath.replace(/^\/+/, '')}`,
    {
      token: clientToken,
      namespace: provider.namespace ?? undefined,
      caCertificate: provider.caCertificate ?? undefined,
    },
  );

  // KV v2 response shape: { data: { data: { ... }, metadata: { ... } } }
  const outerData = result.data as { data?: Record<string, string> } | undefined;
  if (!outerData?.data) {
    throw new AppError(
      `Secret at "${secretPath}" is empty or has unexpected format`,
      502,
    );
  }

  // Cache the secret data
  if (provider.cacheTtlSeconds > 0) {
    secretCache.set(cacheKey, {
      data: outerData.data,
      expiresAt: Date.now() + provider.cacheTtlSeconds * 1000,
    });
  }

  return outerData.data;
}

// ---------- CRUD ----------

export async function listProviders(tenantId: string) {
  return prisma.externalVaultProvider.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      serverUrl: true,
      authMethod: true,
      namespace: true,
      mountPath: true,
      cacheTtlSeconds: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { name: 'asc' },
  });
}

export async function getProvider(tenantId: string, providerId: string) {
  const provider = await prisma.externalVaultProvider.findFirst({
    where: { id: providerId, tenantId },
    select: {
      id: true,
      name: true,
      serverUrl: true,
      authMethod: true,
      namespace: true,
      mountPath: true,
      cacheTtlSeconds: true,
      caCertificate: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!provider) throw new AppError('Vault provider not found', 404);
  return provider;
}

export async function createProvider(
  tenantId: string,
  userId: string,
  input: VaultProviderInput,
) {
  const encrypted = encryptWithServerKey(input.authPayload);

  const provider = await prisma.externalVaultProvider.create({
    data: {
      tenantId,
      name: input.name,
      serverUrl: input.serverUrl,
      authMethod: input.authMethod,
      namespace: input.namespace ?? null,
      mountPath: input.mountPath ?? 'secret',
      encryptedAuthPayload: encrypted.ciphertext,
      authPayloadIV: encrypted.iv,
      authPayloadTag: encrypted.tag,
      caCertificate: input.caCertificate ?? null,
      cacheTtlSeconds: input.cacheTtlSeconds ?? 300,
    },
    select: {
      id: true,
      name: true,
      serverUrl: true,
      authMethod: true,
      namespace: true,
      mountPath: true,
      cacheTtlSeconds: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await auditService.log({
    userId,
    action: 'VAULT_PROVIDER_CREATE',
    targetType: 'ExternalVaultProvider',
    targetId: provider.id,
    details: { name: input.name, serverUrl: input.serverUrl, authMethod: input.authMethod },
  });

  return provider;
}

export async function updateProvider(
  tenantId: string,
  providerId: string,
  userId: string,
  input: VaultProviderUpdateInput,
) {
  const existing = await prisma.externalVaultProvider.findFirst({
    where: { id: providerId, tenantId },
  });
  if (!existing) throw new AppError('Vault provider not found', 404);

  // Prevent changing authMethod without providing new credentials
  if (input.authMethod !== undefined &&
      input.authMethod !== existing.authMethod &&
      !input.authPayload) {
    throw new AppError(
      'authPayload is required when changing the auth method to ensure credentials are compatible',
      400,
    );
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.serverUrl !== undefined) data.serverUrl = input.serverUrl;
  if (input.authMethod !== undefined) data.authMethod = input.authMethod;
  if (input.namespace !== undefined) data.namespace = input.namespace;
  if (input.mountPath !== undefined) data.mountPath = input.mountPath;
  if (input.caCertificate !== undefined) data.caCertificate = input.caCertificate;
  if (input.cacheTtlSeconds !== undefined) data.cacheTtlSeconds = input.cacheTtlSeconds;
  if (input.enabled !== undefined) data.enabled = input.enabled;

  if (input.authPayload !== undefined) {
    const encrypted = encryptWithServerKey(input.authPayload);
    data.encryptedAuthPayload = encrypted.ciphertext;
    data.authPayloadIV = encrypted.iv;
    data.authPayloadTag = encrypted.tag;
  }

  // Invalidate caches on config change
  tokenCache.delete(providerId);
  for (const key of secretCache.keys()) {
    if (key.startsWith(`${providerId}:`)) secretCache.delete(key);
  }

  const provider = await prisma.externalVaultProvider.update({
    where: { id: providerId },
    data,
    select: {
      id: true,
      name: true,
      serverUrl: true,
      authMethod: true,
      namespace: true,
      mountPath: true,
      cacheTtlSeconds: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await auditService.log({
    userId,
    action: 'VAULT_PROVIDER_UPDATE',
    targetType: 'ExternalVaultProvider',
    targetId: providerId,
    details: { changes: Object.keys(data) },
  });

  return provider;
}

export async function deleteProvider(tenantId: string, providerId: string, userId: string) {
  const existing = await prisma.externalVaultProvider.findFirst({
    where: { id: providerId, tenantId },
  });
  if (!existing) throw new AppError('Vault provider not found', 404);

  // Clear any connections referencing this provider
  await prisma.connection.updateMany({
    where: { externalVaultProviderId: providerId },
    data: { externalVaultProviderId: null, externalVaultPath: null },
  });

  await prisma.externalVaultProvider.delete({ where: { id: providerId } });

  tokenCache.delete(providerId);
  for (const key of secretCache.keys()) {
    if (key.startsWith(`${providerId}:`)) secretCache.delete(key);
  }

  await auditService.log({
    userId,
    action: 'VAULT_PROVIDER_DELETE',
    targetType: 'ExternalVaultProvider',
    targetId: providerId,
    details: { name: existing.name },
  });
}

// ---------- Connection test ----------

export async function testConnection(
  tenantId: string,
  providerId: string,
  secretPath: string,
  userId: string,
): Promise<{ success: boolean; keys?: string[]; error?: string }> {
  const provider = await prisma.externalVaultProvider.findFirst({
    where: { id: providerId, tenantId },
  });
  if (!provider) throw new AppError('Vault provider not found', 404);

  try {
    const data = await readSecret(provider, secretPath);

    await auditService.log({
      userId,
      action: 'VAULT_PROVIDER_TEST',
      targetType: 'ExternalVaultProvider',
      targetId: providerId,
      details: { secretPath, success: true },
    });

    return { success: true, keys: Object.keys(data) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.warn({ providerId, secretPath, err: message }, 'vault provider test failed');

    await auditService.log({
      userId,
      action: 'VAULT_PROVIDER_TEST',
      targetType: 'ExternalVaultProvider',
      targetId: providerId,
      details: { secretPath, success: false, error: message },
    });

    return { success: false, error: message };
  }
}

// ---------- Credential resolution (called from connection.service) ----------

export async function resolveExternalVaultCredentials(
  tenantId: string,
  providerId: string,
  secretPath: string,
): Promise<ResolvedCredentials> {
  const provider = await prisma.externalVaultProvider.findFirst({
    where: { id: providerId, tenantId },
  });
  if (!provider) {
    throw new AppError('External vault provider not found or has been deleted', 404);
  }
  if (!provider.enabled) {
    throw new AppError('External vault provider is disabled', 400);
  }

  const data = await readSecret(provider, secretPath);

  const username = data.username ?? data.user ?? '';
  const password = data.password ?? data.pass ?? '';
  if (!username && !password) {
    throw new AppError(
      `Secret at "${secretPath}" does not contain username/password fields`,
      502,
    );
  }

  return {
    username,
    password,
    domain: data.domain,
    privateKey: data.private_key ?? data.privateKey,
    passphrase: data.passphrase,
  };
}
