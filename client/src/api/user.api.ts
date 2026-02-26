import api from './client';

export interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  avatarData: string | null;
  createdAt: string;
}

export async function getProfile(): Promise<UserProfile> {
  const res = await api.get('/user/profile');
  return res.data;
}

export async function updateProfile(data: { username?: string; email?: string }): Promise<UserProfile> {
  const res = await api.put('/user/profile', data);
  return res.data;
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<{ success: boolean }> {
  const res = await api.put('/user/password', { oldPassword, newPassword });
  return res.data;
}

export async function uploadAvatar(avatarData: string): Promise<{ id: string; avatarData: string }> {
  const res = await api.post('/user/avatar', { avatarData });
  return res.data;
}
