import { useQuery } from "@tanstack/react-query";
import { queryClient, claves, FRESCURA_CATALOGO } from "../lib/queryClient";
import { areasAPI } from "../api/areas";
import { shiftsAPI } from "../api/shifts";
import { companiesAPI } from "../api/companies";
import { categoriaSatAPI } from "../api/categoriasSat";
import { roleFrameAPI } from "../api/roleFrames";
import { contratoFrameAPI } from "../api/contratosFrame";
import { contratosAPI } from "../api/contratos";
import { clientsAPI } from "../api/clients";
import { infoAPI } from "../api/info";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LOS CATÁLOGOS: SE PIDEN UNA VEZ POR SESIÓN, NO UNA VEZ POR PANTALLA
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Áreas, turnos, convenios, categorías, empresas y los `info?type=*` son listas que cambian cada
 * varios meses y pesan cientos de kilobytes juntas. Se bajaban de nuevo en CADA montaje de CADA
 * pantalla, y a veces dos veces en la misma pantalla porque dos componentes distintos las pedían por
 * su cuenta.
 *
 * Con una clave compartida y media hora de frescura, la segunda pantalla que las necesita no hace
 * ninguna request: usa lo que ya está. Y si dos componentes preguntan a la vez, React Query manda una
 * sola consulta.
 *
 * Todos los hooks devuelven `[]` mientras cargan: ninguna pantalla tiene que distinguir «vacío» de
 * «todavía no llegó» para dibujar un `<select>`.
 */

const catalogo = { staleTime: FRESCURA_CATALOGO } as const;

export const useAreas = () => useQuery({ queryKey: claves.areas, queryFn: () => areasAPI.listAll(), staleTime: FRESCURA_CATALOGO, initialData: [] });

export const useTurnos = () => useQuery({ queryKey: claves.turnos, queryFn: () => shiftsAPI.getAll(), staleTime: FRESCURA_CATALOGO, initialData: [] });

export const useEmpresas = () => useQuery({ queryKey: claves.empresas, queryFn: () => companiesAPI.list(), staleTime: FRESCURA_CATALOGO, initialData: [] });

export const useCategoriasSat = () => useQuery({ queryKey: claves.categoriasSat, queryFn: () => categoriaSatAPI.list(), staleTime: FRESCURA_CATALOGO, initialData: [] });

export const useRolesFrame = () => useQuery({ queryKey: claves.rolesFrame, queryFn: () => roleFrameAPI.list(), staleTime: FRESCURA_CATALOGO, initialData: [] });

export const useContratosFrame = () => useQuery({ queryKey: claves.contratosFrame, queryFn: () => contratoFrameAPI.list(), staleTime: FRESCURA_CATALOGO, initialData: [] });

export const useContratos = () => useQuery({ queryKey: claves.contratos, queryFn: () => contratosAPI.list(), staleTime: FRESCURA_CATALOGO, initialData: [] });

export const useClientes = () => useQuery({ queryKey: claves.clientes, queryFn: () => clientsAPI.listAll(), staleTime: FRESCURA_CATALOGO, initialData: [] });

/** Un catálogo de `infos` por tipo: sede, estado-empleado, contrato, género, banco… */
export const useInfo = (tipo: string) => useQuery({ queryKey: claves.info(tipo), queryFn: () => infoAPI.listByType(tipo), staleTime: FRESCURA_CATALOGO, initialData: [] });

/**
 * Los catálogos que se van a necesitar sí o sí, pedidos apenas se entra.
 *
 * Se llama DESPUÉS del login, no en el arranque de la app: sin sesión, cada uno de estos devuelve
 * 401. Es «pedir temprano», no «pedir de más»: son exactamente los que las pantallas de Proyectos y
 * de Equipo abren después, y para cuando alguien navega ya están.
 *
 * `prefetchQuery` no rompe si alguno falla: la pantalla que lo necesite lo va a volver a pedir.
 */
export const precargarCatalogos = (): void => {
  const precargas: Array<{ queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }> = [
    { queryKey: claves.areas, queryFn: () => areasAPI.listAll() },
    { queryKey: claves.turnos, queryFn: () => shiftsAPI.getAll() },
    { queryKey: claves.info("sede"), queryFn: () => infoAPI.listByType("sede") },
    { queryKey: claves.info("estado-empleado"), queryFn: () => infoAPI.listByType("estado-empleado") },
    { queryKey: claves.info("contrato"), queryFn: () => infoAPI.listByType("contrato") },
  ];
  for (const p of precargas) void queryClient.prefetchQuery({ ...p, ...catalogo });
};
