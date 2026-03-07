import prisma from '../lib/prisma';
import bcrypt from 'bcrypt';
import { AppError } from '../middleware/error.middleware';
import * as sshKeyService from './sshkey.service';
import * as auditService from './audit.service';
import * as identityVerification from './identityVerification.service';
import { logger } from '../utils/logger';
import {
  generateSalt,
  generateMasterKey,
  deriveKeyFromPassword,
  encryptMasterKey,
  generateRecoveryKey,
  encryptMasterKeyWithRecovery,
  lockVault,
} from './crypto.service';

const BCRYPT_ROUNDS = 12;

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
}

async function ensureUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (!existing || (excludeId && existing.id === excludeId)) break;
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }
  return slug;
}

export async function createTenant(userId: string, name: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });
  if (!user) throw new AppError('User not found', 404);
  if (user.tenantId) throw new AppError('You already belong to an organization', 400);

  const slug = await ensureUniqueSlug(generateSlug(name));

  const tenant = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.create({
      data: { name, slug },
    });
    await tx.user.update({
      where: { id: userId },
      data: { tenantId: t.id, tenantRole: 'OWNER' },
    });
    return t;
  });

  // Auto-generate SSH key pair (best-effort — must not block tenant creation)
  try {
    const keyPair = await sshKeyService.generateKeyPair(tenant.id);
    auditService.log({
      userId,
      action: 'SSH_KEY_GENERATE',
      targetType: 'SshKeyPair',
      targetId: keyPair.id,
      details: { auto: true, trigger: 'tenant_creation' },
    });
  } catch (err) {
    logger.warn(`Auto SSH key generation failed for tenant ${tenant.id}:`, err);
  }

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    userCount: 1,
    teamCount: 0,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

export async function getTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      _count: { select: { users: true, teams: true } },
    },
  });
  if (!tenant) throw new AppError('Organization not found', 404);

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    mfaRequired: tenant.mfaRequired,
    defaultSessionTimeoutSeconds: tenant.defaultSessionTimeoutSeconds,
    vaultAutoLockMaxMinutes: tenant.vaultAutoLockMaxMinutes,
    userCount: tenant._count.users,
    teamCount: tenant._count.teams,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

export async function updateTenant(tenantId: string, data: { name?: string; defaultSessionTimeoutSeconds?: number; mfaRequired?: boolean; vaultAutoLockMaxMinutes?: number | null }) {
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.slug = await ensureUniqueSlug(generateSlug(data.name), tenantId);
  }
  if (data.defaultSessionTimeoutSeconds !== undefined) {
    updateData.defaultSessionTimeoutSeconds = data.defaultSessionTimeoutSeconds;
  }
  if (data.mfaRequired !== undefined) {
    updateData.mfaRequired = data.mfaRequired;
  }
  if (data.vaultAutoLockMaxMinutes !== undefined) {
    updateData.vaultAutoLockMaxMinutes = data.vaultAutoLockMaxMinutes;
  }

  if (Object.keys(updateData).length === 0) {
    throw new AppError('No fields to update', 400);
  }

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: updateData,
  });

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    mfaRequired: tenant.mfaRequired,
    defaultSessionTimeoutSeconds: tenant.defaultSessionTimeoutSeconds,
    vaultAutoLockMaxMinutes: tenant.vaultAutoLockMaxMinutes,
    updatedAt: tenant.updatedAt,
  };
}

export async function deleteTenant(tenantId: string) {
  await prisma.$transaction(async (tx) => {
    // Delete all team members in this tenant's teams
    await tx.teamMember.deleteMany({
      where: { team: { tenantId } },
    });
    // Nullify teamId on connections belonging to this tenant's teams
    await tx.connection.updateMany({
      where: { team: { tenantId } },
      data: { teamId: null },
    });
    // Nullify teamId on folders belonging to this tenant's teams
    await tx.folder.updateMany({
      where: { team: { tenantId } },
      data: { teamId: null },
    });
    // Delete all teams
    await tx.team.deleteMany({
      where: { tenantId },
    });
    // Unset tenant reference on all users (don't delete the users)
    await tx.user.updateMany({
      where: { tenantId },
      data: { tenantId: null, tenantRole: null },
    });
    // Delete the tenant
    await tx.tenant.delete({ where: { id: tenantId } });
  });

  return { deleted: true };
}

