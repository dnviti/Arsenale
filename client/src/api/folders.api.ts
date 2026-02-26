import api from './client';

export interface FolderInput {
  name: string;
  parentId?: string;
}

export interface FolderUpdate {
  name?: string;
  parentId?: string | null;
}

export interface FolderData {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export async function listFolders(): Promise<FolderData[]> {
  const res = await api.get('/folders');
  return res.data;
}

export async function createFolder(data: FolderInput): Promise<FolderData> {
  const res = await api.post('/folders', data);
  return res.data;
}

export async function updateFolder(
  id: string,
  data: FolderUpdate
): Promise<FolderData> {
  const res = await api.put(`/folders/${id}`, data);
  return res.data;
}

export async function deleteFolder(id: string): Promise<{ deleted: boolean }> {
  const res = await api.delete(`/folders/${id}`);
  return res.data;
}
