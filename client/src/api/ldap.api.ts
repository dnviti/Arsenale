import api from './client';

export interface LdapStatus {
  enabled: boolean;
  providerName: string;
  serverUrl: string;
  baseDn: string;
  syncEnabled: boolean;
  syncCron: string;
  autoProvision: boolean;
}

export interface LdapTestResult {
  ok: boolean;
  message: string;
  userCount?: number;
  groupCount?: number;
}

export interface LdapSyncResult {
  created: number;
  updated: number;
  disabled: number;
  errors: string[];
}

export async function getLdapStatus(): Promise<LdapStatus> {
  const { data } = await api.get('/ldap/status');
  return data;
}

export async function testLdapConnection(): Promise<LdapTestResult> {
  const { data } = await api.post('/ldap/test');
  return data;
}

export async function triggerLdapSync(): Promise<LdapSyncResult> {
  const { data } = await api.post('/ldap/sync');
  return data;
}