export async function getTenantMfaStats(tenantId: string) {
  const users = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true, totpEnabled: true, smsMfaEnabled: true },
  });

  const total = users.length;
  const withoutMfa = users.filter((u) => !u.totpEnabled && !u.smsMfaEnabled).length;

  return { total, withoutMfa };
}

export async function listTenantUsers(tenantId: string) {
  const users = await prisma.user.findMany({
    where: { tenantId },
    select: {
      id: true,
      email: true,
      username: true,
      avatarData: true,
      tenantRole: true,
      totpEnabled: true,
      smsMfaEnabled: true,
      enabled: true,
      createdAt: true,
    },
    orderBy: { email: 'asc' },
  });

  // Sort by role hierarchy: OWNER first, then ADMIN, then MEMBER
  const roleOrder: Record<string, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };
  return users.sort((a, b) => {
    const aOrder = a.tenantRole ? (roleOrder[a.tenantRole] ?? 3) : 3;
    const bOrder = b.tenantRole ? (roleOrder[b.tenantRole] ?? 3) : 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.email ?? '').localeCompare(b.email ?? '');
  });
}

export async function inviteUser(tenantId: string, email: string, role: 'ADMIN' | 'MEMBER') {
  const targetUser = await prisma.user.findUnique({ where: { email } });
  if (!targetUser) {
    throw new AppError('User not found. They must register first.', 404);
  }

  if (targetUser.tenantId) {
    if (targetUser.tenantId === tenantId) {
      throw new AppError('User is already a member of this organization', 400);
    }
    throw new AppError('User already belongs to another organization', 400);
  }

  await prisma.user.update({
    where: { id: targetUser.id },
    data: { tenantId, tenantRole: role },
  });

  return {
    userId: targetUser.id,
    email: targetUser.email,
    username: targetUser.username,
    role,
  };
}

export async function updateUserRole(
  tenantId: string,
  targetUserId: string,
  newRole: 'OWNER' | 'ADMIN' | 'MEMBER',
  actingUserId: string
) {
  const targetUser = await prisma.user.findFirst({
    where: { id: targetUserId, tenantId },
  });
  if (!targetUser) throw new AppError('User not found in this organization', 404);

  // Prevent demoting the last OWNER
  if (targetUser.tenantRole === 'OWNER' && newRole !== 'OWNER') {
    const ownerCount = await prisma.user.count({
      where: { tenantId, tenantRole: 'OWNER' },
    });
    if (ownerCount <= 1) {
      throw new AppError('Cannot change role of the last owner. Transfer ownership first.', 400);
    }
  }

  // Prevent self-demotion if last OWNER
  if (targetUserId === actingUserId && targetUser.tenantRole === 'OWNER' && newRole !== 'OWNER') {
    const ownerCount = await prisma.user.count({
      where: { tenantId, tenantRole: 'OWNER' },
    });
    if (ownerCount <= 1) {
      throw new AppError('Cannot demote yourself as the last owner', 400);
    }
  }

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { tenantRole: newRole },
    select: { id: true, email: true, username: true, tenantRole: true },
  });

  return updated;
}

export async function removeUser(tenantId: string, targetUserId: string, actingUserId: string) {
  const targetUser = await prisma.user.findFirst({
    where: { id: targetUserId, tenantId },
  });
  if (!targetUser) throw new AppError('User not found in this organization', 404);

  // Prevent removing the last OWNER
  if (targetUser.tenantRole === 'OWNER') {
    const ownerCount = await prisma.user.count({
      where: { tenantId, tenantRole: 'OWNER' },
    });
    if (ownerCount <= 1) {
      throw new AppError('Cannot remove the last owner', 400);
    }
  }

  // Prevent self-removal (use "leave organization" flow instead, if needed)
  if (targetUserId === actingUserId) {
    throw new AppError('Cannot remove yourself. Use leave organization instead.', 400);
  }

  await prisma.$transaction(async (tx) => {
    // Remove from all teams in this tenant
    await tx.teamMember.deleteMany({
      where: {
        userId: targetUserId,
        team: { tenantId },
      },
    });
    // Unset tenant
    await tx.user.update({
      where: { id: targetUserId },
      data: { tenantId: null, tenantRole: null },
    });
  });

  return { removed: true };
}

