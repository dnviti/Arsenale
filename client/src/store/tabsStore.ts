import { create } from 'zustand';
import { ConnectionData } from '../api/connections.api';
import { addRecentConnection } from '../utils/recentConnections';
import { useAuthStore } from './authStore';

export interface Tab {
  id: string;
  connection: ConnectionData;
  active: boolean;
}

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
  recentTick: number;
  openTab: (connection: ConnectionData) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  recentTick: 0,

  openTab: (connection) => {
    const { tabs } = get();

    // Track as recent
    const userId = useAuthStore.getState().user?.id;
    if (userId) {
      addRecentConnection(userId, connection.id);
    }

    // Check if already open
    const existing = tabs.find((t) => t.connection.id === connection.id);
    if (existing) {
      set((state) => ({ activeTabId: existing.id, recentTick: state.recentTick + 1 }));
      return;
    }

    const tabId = `tab-${connection.id}-${Date.now()}`;
    const newTab: Tab = { id: tabId, connection, active: true };
    set((state) => ({
      tabs: [...tabs.map((t) => ({ ...t, active: false })), newTab],
      activeTabId: tabId,
      recentTick: state.recentTick + 1,
    }));
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const filtered = tabs.filter((t) => t.id !== tabId);

    let newActiveId = activeTabId;
    if (activeTabId === tabId) {
      newActiveId = filtered.length > 0 ? filtered[filtered.length - 1].id : null;
    }

    set({
      tabs: filtered.map((t) => ({
        ...t,
        active: t.id === newActiveId,
      })),
      activeTabId: newActiveId,
    });
  },

  setActiveTab: (tabId) => {
    set((state) => ({
      activeTabId: tabId,
      tabs: state.tabs.map((t) => ({ ...t, active: t.id === tabId })),
    }));
  },
}));
