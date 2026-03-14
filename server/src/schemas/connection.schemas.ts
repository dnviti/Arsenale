import { z } from 'zod';
import { sshTerminalConfigSchema, rdpSettingsSchema, vncSettingsSchema, dlpPolicySchema } from './common.schemas';

export const createConnectionSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['RDP', 'SSH', 'VNC']),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(),
  domain: z.string().optional(),
  credentialSecretId: z.string().uuid().optional(),
  externalVaultProviderId: z.string().uuid().nullable().optional(),
  externalVaultPath: z.string().max(500).nullable().optional(),
  description: z.string().optional(),
  folderId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  enableDrive: z.boolean().optional(),
  gatewayId: z.string().uuid().nullable().optional(),
  sshTerminalConfig: sshTerminalConfigSchema.optional(),
  rdpSettings: rdpSettingsSchema.optional(),
  vncSettings: vncSettingsSchema.optional(),
  dlpPolicy: dlpPolicySchema.nullable().optional(),
  defaultCredentialMode: z.enum(['saved', 'domain', 'prompt']).nullable().optional(),
}).superRefine((data, ctx) => {
  // Must provide exactly one credential source
  const sources = [
    !!data.credentialSecretId,
    !!data.externalVaultProviderId,
    data.username !== undefined || data.password !== undefined,
  ].filter(Boolean).length;

  if (sources === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either credentialSecretId, externalVaultProviderId, or both username and password must be provided',
    });
  }

  if (sources > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Only one credential source may be specified: credentialSecretId, externalVaultProviderId, or inline username/password',
    });
  }

  // externalVaultPath is required when externalVaultProviderId is set
  if (data.externalVaultProviderId && (!data.externalVaultPath || data.externalVaultPath.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'externalVaultPath is required when externalVaultProviderId is provided',
      path: ['externalVaultPath'],
    });
  }
});

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;

export const updateConnectionSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['RDP', 'SSH', 'VNC']).optional(),
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  domain: z.string().optional(),
  credentialSecretId: z.string().uuid().nullable().optional(),
  externalVaultProviderId: z.string().uuid().nullable().optional(),
  externalVaultPath: z.string().max(500).nullable().optional(),
  description: z.string().nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
  enableDrive: z.boolean().optional(),
  gatewayId: z.string().uuid().nullable().optional(),
  sshTerminalConfig: sshTerminalConfigSchema.nullable().optional(),
  rdpSettings: rdpSettingsSchema.nullable().optional(),
  vncSettings: vncSettingsSchema.nullable().optional(),
  dlpPolicy: dlpPolicySchema.nullable().optional(),
  defaultCredentialMode: z.enum(['saved', 'domain', 'prompt']).nullable().optional(),
});

export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;
