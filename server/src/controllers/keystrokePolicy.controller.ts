import { Response } from 'express';
import { TenantRequest, assertTenantAuthenticated, AuthRequest } from '../types';
import * as keystrokePolicyService from '../services/keystrokePolicy.service';

export async function listPolicies(req: AuthRequest, res: Response) {
  assertTenantAuthenticated(req);
  const tReq = req as unknown as TenantRequest;
  const policies = await keystrokePolicyService.listPolicies(tReq.user.tenantId);
  res.json(policies);
}

export async function getPolicy(req: AuthRequest, res: Response) {
  assertTenantAuthenticated(req);
  const tReq = req as unknown as TenantRequest;
  const policyId = req.params.policyId as string;
  const policy = await keystrokePolicyService.getPolicy(tReq.user.tenantId, policyId);
  if (!policy) return res.status(404).json({ message: 'Policy not found' });
  res.json(policy);
}

export async function createPolicy(req: AuthRequest, res: Response) {
  assertTenantAuthenticated(req);
  const tReq = req as unknown as TenantRequest;
  const policy = await keystrokePolicyService.createPolicy({
    tenantId: tReq.user.tenantId,
    name: req.body.name,
    description: req.body.description,
    action: req.body.action,
    regexPatterns: req.body.regexPatterns,
    enabled: req.body.enabled,
  });
  res.status(201).json(policy);
}

export async function updatePolicy(req: AuthRequest, res: Response) {
  assertTenantAuthenticated(req);
  const tReq = req as unknown as TenantRequest;
  const policyId = req.params.policyId as string;
  const policy = await keystrokePolicyService.updatePolicy(
    tReq.user.tenantId,
    policyId,
    {
      name: req.body.name,
      description: req.body.description,
      action: req.body.action,
      regexPatterns: req.body.regexPatterns,
      enabled: req.body.enabled,
    },
  );
  res.json(policy);
}

export async function deletePolicy(req: AuthRequest, res: Response) {
  assertTenantAuthenticated(req);
  const tReq = req as unknown as TenantRequest;
  const policyId = req.params.policyId as string;
  await keystrokePolicyService.deletePolicy(tReq.user.tenantId, policyId);
  res.status(204).end();
}