export async function createUser(
  tenantId: string,
  data: { email: string; username?: string; password: string; role: 'ADMIN' | 'MEMBER' },
  _actingUserId: string,
) {
  // Check for existing user
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    if (existing.tenantId === tenantId) {
      throw new AppError('User is already a member of this organization', 400);
    }
    if (existing.tenantId) {
      throw new AppError('A user with this email already belongs to another organization', 400);
    }
    throw new AppError('A user with this email already exists', 409);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  // Vault encryption setup (identical to auth.service register flow)
  const vaultSalt = generateSalt();
  const masterKey = generateMasterKey();
  const derivedKey = await deriveKeyFromPassword(data.password, vaultSalt);
  const encryptedVault = encryptMasterKey(masterKey, derivedKey);

  // Recovery key
  const recoveryKey = generateRecoveryKey();
  const recoveryResult = await encryptMasterKeyWithRecovery(masterKey, recoveryKey);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      username: data.username || null,
      passwordHash,
      vaultSalt,
      encryptedVaultKey: encryptedVault.ciphertext,
      vaultKeyIV: encryptedVault.iv,
      vaultKeyTag: encryptedVault.tag,
      encryptedVaultRecoveryKey: recoveryResult.encrypted.ciphertext,
      vaultRecoveryKeyIV: recoveryResult.encrypted.iv,
      vaultRecoveryKeyTag: recoveryResult.encrypted.tag,
      vaultRecoveryKeySalt: recoveryResult.salt,
      emailVerified: true,
      tenantId,
      tenantRole: data.role,
    },
    select: {
      id: true,
      email: true,
      username: true,
      tenantRole: true,
      createdAt: true,
    },
  });

  // Zero sensitive data
  masterKey.fill(0);
  derivedKey.fill(0);

  return { user, recoveryKey };
}

export async function toggleUserEnabled(
  tenantId: string,
  targetUserId: string,
  enabled: boolean,
  actingUserId: string,
) {
  const targetUser = await prisma.user.findFirst({
    where: { id: targetUserId, tenantId },
  });
  if (!targetUser) {
    throw new AppError('User not found in this organization', 404);
  }

  if (targetUserId === actingUserId) {
    throw new AppError('Cannot disable your own account', 400);
  }

  if (!enabled && targetUser.tenantRole === 'OWNER') {
    const enabledOwnerCount = await prisma.user.count({
      where: { tenantId, tenantRole: 'OWNER', enabled: true },
    });
    if (enabledOwnerCount <= 1) {
      throw new AppError('Cannot disable the last active owner', 400);
    }
  }

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { enabled },
    select: {
      id: true,
      email: true,
      username: true,
      tenantRole: true,
      enabled: true,
    },
  });

  // If disabling, revoke all refresh tokens to force immediate logout
  if (!enabled) {
    await prisma.refreshToken.deleteMany({
      where: { userId: targetUserId },
    });
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Admin operations on other users (requires identity verification)
// ---------------------------------------------------------------------------

export async function adminChangeUserEmail(
  tenantId: string,
  actingUserId: string,
  targetUserId: string,
  newEmail: string,
  verificationId: string,
) {
  identityVerification.consumeVerification(verificationId, actingUserId, 'admin-action');

  const actingUser = await prisma.user.findFirst({
    where: { id: actingUserId, tenantId },
    select: { tenantRole: true },
  });
  if (!actingUser || (actingUser.tenantRole !== 'ADMIN' && actingUser.tenantRole !== 'OWNER')) {
    throw new AppError('Insufficient permissions', 403);
  }

  const targetUser = await prisma.user.findFirst({
    where: { id: targetUserId, tenantId },
  });
  if (!targetUser) throw new AppError('User not found in this organization', 404);

  const existing = await prisma.user.findUnique({ where: { email: newEmail } });
  if (existing && existing.id !== targetUserId) {
    throw new AppError('Email already in use', 409);
  }

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { email: newEmail, emailVerified: false },
    select: { id: true, email: true, username: true, tenantRole: true },
  });

  auditService.log({
    userId: actingUserId,
    action: 'ADMIN_EMAIL_CHANGE',
    targetType: 'User',
    targetId: targetUserId,
    details: { newEmail, oldEmail: targetUser.email },
  });

  return updated;
}

