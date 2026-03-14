import { z } from 'zod';

// Validate authPayload is valid JSON containing the required fields for the given auth method
function validateAuthPayloadShape(authMethod: 'TOKEN' | 'APPROLE', authPayload: string): boolean {
  try {
    const parsed = JSON.parse(authPayload) as unknown;
    if (!parsed || typeof parsed !== 'object') return false;
    const obj = parsed as Record<string, unknown>;
    if (authMethod === 'TOKEN') {
      return typeof obj.token === 'string' && obj.token.length > 0;
    }
    // APPROLE
    return typeof obj.roleId === 'string' && obj.roleId.length > 0 &&
      typeof obj.secretId === 'string' && obj.secretId.length > 0;
  } catch {
    return false;
  }
}

export const createVaultProviderSchema = z.object({
  name: z.string().min(1).max(100),
  serverUrl: z.string().url(),
  authMethod: z.enum(['TOKEN', 'APPROLE']),
  namespace: z.string().max(200).optional(),
  mountPath: z.string().min(1).max(200).optional(),
  authPayload: z.string().min(1),
  caCertificate: z.string().optional(),
  cacheTtlSeconds: z.number().int().min(0).max(86400).optional(),
}).superRefine((data, ctx) => {
  if (!validateAuthPayloadShape(data.authMethod, data.authPayload)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: data.authMethod === 'TOKEN'
        ? 'authPayload must be valid JSON with a non-empty "token" field: {"token":"..."}'
        : 'authPayload must be valid JSON with non-empty "roleId" and "secretId" fields: {"roleId":"...","secretId":"..."}',
      path: ['authPayload'],
    });
  }
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
}).superRefine((data, ctx) => {
  if (data.authPayload === undefined) return;
  // Validate shape when both authMethod and authPayload are provided
  if (data.authMethod !== undefined) {
    if (!validateAuthPayloadShape(data.authMethod, data.authPayload)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: data.authMethod === 'TOKEN'
          ? 'authPayload must be valid JSON with a non-empty "token" field: {"token":"..."}'
          : 'authPayload must be valid JSON with non-empty "roleId" and "secretId" fields: {"roleId":"...","secretId":"..."}',
        path: ['authPayload'],
      });
    }
    return;
  }
  // authPayload without authMethod: just ensure valid JSON
  try {
    JSON.parse(data.authPayload);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'authPayload must be valid JSON',
      path: ['authPayload'],
    });
  }
});
export type UpdateVaultProviderInput = z.infer<typeof updateVaultProviderSchema>;

export const testVaultProviderSchema = z.object({
  secretPath: z.string().min(1).max(500),
});
export type TestVaultProviderInput = z.infer<typeof testVaultProviderSchema>;
