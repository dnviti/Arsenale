import { z } from 'zod';

export const createVaultProviderSchema = z.object({
  name: z.string().min(1).max(100),
  serverUrl: z.string().url(),
  authMethod: z.enum(['TOKEN', 'APPROLE']),
  namespace: z.string().max(200).optional(),
  mountPath: z.string().min(1).max(200).optional(),
  authPayload: z.string().min(1),
  caCertificate: z.string().optional(),
  cacheTtlSeconds: z.number().int().min(0).max(86400).optional(),
});
export type CreateVaultProviderInput = z.infer<typeof createVaultProviderSchema>;

export const updateVaultProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  serverUrl: z.string().url().optional(),
  authMethod: z.enum(['TOKEN', 'APPROLE']).optional(),
  namespace: z.string().max(200).nullable().optional(),
  mountPath: z.string().min(1).max(200).optional(),
  authPayload: z.string().min(1).optional(),
  caCertificate: z.string().nullable().optional(),
  cacheTtlSeconds: z.number().int().min(0).max(86400).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateVaultProviderInput = z.infer<typeof updateVaultProviderSchema>;

export const testVaultProviderSchema = z.object({
  secretPath: z.string().min(1).max(500),
});
export type TestVaultProviderInput = z.infer<typeof testVaultProviderSchema>;
