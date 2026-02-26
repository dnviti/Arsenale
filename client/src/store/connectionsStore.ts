import { create } from 'zustand';
import { ConnectionData, listConnections, toggleFavorite as toggleFavoriteApi } from '../api/connections.api';
import { FolderData, listFolders } from '../api/folders.api';

export type Folder = FolderData;

interface ConnectionsState {
  ownConnections: ConnectionData[];
  sharedConnections: ConnectionData[];
  folders: Folder[];
  loading: boolean;
  fetchConnections: () => Promise<void>;
  fetchFolders: () => Promise<void>;
  toggleFavorite: (connectionId: string) => Promise<void>;
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

  toggleFavorite: async (connectionId) => {
    try {
      const result = await toggleFavoriteApi(connectionId);
      set((state) => ({
        ownConnections: state.ownConnections.map((c) =>
          c.id === result.id ? { ...c, isFavorite: result.isFavorite } : c
        ),
      }));
    } catch {
      // Silently fail; the star just does not toggle
    }
  },
}));
