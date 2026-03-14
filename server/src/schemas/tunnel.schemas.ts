import { z } from 'zod';

export const enableTunnelSchema = z.object({
  enabled: z.boolean(),
});
export type EnableTunnelInput = z.infer<typeof enableTunnelSchema>;