export async function adminChangeUserPassword(
  tenantId: string,
  actingUserId: string,
  targetUserId: string,
  newPassword: string,
  verificationId: string,
) {
  identityVerification.consumeVerification(verificationId, actingUserId, 'admin-action');

  const actingUser = await prisma.user.findFirst({
    where: { id: actingUserId, tenantId },
    select: { tenantRole: true },
  });
  if (!actingUser || (actingUser.tenantRole !== 'ADMIN' && actingUser.tenantRole !== 'OWNER')) {
    throw new AppError('Insufficient permissions', 403);
  }

  const targetUser = await prisma.user.findFirst({
    where: { id: targetUserId, tenantId },
  });
  if (!targetUser) throw new AppError('User not found in this organization', 404);

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  // Generate fresh vault
  const newMasterKey = generateMasterKey();
  const newVaultSalt = generateSalt();
  const newDerivedKey = await deriveKeyFromPassword(newPassword, newVaultSalt);
  const newEncryptedVault = encryptMasterKey(newMasterKey, newDerivedKey);

  // Generate recovery key
  const recoveryKey = generateRecoveryKey();
  const recoveryResult = await encryptMasterKeyWithRecovery(newMasterKey, recoveryKey);

  newMasterKey.fill(0);
  newDerivedKey.fill(0);

  // Wipe all encrypted data and update vault in a transaction
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetUserId },
      data: {
        passwordHash,
        vaultSalt: newVaultSalt,
        encryptedVaultKey: newEncryptedVault.ciphertext,
        vaultKeyIV: newEncryptedVault.iv,
        vaultKeyTag: newEncryptedVault.tag,
        encryptedVaultRecoveryKey: recoveryResult.encrypted.ciphertext,
        vaultRecoveryKeyIV: recoveryResult.encrypted.iv,
        vaultRecoveryKeyTag: recoveryResult.encrypted.tag,
        vaultRecoveryKeySalt: recoveryResult.salt,
        // Disable TOTP (encrypted secret is lost with old vault key)
        totpEnabled: false,
        totpSecret: null,
        encryptedTotpSecret: null,
        totpSecretIV: null,
        totpSecretTag: null,
      },
    });

    // Wipe encrypted connection credentials
    await tx.connection.updateMany({
      where: { userId: targetUserId },
      data: {
        encryptedUsername: null,
        usernameIV: null,
        usernameTag: null,
        encryptedPassword: null,
        passwordIV: null,
        passwordTag: null,
      },
    });

    // Wipe shared connections
    await tx.sharedConnection.deleteMany({
      where: { sharedByUserId: targetUserId },
    });

    // Wipe team vault keys
    await tx.teamMember.updateMany({
      where: { userId: targetUserId },
      data: {
        encryptedTeamVaultKey: null,
        teamVaultKeyIV: null,
        teamVaultKeyTag: null,
      },
    });

    // Wipe tenant vault memberships
    await tx.tenantVaultMember.deleteMany({
      where: { userId: targetUserId },
    });

    // Wipe vault secrets
    await tx.vaultSecret.deleteMany({
      where: { userId: targetUserId },
    });

    // Wipe shared secrets
    await tx.sharedSecret.deleteMany({
      where: { sharedByUserId: targetUserId },
    });

    // Wipe external secret shares
    await tx.externalSecretShare.deleteMany({
      where: { secret: { userId: targetUserId } },
    });
  });

  // Invalidate all refresh tokens (force re-login)
  await prisma.refreshToken.deleteMany({
    where: { userId: targetUserId },
  });

  // Lock vault in memory
  lockVault(targetUserId);

  auditService.log({
    userId: actingUserId,
    action: 'ADMIN_PASSWORD_CHANGE',
    targetType: 'User',
    targetId: targetUserId,
    details: { vaultReset: true },
  });

  logger.verbose(`Admin ${actingUserId} reset password for user ${targetUserId}`);

  return { recoveryKey };
}
