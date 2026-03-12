import { Response } from 'express';
import type { AuthRequest } from '../types';
import { assertAuthenticated } from '../types';
import * as ldapService from '../services/ldap.service';
import { config } from '../config';

export async function getStatus(_req: AuthRequest, res: Response) {
  res.json({
    enabled: ldapService.isEnabled(),
    providerName: config.ldap.providerName,
    serverUrl: config.ldap.serverUrl ? config.ldap.serverUrl.replace(/\/\/.*:.*@/, '//***:***@') : '',
    baseDn: config.ldap.baseDn,
    syncEnabled: config.ldap.syncEnabled,
    syncCron: config.ldap.syncCron,
    autoProvision: config.ldap.autoProvision,
  });
}

export async function testConnection(_req: AuthRequest, res: Response) {
  assertAuthenticated(_req);
  const result = await ldapService.testConnection();
  res.json(result);
}

export async function triggerSync(_req: AuthRequest, res: Response) {
  assertAuthenticated(_req);
  const result = await ldapService.syncUsers();
  res.json(result);
}
