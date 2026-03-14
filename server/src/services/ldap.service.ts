import { Client, type SearchResult } from 'ldapts';
import { config } from '../config';
import { logger } from '../utils/logger';
import prisma from '../lib/prisma';
import * as auditService from './audit.service';

const log = logger.child('ldap');

// ── Types ────────────────────────────────────────────────────────────────────

export interface LdapUserEntry {
  dn: string;
  uid: string;
  email: string;
  displayName: string;
  groups: string[];
  /** Provider-specific unique ID (entryUUID or IPAUniqueID) */
  providerUserId: string;
}

export interface LdapTestResult {
  ok: boolean;
  message: string;
  userCount?: number;
  groupCount?: number;
}

export interface LdapSyncResult {
  created: number;
  updated: number;
  disabled: number;
  errors: string[];
}

// ── Client helpers ───────────────────────────────────────────────────────────

function createClient(): Client {
  const { serverUrl, starttls, tlsRejectUnauthorized } = config.ldap;
  return new Client({
    url: serverUrl,
    tlsOptions: {
      rejectUnauthorized: tlsRejectUnauthorized,
    },
    connectTimeout: 10_000,
    timeout: 15_000,
    strictDN: false,
    ...(starttls ? {} : {}),
  });
}

async function withAdminBind<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = createClient();
  try {
    if (config.ldap.starttls) {
      await client.startTLS({
        rejectUnauthorized: config.ldap.tlsRejectUnauthorized,
      });
    }
    await client.bind(config.ldap.bindDn, config.ldap.bindPassword);
    return await fn(client);
  } finally {
    await client.unbind().catch(() => { /* ignore */ });
  }
}

// ── Search helpers ───────────────────────────────────────────────────────────

function resolveSearchBase(): string {
  return config.ldap.userSearchBase || config.ldap.baseDn;
}

function resolveUserFilter(identifier: string): string {
  // identifier can be an email or username
  const escaped = escapeLdapFilter(identifier);
  const tpl = config.ldap.userSearchFilter;

  // Support both {{username}} and {{email}} placeholders
  return tpl
    .replace(/\{\{username\}\}/g, escaped)
    .replace(/\{\{email\}\}/g, escaped);
}

function escapeLdapFilter(value: string): string {
  return value
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00');
}

function getAttr(entry: SearchResult['searchEntries'][0], attr: string): string {
  const val = entry[attr];
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) return String(val[0] ?? '');
  return String(val);
}

