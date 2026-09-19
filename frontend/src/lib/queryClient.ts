import { QueryClient } from "@tanstack/react-query";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * EL CLIENTE DE CONSULTAS: UN SOLO LUGAR QUE DECIDE CUÁNDO SE VUELVE A PEDIR
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Hasta acá cada pantalla pedía lo suyo con `axios` adentro de un `useEffect`: sin caché, sin
 * deduplicación y sin cancelación. Eso hacía que el catálogo de áreas se bajara de nuevo en cada
 * navegación, que dos componentes de la misma pantalla pidieran lo mismo a la vez, y que
 * `<StrictMode>` —que en desarrollo corre cada efecto dos veces— duplicara todo otra vez.
 *
 * React Query resuelve las tres cosas sin que haya que acordarse: dos consultas con la misma clave
 * al mismo tiempo son UNA sola request, y lo que ya está fresco no se vuelve a pedir.
 *
 * TRES NIVELES DE FRESCURA, porque no todo cambia al mismo ritmo:
 */

/** Catálogos que cambian cada varios meses: áreas, turnos, convenios, categorías, empresas. */
export const FRESCURA_CATALOGO = 30 * 60 * 1000;
/** Datos de un proyecto o de su equipo: cambian cuando alguien edita, y eso pasa mientras se mira. */
export const FRESCURA_PROYECTO = 60 * 1000;
/** Lo que tiene que estar al día siempre: avisos, contadores de pendientes. */
export const FRESCURA_CORTA = 10 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /*
        El default es el de un dato de pantalla; los catálogos piden explícitamente el suyo. Se elige
        el conservador como default a propósito: si alguien agrega una consulta y no piensa en esto,
        que el error sea pedir de más y no mostrar algo viejo.
      */
      staleTime: FRESCURA_PROYECTO,
      /*
        `gcTime` largo: lo que se sacó de pantalla queda en memoria un rato. Volver de una ficha al
        listado tiene que pintar al instante con lo que ya se tenía y revalidar por detrás, no volver
        a poner el spinner.
      */
      gcTime: 10 * 60 * 1000,
      /*
        NO se refresca al volver a la pestaña. Con datos que cambian por acción de alguien —y no
        solos— eso sólo agrega una tanda de requests cada vez que uno vuelve del mail. Lo que sí
        refresca es reconectarse: ahí sí hubo un rato sin saber nada.
      */
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      /*
        Un reintento y basta. El interceptor de axios ya reintenta los 429 (ver `api/axiosConfig`), y
        encadenar los dos multiplica una tormenta de requests justo cuando el server está ahogado.
        Los 4xx no se reintentan nunca: un 403 no mejora por insistir.
      */
      retry: (cantidad, error: any) => {
        const estado = error?.response?.status;
        if (estado && estado >= 400 && estado < 500) return false;
        return cantidad < 1;
      },
    },
    mutations: { retry: false },
  },
});

/**
 * LAS CLAVES, EN UN SOLO LUGAR.
 *
 * Una clave escrita a mano en dos archivos son dos cachés distintos para el mismo dato —que es
 * exactamente lo que pasaba con `cachedFetch("areas:all")` versus el `areasAPI.listAll()` suelto de
 * otra pantalla—. Y para invalidar después de una mutación hay que poder nombrar lo que se invalida.
 */
export const claves = {
  areas: ["areas"] as const,
  turnos: ["turnos"] as const,
  empresas: ["empresas"] as const,
  categoriasSat: ["categorias-sat"] as const,
  rolesFrame: ["roles-frame"] as const,
  contratosFrame: ["contratos-frame"] as const,
  contratos: ["contratos"] as const,
  clientes: ["clientes"] as const,
  info: (tipo: string) => ["info", tipo] as const,
  centrosCosto: (busqueda: string, empresaId?: string) => ["centros-costo", busqueda, empresaId ?? ""] as const,
  centroCosto: (id: string) => ["centro-costo", id] as const,
  proyecto: (id: string) => ["proyecto", id] as const,
  proyectos: ["proyectos"] as const,
  equipo: (projectId: string, pagina: number, filtros: unknown) => ["equipo", projectId, pagina, filtros] as const,
  equipoLiviano: (projectId: string) => ["equipo-liviano", projectId] as const,
  contadoresAreaTurno: (projectId: string) => ["area-shift-counts", projectId] as const,
};
