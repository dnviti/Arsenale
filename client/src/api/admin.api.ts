import api from './client';

export interface EmailStatus {
  provider: string;
  configured: boolean;
  from: string;
}

export async function getEmailStatus(): Promise<EmailStatus> {
  const { data } = await api.get<EmailStatus>('/admin/email/status');
  return data;
}

export async function sendTestEmail(
  to: string,
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post<{ success: boolean; message: string }>(
    '/admin/email/test',
    { to },
  );
  return data;
}
