import prisma, { KeystrokePolicyAction } from '../lib/prisma';

export interface CreateKeystrokePolicyInput {
  tenantId: string;
  name: string;
  description?: string;
  action?: KeystrokePolicyAction;
  regexPatterns?: string[];
  enabled?: boolean;
}

export interface UpdateKeystrokePolicyInput {
  name?: string;
  description?: string | null;
  action?: KeystrokePolicyAction;
  regexPatterns?: string[];
  enabled?: boolean;
}

export async function listPolicies(tenantId: string) {
  return prisma.keystrokePolicy.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getPolicy(tenantId: string, policyId: string) {
  return prisma.keystrokePolicy.findFirst({
    where: { id: policyId, tenantId },
  });
}

export async function createPolicy(input: CreateKeystrokePolicyInput) {
  // Validate regex patterns before saving
  if (input.regexPatterns) {
    for (const pattern of input.regexPatterns) {
      try {
        new RegExp(pattern, 'i');
      } catch {
        throw Object.assign(new Error(`Invalid regex pattern: ${pattern}`), { statusCode: 400 });
      }
    }
  }

  return prisma.keystrokePolicy.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      description: input.description ?? null,
      action: input.action ?? 'ALERT_ONLY',
      regexPatterns: input.regexPatterns ?? [],
      enabled: input.enabled ?? true,
    },
  });
}

export async function updatePolicy(tenantId: string, policyId: string, input: UpdateKeystrokePolicyInput) {
  // Validate regex patterns before saving
  if (input.regexPatterns) {
    for (const pattern of input.regexPatterns) {
      try {
        new RegExp(pattern, 'i');
      } catch {
        throw Object.assign(new Error(`Invalid regex pattern: ${pattern}`), { statusCode: 400 });
      }
    }
  }

  return prisma.keystrokePolicy.update({
    where: { id: policyId, tenantId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.action !== undefined && { action: input.action }),
      ...(input.regexPatterns !== undefined && { regexPatterns: input.regexPatterns }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
    },
  });
}

export async function deletePolicy(tenantId: string, policyId: string) {
  return prisma.keystrokePolicy.delete({
    where: { id: policyId, tenantId },
  });
}
