import { create } from 'zustand';
import { ConnectionData, listConnections } from '../api/connections.api';
import { FolderData, listFolders } from '../api/folders.api';

export type Folder = FolderData;

interface ConnectionsState {
  ownConnections: ConnectionData[];
  sharedConnections: ConnectionData[];
  folders: Folder[];
  loading: boolean;
  fetchConnections: () => Promise<void>;
  fetchFolders: () => Promise<void>;
}

export const useConnectionsStore = create<ConnectionsState>((set) => ({
  ownConnections: [],
  sharedConnections: [],
  folders: [],
  loading: false,

  fetchConnections: async () => {
    set({ loading: true });
    try {
      const [connData, foldersData] = await Promise.all([
        listConnections(),
        listFolders(),
      ]);
      set({
        ownConnections: connData.own,
        sharedConnections: connData.shared,
        folders: foldersData,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  fetchFolders: async () => {
    try {
      const folders = await listFolders();
      set({ folders });
    } catch {}
  },
}));
