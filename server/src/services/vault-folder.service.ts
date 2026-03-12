import prisma from '../lib/prisma';
import { AppError } from '../middleware/error.middleware';
import * as permissionService from './permission.service';

export async function createFolder(
  userId: string,
  name: string,
  scope: 'PERSONAL' | 'TEAM' | 'TENANT',
  parentId?: string,
  teamId?: string,
  tenantId?: string | null
) {
  if (scope === 'TEAM') {
    if (!teamId) throw new AppError('teamId is required for team-scoped folders', 400);
    const perm = await permissionService.canManageTeamResource(userId, teamId, 'TEAM_EDITOR', tenantId);
    if (!perm.allowed) throw new AppError('Insufficient team role to create vault folders', 403);
  }
  if (scope === 'TENANT') {
    if (!tenantId) throw new AppError('tenantId is required for tenant-scoped folders', 400);
    const membership = await prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { role: true },
    });
    if (membership?.role !== 'OWNER' && membership?.role !== 'ADMIN') {
      throw new AppError('Only admins and owners can create tenant vault folders', 403);
    }
  }

  if (parentId) {
    const parent = await prisma.vaultFolder.findFirst({
      where: buildScopeWhere(userId, scope, teamId, tenantId, parentId),
    });
    if (!parent) throw new AppError('Parent folder not found', 404);
  }

  return prisma.vaultFolder.create({
    data: {
      name,
      scope,
      parentId: parentId || null,
      userId,
      teamId: scope === 'TEAM' ? (teamId as string) : null,
      tenantId: scope === 'TENANT' ? (tenantId as string) : scope === 'TEAM' ? tenantId || null : null,
    },
  });
}

export async function updateFolder(
  userId: string,
  folderId: string,
  data: { name?: string; parentId?: string | null },
  tenantId?: string | null
) {
  const folder = await prisma.vaultFolder.findUnique({ where: { id: folderId } });
  if (!folder) throw new AppError('Folder not found', 404);

  // Ownership / permission check
  await assertCanManage(userId, folder, tenantId);

  if (data.parentId) {
    if (data.parentId === folderId) {
      throw new AppError('A folder cannot be its own parent', 400);
    }
    const parent = await prisma.vaultFolder.findFirst({
      where: buildScopeWhere(userId, folder.scope as 'PERSONAL' | 'TEAM' | 'TENANT', folder.teamId, folder.tenantId, data.parentId),
    });
    if (!parent) throw new AppError('Parent folder not found', 404);
  }

  return prisma.vaultFolder.update({
    where: { id: folderId },
    data: {
      name: data.name ?? folder.name,
      parentId: data.parentId !== undefined ? data.parentId : folder.parentId,
    },
  });
}

export async function deleteFolder(
  userId: string,
  folderId: string,
  tenantId?: string | null
) {
  const folder = await prisma.vaultFolder.findUnique({ where: { id: folderId } });
  if (!folder) throw new AppError('Folder not found', 404);

  await assertCanManage(userId, folder, tenantId);

  // Move secrets and child folders to parent
  await prisma.vaultSecret.updateMany({
    where: { folderId },
    data: { folderId: folder.parentId },
  });
  await prisma.vaultFolder.updateMany({
    where: { parentId: folderId },
    data: { parentId: folder.parentId },
  });

  await prisma.vaultFolder.delete({ where: { id: folderId } });
  return { deleted: true };
}

export async function getFolderTree(userId: string, tenantId?: string | null) {
  // Personal folders
  const personalFolders = await prisma.vaultFolder.findMany({
    where: { userId, scope: 'PERSONAL' },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  // Team folders
  const teamMemberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true, team: { select: { name: true } } },
  });

  let teamFolders: Array<Record<string, unknown>> = [];
  if (teamMemberships.length > 0) {
    const teamIds = teamMemberships.map((m) => m.teamId);
    const teamNameMap = new Map(teamMemberships.map((m) => [m.teamId, m.team.name]));

    const rawFolders = await prisma.vaultFolder.findMany({
      where: { teamId: { in: teamIds }, scope: 'TEAM' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    teamFolders = rawFolders.map((f) => ({
      ...f,
      teamName: f.teamId ? teamNameMap.get(f.teamId) ?? null : null,
    }));
  }

  // Tenant folders
  let tenantFolders: Array<Record<string, unknown>> = [];
  if (tenantId) {
    const rawTenantFolders = await prisma.vaultFolder.findMany({
      where: { tenantId, scope: 'TENANT' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    tenantFolders = rawTenantFolders.map((f) => ({ ...f }));
  }

  return {
    personal: personalFolders.map((f) => ({ ...f, scope: 'PERSONAL' as const })),
    team: teamFolders,
    tenant: tenantFolders,
  };
}

// --- Helpers ---

function buildScopeWhere(
  userId: string,
  scope: 'PERSONAL' | 'TEAM' | 'TENANT',
  teamId?: string | null,
  tenantId?: string | null,
  folderId?: string,
) {
  const base: Record<string, unknown> = { id: folderId };
  if (scope === 'TEAM' && teamId) {
    base.teamId = teamId;
    base.scope = 'TEAM';
  } else if (scope === 'TENANT' && tenantId) {
    base.tenantId = tenantId;
    base.scope = 'TENANT';
  } else {
    base.userId = userId;
    base.scope = 'PERSONAL';
  }
  return base;
}

async function assertCanManage(
  userId: string,
  folder: { userId: string; scope: string; teamId: string | null; tenantId: string | null },
  tenantId?: string | null
) {
  if (folder.scope === 'PERSONAL') {
    if (folder.userId !== userId) throw new AppError('Folder not found', 404);
    return;
  }
  if (folder.scope === 'TEAM' && folder.teamId) {
    const perm = await permissionService.canManageTeamResource(userId, folder.teamId, 'TEAM_EDITOR', tenantId);
    if (!perm.allowed) throw new AppError('Insufficient team role to manage vault folders', 403);
    return;
  }
  if (folder.scope === 'TENANT') {
    const effectiveTenantId = folder.tenantId || tenantId;
    if (!effectiveTenantId) throw new AppError('Tenant context required', 400);
    const membership = await prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId: effectiveTenantId, userId } },
      select: { role: true },
    });
    if (membership?.role !== 'OWNER' && membership?.role !== 'ADMIN') {
      throw new AppError('Only admins and owners can manage tenant vault folders', 403);
    }
    return;
  }
  throw new AppError('Folder not found', 404);
}
