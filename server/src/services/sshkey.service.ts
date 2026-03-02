import crypto from 'crypto';
import prisma from '../lib/prisma';
import { encryptWithServerKey, decryptWithServerKey } from './crypto.service';
import { AppError } from '../middleware/error.middleware';

export interface SshKeyPairResponse {
  id: string;
  publicKey: string;
  fingerprint: string;
  algorithm: string;
  createdAt: Date;
  updatedAt: Date;
}

function computeFingerprint(publicKeyDer: Buffer): string {
  const hash = crypto.createHash('sha256').update(publicKeyDer).digest('base64');
  return `SHA256:${hash}`;
}

export async function generateKeyPair(tenantId: string): Promise<SshKeyPairResponse> {
  const existing = await prisma.sshKeyPair.findUnique({ where: { tenantId } });
  if (existing) {
    throw new AppError('SSH key pair already exists for this tenant. Use rotate to replace it.', 409);
  }

  const { publicKey: pubKeyObject, privateKey: privKeyObject } = crypto.generateKeyPairSync(
    'ed25519',
    {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    },
  );

  const publicKeyPem = pubKeyObject as unknown as string;
  const privateKeyPem = privKeyObject as unknown as string;

  // Compute fingerprint from DER-encoded public key
  const pubKeyDer = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  const fingerprint = computeFingerprint(pubKeyDer);

  // Encrypt private key with server-level key
  const encrypted = encryptWithServerKey(privateKeyPem);

  const record = await prisma.sshKeyPair.create({
    data: {
      tenantId,
      encryptedPrivateKey: encrypted.ciphertext,
      privateKeyIV: encrypted.iv,
      privateKeyTag: encrypted.tag,
      publicKey: publicKeyPem,
      fingerprint,
      algorithm: 'ed25519',
    },
  });

  return {
    id: record.id,
    publicKey: record.publicKey,
    fingerprint: record.fingerprint,
    algorithm: record.algorithm,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function getPublicKey(tenantId: string): Promise<SshKeyPairResponse | null> {
  const record = await prisma.sshKeyPair.findUnique({ where: { tenantId } });
  if (!record) return null;

  return {
    id: record.id,
    publicKey: record.publicKey,
    fingerprint: record.fingerprint,
    algorithm: record.algorithm,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function getPrivateKey(tenantId: string): Promise<Buffer> {
  const record = await prisma.sshKeyPair.findUnique({ where: { tenantId } });
  if (!record) {
    throw new AppError('No SSH key pair found for this tenant', 404);
  }

  const privateKeyPem = decryptWithServerKey({
    ciphertext: record.encryptedPrivateKey,
    iv: record.privateKeyIV,
    tag: record.privateKeyTag,
  });

  return Buffer.from(privateKeyPem, 'utf8');
}

export async function rotateKeyPair(tenantId: string): Promise<SshKeyPairResponse> {
  const { publicKey: pubKeyObject, privateKey: privKeyObject } = crypto.generateKeyPairSync(
    'ed25519',
    {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    },
  );

  const publicKeyPem = pubKeyObject as unknown as string;
  const privateKeyPem = privKeyObject as unknown as string;

  const pubKeyDer = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  const fingerprint = computeFingerprint(pubKeyDer);

  const encrypted = encryptWithServerKey(privateKeyPem);

  const record = await prisma.$transaction(async (tx) => {
    await tx.sshKeyPair.deleteMany({ where: { tenantId } });
    return tx.sshKeyPair.create({
      data: {
        tenantId,
        encryptedPrivateKey: encrypted.ciphertext,
        privateKeyIV: encrypted.iv,
        privateKeyTag: encrypted.tag,
        publicKey: publicKeyPem,
        fingerprint,
        algorithm: 'ed25519',
      },
    });
  });

  return {
    id: record.id,
    publicKey: record.publicKey,
    fingerprint: record.fingerprint,
    algorithm: record.algorithm,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
