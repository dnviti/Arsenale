import { z } from 'zod';

export const createKeystrokePolicySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  action: z.enum(['BLOCK_AND_TERMINATE', 'ALERT_ONLY']).optional(),
  regexPatterns: z.array(z.string().min(1).max(500)).max(50).optional(),
  enabled: z.boolean().optional(),
});

export const updateKeystrokePolicySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  action: z.enum(['BLOCK_AND_TERMINATE', 'ALERT_ONLY']).optional(),
  regexPatterns: z.array(z.string().min(1).max(500)).max(50).optional(),
  enabled: z.boolean().optional(),
});
