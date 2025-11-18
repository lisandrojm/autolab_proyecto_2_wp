import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clientsAPI, type Client } from "../api/clients";

interface Project {
  _id: string;
  name: string;
  description?: string;
  clientId: string;
  campaigns: string[];
}

interface ClientContextState {
  selectedClient: Client | null;
  selectedProject: Project | null;
  setSelectedClient: (client: Client | null) => void;
  setSelectedProject: (project: Project | null) => void;
  clearSelectedClient: () => void;
  clearSelectedProject: () => void;
  clearAll: () => void;
  ensureSelectedClient: () => Promise<Client | null>;
}

export const useClientContextStore = create<ClientContextState>()(
  persist(
    (set, get) => ({
      selectedClient: null,
      selectedProject: null,

      setSelectedClient: (client) => set({ selectedClient: client }),

      setSelectedProject: (project) => set({ selectedProject: project }),

      clearSelectedClient: () => set({ selectedClient: null }),

      clearSelectedProject: () => set({ selectedProject: null }),

      clearAll: () => set({ selectedClient: null, selectedProject: null }),

      ensureSelectedClient: async () => {
        const { selectedClient } = get();

        if (selectedClient) {
          return selectedClient;
        }

        try {
          // Intentar cargar cliente propio (para usuarios cliente)
          const response = await clientsAPI.list({ limit: 1 });
          if (response.clients.length > 0) {
            const client = response.clients[0];
            set({ selectedClient: client });
            return client;
          }
        } catch (error) {
          console.error("Error ensuring selected client:", error);
        }

        return null;
      },
    }),
    {
      name: "client-context",
      partialize: (state) => ({ 
        selectedClient: state.selectedClient,
        selectedProject: state.selectedProject 
      }),
    }
  )
);