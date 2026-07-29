import { create } from "zustand";
import { infoAPI, InfoItem } from "../api/info";

/**
 * Catálogo de estados del contrato (infos type "estado-empleado") con su color y su nombre
 * dentro del contrato, tal como los configura el ABM de Configuración → Estados.
 *
 * Lo consume `EstadoBadge`, que aparece en muchas pantallas: para no tener que cargar el catálogo
 * en cada una, el badge dispara `ensureLoaded()` y la carga se hace una sola vez por sesión.
 */

let enVuelo: Promise<void> | null = null;

interface EstadoCatalogState {
  estados: InfoItem[];
  cargado: boolean;
  /** Reemplaza el catálogo (lo usa el ABM tras crear/editar/borrar, para refrescar los badges). */
  setEstados: (estados: InfoItem[]) => void;
  ensureLoaded: () => void;
}

export const useEstadoCatalogStore = create<EstadoCatalogState>((set, get) => ({
  estados: [],
  cargado: false,
  setEstados: (estados) => set({ estados, cargado: true }),
  ensureLoaded: () => {
    if (get().cargado || enVuelo) return;
    enVuelo = infoAPI
      .listEstados()
      .then((estados) => set({ estados, cargado: true }))
      .catch(() => {
        /* sin catálogo, los badges usan los colores por defecto */
      })
      .finally(() => {
        enVuelo = null;
      });
  },
}));
