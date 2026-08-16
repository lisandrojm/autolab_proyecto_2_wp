import { create } from "zustand";
import { persist } from "zustand/middleware";
import { companiesAPI, type Company } from "../api/companies";
import { useClientContextStore } from "./clientContextStore";

/**
 * Contexto Empresa: la empleadora desde la que se está trabajando.
 *
 * Es el mismo patrón que el contexto Cliente ([clientContextStore]), y no es una decisión de UI: es
 * cómo lo modela ARCA. El organismo tiene DOS secciones —"Datos del Empleador" y "Relaciones
 * Laborales"— y todo lo de la primera es **por CUIT**: las obras sociales relacionadas a la
 * actividad, los domicilios de explotación con sus actividades, los convenios colectivos. El
 * nomenclador es universal (494 obras sociales, miles de convenios, 2.350 actividades); cada
 * empleadora REGISTRA el subconjunto que le aplica.
 *
 * Sin este contexto, dos cosas se rompen solas:
 *
 *  - **El TXT sale mezclado.** El archivo de alta masiva se sube logueado como UN CUIT. Generarlo
 *    desde una grilla con contratos de varias empleadoras produce un archivo rechazado o, peor,
 *    altas cargadas bajo la empleadora equivocada. Dentro del contexto de FZERO se genera el archivo
 *    de FZERO, y el bug deja de existir.
 *  - **"Faltan N datos" se repite por contrato.** La configuración de la empleadora es una sola y
 *    alcanza a todos sus contratos; hoy se descubre abriendo un modal por fila.
 *
 * ## Un solo eje activo a la vez
 *
 * Cliente y Empresa son EXCLUYENTES, y no por prolijidad: **no se cruzan en ningún lado de la app**.
 * Las pantallas del cliente (Información, Proyectos, Usuarios) no filtran por empleadora, y las de la
 * empresa (ARCA, Contratos) no filtran por cliente. Y el dato tampoco se cruza: un proyecto de
 * TELECOM puede tener contratos de DOS empleadoras a la vez.
 *
 * Tenerlos activos juntos insinuaba una intersección inexistente —"lo de TELECOM que emplea
 * FZERO"—, y con una empresa elegida parecía que la vista del cliente estaba recortada por ella.
 * Son dos MIRADAS sobre los mismos datos, no dos filtros que se combinan.
 */
interface EmpresaContextState {
  selectedEmpresa: Company | null;
  setSelectedEmpresa: (empresa: Company | null) => void;
  clearSelectedEmpresa: () => void;
  /** Relee la empleadora del servidor para que el contexto no quede con datos viejos tras editarla. */
  refreshSelectedEmpresa: () => Promise<Company | null>;
}

export const useEmpresaContextStore = create<EmpresaContextState>()(
  persist(
    (set, get) => ({
      selectedEmpresa: null,

      setSelectedEmpresa: (empresa) => {
        // Elegir una empleadora sale del eje Cliente: son miradas alternativas, no acumulables.
        if (empresa) useClientContextStore.getState().clearSelectedClient();
        set({ selectedEmpresa: empresa });
      },

      clearSelectedEmpresa: () => set({ selectedEmpresa: null }),

      refreshSelectedEmpresa: async () => {
        const { selectedEmpresa } = get();
        if (!selectedEmpresa?._id) return null;
        try {
          // `/companies` no tiene GET por id: se relee la lista y se busca. Son pocas empresas y el
          // contexto se refresca solo al guardar, así que no justifica un endpoint nuevo.
          const empresa = (await companiesAPI.list()).find((c) => c._id === selectedEmpresa._id) || null;
          // Si dejó de existir, se limpia el contexto en vez de dejar navegando una empresa fantasma.
          set({ selectedEmpresa: empresa });
          return empresa;
        } catch {
          return selectedEmpresa;
        }
      },
    }),
    {
      name: "empresa-context",
      partialize: (state) => ({ selectedEmpresa: state.selectedEmpresa }),
    },
  ),
);

/**
 * El otro lado de la exclusión: activar un cliente sale del eje Empresa.
 *
 * Va como suscripción y no como llamada en cada lugar porque el cliente se activa desde media docena
 * de puntos —el selector, la ficha, Proyectos, Usuarios— y alcanzaba con olvidarse de uno para que
 * los dos ejes volvieran a convivir. La regla vive en un solo lugar y no depende de la disciplina de
 * cada llamador.
 *
 * Solo reacciona cuando un cliente pasa a estar ELEGIDO: limpiarlo no toca la empresa, y el guard
 * evita que las dos limpiezas se llamen entre sí.
 */
useClientContextStore.subscribe((state, prev) => {
  if (state.selectedClient && state.selectedClient !== prev.selectedClient) {
    useEmpresaContextStore.getState().clearSelectedEmpresa();
  }
});

// Los dos ejes se persisten por separado, así que una sesión anterior a esta regla puede volver con
// los dos puestos. Se desempata una sola vez al arrancar y queda el Cliente, que es el eje del
// trabajo diario. Entrar directo por una URL de empresa igual funciona: el layout la vuelve a
// activar, y eso sale del eje Cliente.
if (useClientContextStore.getState().selectedClient && useEmpresaContextStore.getState().selectedEmpresa) {
  useEmpresaContextStore.getState().clearSelectedEmpresa();
}
