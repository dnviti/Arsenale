import { create } from 'zustand';
import {
  GatewayData, GatewayInput, GatewayUpdate, SshKeyPairData,
  listGateways, createGateway as createGatewayApi,
  updateGateway as updateGatewayApi, deleteGateway as deleteGatewayApi,
  getSshKeyPair, generateSshKeyPair as generateSshKeyPairApi,
  rotateSshKeyPair as rotateSshKeyPairApi,
} from '../api/gateway.api';

interface GatewayState {
  gateways: GatewayData[];
  loading: boolean;
  sshKeyPair: SshKeyPairData | null;
  sshKeyLoading: boolean;

  fetchGateways: () => Promise<void>;
  createGateway: (data: GatewayInput) => Promise<GatewayData>;
  updateGateway: (id: string, data: GatewayUpdate) => Promise<void>;
  deleteGateway: (id: string) => Promise<void>;
  fetchSshKeyPair: () => Promise<void>;
  generateSshKeyPair: () => Promise<SshKeyPairData>;
  rotateSshKeyPair: () => Promise<SshKeyPairData>;
  reset: () => void;
}

export const useGatewayStore = create<GatewayState>((set) => ({
  gateways: [],
  loading: false,
  sshKeyPair: null,
  sshKeyLoading: false,

  fetchGateways: async () => {
    set({ loading: true });
    try {
      const gateways = await listGateways();
      set({ gateways, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createGateway: async (data) => {
    const gateway = await createGatewayApi(data);
    const gateways = await listGateways();
    set({ gateways });
    return gateway;
  },

  updateGateway: async (id, data) => {
    const updated = await updateGatewayApi(id, data);
    set((state) => ({
      gateways: state.gateways.map((g) => (g.id === id ? { ...g, ...updated } : g)),
    }));
  },

  deleteGateway: async (id) => {
    await deleteGatewayApi(id);
    set((state) => ({
      gateways: state.gateways.filter((g) => g.id !== id),
    }));
  },

  fetchSshKeyPair: async () => {
    set({ sshKeyLoading: true });
    try {
      const sshKeyPair = await getSshKeyPair();
      set({ sshKeyPair, sshKeyLoading: false });
    } catch {
      set({ sshKeyPair: null, sshKeyLoading: false });
    }
  },

  generateSshKeyPair: async () => {
    const sshKeyPair = await generateSshKeyPairApi();
    set({ sshKeyPair });
    return sshKeyPair;
  },

  rotateSshKeyPair: async () => {
    const sshKeyPair = await rotateSshKeyPairApi();
    set({ sshKeyPair });
    return sshKeyPair;
  },

  reset: () => set({ gateways: [], loading: false, sshKeyPair: null, sshKeyLoading: false }),
}));