function parseUserEntry(entry: SearchResult['searchEntries'][0]): LdapUserEntry {
  const { emailAttr, displayNameAttr, uidAttr } = config.ldap;

  // Provider-specific unique ID: try entryUUID (OpenLDAP/389 DS), then IPAUniqueID (FreeIPA)
  const providerUserId =
    getAttr(entry, 'entryUUID') ||
    getAttr(entry, 'ipauniqueid') ||
    getAttr(entry, 'nsuniqueid') ||
    getAttr(entry, uidAttr);

  return {
    dn: entry.dn,
    uid: getAttr(entry, uidAttr),
    email: getAttr(entry, emailAttr),
    displayName: getAttr(entry, displayNameAttr),
    groups: [],
    providerUserId,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Search for an LDAP user by email or username, then validate credentials
 * via a direct LDAP bind with the user's DN.
 */
export async function authenticateUser(
  identifier: string,
  password: string,
): Promise<LdapUserEntry | null> {
  // Step 1: admin bind → search for user
  const entry = await withAdminBind(async (client) => {
    const filter = resolveUserFilter(identifier);
    const { searchEntries } = await client.search(resolveSearchBase(), {
      scope: 'sub',
      filter,
      attributes: [
        config.ldap.uidAttr,
        config.ldap.emailAttr,
        config.ldap.displayNameAttr,
        'entryUUID', 'ipauniqueid', 'nsuniqueid',
      ],
    });
    return searchEntries[0] ?? null;
  });

  if (!entry) {
    log.verbose(`LDAP user not found for identifier: ${identifier}`);
    return null;
  }

  // Step 2: user bind — validates the password
  const userClient = createClient();
  try {
    if (config.ldap.starttls) {
      await userClient.startTLS({
        rejectUnauthorized: config.ldap.tlsRejectUnauthorized,
      });
    }
    await userClient.bind(entry.dn, password);
  } catch (err) {
    log.verbose(`LDAP bind failed for ${entry.dn}: ${(err as Error).message}`);
    return null;
  } finally {
    await userClient.unbind().catch(() => { /* ignore */ });
  }

  const user = parseUserEntry(entry);

  // Step 3: optionally fetch group memberships
  if (config.ldap.groupBaseDn) {
    user.groups = await fetchUserGroups(user.dn);
  }

  // Step 4: check allowed groups (if configured)
  if (config.ldap.allowedGroups.length > 0) {
    const allowed = config.ldap.allowedGroups.some((g) =>
      user.groups.some((ug) => ug.toLowerCase() === g.toLowerCase()),
    );
    if (!allowed) {
      log.verbose(`LDAP user ${user.uid} not in any allowed group`);
      return null;
    }
  }

  return user;
}

/**
 * Fetch group memberships for a user DN.
 */
async function fetchUserGroups(userDn: string): Promise<string[]> {
  const { groupBaseDn, groupSearchFilter, groupMemberAttr, groupNameAttr } = config.ldap;
  if (!groupBaseDn) return [];

  try {
    return await withAdminBind(async (client) => {
      // Build filter: (&(objectClass=groupOfNames)(member=<userDn>))
      const baseFilter = groupSearchFilter.replace(/^\(/, '').replace(/\)$/, '');
      const filter = `(&(${baseFilter})(${groupMemberAttr}=${escapeLdapFilter(userDn)}))`;

      const { searchEntries } = await client.search(groupBaseDn, {
        scope: 'sub',
        filter,
        attributes: [groupNameAttr],
      });

      return searchEntries.map((e) => getAttr(e, groupNameAttr)).filter(Boolean);
    });
  } catch (err) {
    log.warn(`Failed to fetch LDAP groups for ${userDn}: ${(err as Error).message}`);
    return [];
  }
}

/**
 * Test LDAP connection and search capabilities.
 */
export async function testConnection(): Promise<LdapTestResult> {
  try {
    const result = await withAdminBind(async (client) => {
      // Test user search
      const { searchEntries: users } = await client.search(resolveSearchBase(), {
        scope: 'sub',
        filter: config.ldap.userSearchFilter
          .replace(/\{\{username\}\}/g, '*')
          .replace(/\{\{email\}\}/g, '*'),
        attributes: [config.ldap.uidAttr],
        sizeLimit: 100,
      });

      // Test group search (if configured)
      let groupCount = 0;
      if (config.ldap.groupBaseDn) {
        const { searchEntries: groups } = await client.search(config.ldap.groupBaseDn, {
          scope: 'sub',
          filter: config.ldap.groupSearchFilter,
          attributes: [config.ldap.groupNameAttr],
          sizeLimit: 100,
        });
        groupCount = groups.length;
      }

      return { userCount: users.length, groupCount };
    });

    return {
      ok: true,
      message: `Connected successfully. Found ${result.userCount} user(s)` +
        (config.ldap.groupBaseDn ? ` and ${result.groupCount} group(s)` : ''),
      ...result,
    };
  } catch (err) {
    const msg = (err as Error).message;
    log.error(`LDAP test connection failed: ${msg}`);
    return { ok: false, message: `Connection failed: ${msg}` };
  }
}

/**
 * Synchronize LDAP users/groups with Arsenale database.
 */
export async function syncUsers(): Promise<LdapSyncResult> {
  const result: LdapSyncResult = { created: 0, updated: 0, disabled: 0, errors: [] };

  auditService.log({ action: 'LDAP_SYNC_START' });

  try {
    // Fetch all LDAP users
    const ldapUsers = await withAdminBind(async (client) => {
      const { searchEntries } = await client.search(resolveSearchBase(), {
        scope: 'sub',
        filter: config.ldap.userSearchFilter
          .replace(/\{\{username\}\}/g, '*')
          .replace(/\{\{email\}\}/g, '*'),
        attributes: [
          config.ldap.uidAttr,
          config.ldap.emailAttr,
          config.ldap.displayNameAttr,
          'entryUUID', 'ipauniqueid', 'nsuniqueid',
        ],
        sizeLimit: 5000,
      });
      return searchEntries.map(parseUserEntry).filter((u) => u.email);
    });

    // Process each LDAP user
    const seenEmails = new Set<string>();
    for (const ldapUser of ldapUsers) {
      const email = ldapUser.email.toLowerCase();
      seenEmails.add(email);

      try {
        // Find existing user
        const existing = await prisma.user.findUnique({ where: { email } });

        if (!existing) {
          if (!config.ldap.autoProvision) continue;

          // Create new user (no password — LDAP-only login)
          const newUser = await prisma.user.create({
            data: {
              email,
              username: ldapUser.displayName || ldapUser.uid,
              vaultSetupComplete: false,
              emailVerified: true,
            },
          });

          // Link LDAP account
          await prisma.oAuthAccount.create({
            data: {
              userId: newUser.id,
              provider: 'LDAP',
              providerUserId: ldapUser.providerUserId,
              providerEmail: email,
              samlAttributes: {
                dn: ldapUser.dn,
                uid: ldapUser.uid,
                groups: ldapUser.groups,
              },
            },
          });

          // Auto-assign to default tenant if configured
          if (config.ldap.defaultTenantId) {
            const tenantExists = await prisma.tenant.findUnique({
              where: { id: config.ldap.defaultTenantId },
            });
            if (tenantExists) {
              await prisma.tenantMember.create({
                data: {
                  tenantId: config.ldap.defaultTenantId,
                  userId: newUser.id,
                  role: 'MEMBER',
                },
              }).catch(() => { /* already a member */ });
            }
          }

          auditService.log({
            userId: newUser.id,
            action: 'LDAP_USER_CREATED',
            details: { email, uid: ldapUser.uid, dn: ldapUser.dn },
          });
          result.created++;
        } else {
          // Update display name if changed
          if (ldapUser.displayName && existing.username !== ldapUser.displayName) {
            await prisma.user.update({
              where: { id: existing.id },
              data: { username: ldapUser.displayName },
            });
            result.updated++;
          }

          // Ensure LDAP account link exists
          const ldapAccount = await prisma.oAuthAccount.findFirst({
            where: { userId: existing.id, provider: 'LDAP' },
          });
          if (!ldapAccount) {
            await prisma.oAuthAccount.create({
              data: {
                userId: existing.id,
                provider: 'LDAP',
                providerUserId: ldapUser.providerUserId,
                providerEmail: email,
                samlAttributes: {
                  dn: ldapUser.dn,
                  uid: ldapUser.uid,
                  groups: ldapUser.groups,
                },
              },
            });
          } else {
            await prisma.oAuthAccount.update({
              where: { id: ldapAccount.id },
              data: {
                samlAttributes: {
                  dn: ldapUser.dn,
                  uid: ldapUser.uid,
                  groups: ldapUser.groups,
                },
              },
            });
          }
        }
      } catch (err) {
        result.errors.push(`${email}: ${(err as Error).message}`);
      }
    }

    // Disable LDAP users that no longer exist in directory
    const ldapAccounts = await prisma.oAuthAccount.findMany({
      where: { provider: 'LDAP' },
      include: { user: { select: { id: true, email: true, enabled: true } } },
    });

    for (const account of ldapAccounts) {
      if (!seenEmails.has(account.user.email.toLowerCase()) && account.user.enabled) {
        await prisma.user.update({
          where: { id: account.user.id },
          data: { enabled: false },
        });
        auditService.log({
          userId: account.user.id,
          action: 'LDAP_USER_DISABLED',
          details: { email: account.user.email, reason: 'not_found_in_ldap' },
        });
        result.disabled++;
      }
    }

    auditService.log({
      action: 'LDAP_SYNC_COMPLETE',
      details: {
        created: result.created,
        updated: result.updated,
        disabled: result.disabled,
        errors: result.errors.length,
      },
    });

    log.info(
      `[ldap] Sync complete: ${result.created} created, ${result.updated} updated, ` +
      `${result.disabled} disabled, ${result.errors.length} errors`,
    );
  } catch (err) {
    const msg = (err as Error).message;
    result.errors.push(msg);
    log.error(`[ldap] Sync failed: ${msg}`);
    auditService.log({
      action: 'LDAP_SYNC_ERROR',
      details: { error: msg },
    });
  }

  return result;
}

/**
 * Check if LDAP is enabled and configured.
 */
export function isEnabled(): boolean {
  return config.ldap.enabled && !!config.ldap.serverUrl && !!config.ldap.baseDn;
}
