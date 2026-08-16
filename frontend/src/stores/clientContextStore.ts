import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type Client } from "../api/clients";

/**
 * Cuál es la ficha de cliente abierta.
 *
 * OJO con el nombre del archivo: NO es un contexto en el sentido de filtro global. Nada en la app
 * lee esto para acotar una consulta — las pantallas del cliente (`/clients/:clientId/...`) resuelven
 * de quién son desde la URL con `useParams`, y las globales listan todo. Acá solo vive qué ficha
 * está abierta, para el chip del menú y sus links. Ver `components/context/FichasHeader.tsx`.
 */
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
}

export const useClientContextStore = create<ClientContextState>()(
  persist(
    (set) => ({
      selectedClient: null,
      selectedProject: null,

      setSelectedClient: (client) => set({ selectedClient: client }),

      setSelectedProject: (project) => set({ selectedProject: project }),

      clearSelectedClient: () => set({ selectedClient: null }),

      clearSelectedProject: () => set({ selectedProject: null }),

      clearAll: () => set({ selectedClient: null, selectedProject: null }),
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