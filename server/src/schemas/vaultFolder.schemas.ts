import { z } from 'zod';

export const createVaultFolderSchema = z.object({
  name: z.string().min(1),
  scope: z.enum(['PERSONAL', 'TEAM', 'TENANT']),
  parentId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
});

export type CreateVaultFolderInput = z.infer<typeof createVaultFolderSchema>;

export const updateVaultFolderSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export type UpdateVaultFolderInput = z.infer<typeof updateVaultFolderSchema>;
