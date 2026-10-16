import axios from "./axiosConfig";
import { invalidateRefCache } from "../utils/refCache";

/** Clave con la que las pantallas cachean `contratosAPI.list()` (la usa Gestionar Equipo desde antes); las escrituras la invalidan. */
export const CLAVE_CACHE_TIPOS_CONTRATO = "contratos:all";


import type { ContratoItem } from "@compartido/arca/tiposArca";
export type { ContratoItem } from "@compartido/arca/tiposArca";

export interface ContratoInput {
  nombre: string;
  cantidadJornadas?: string | number;
  multiplicadorDiario?: string | number;
  esTiempoIndeterminado?: boolean;
  modoFechas?: "periodo" | "dias";
  horasPorJornada?: string | number;
  diasPorSemana?: string | number;
  requiereFirma?: boolean;
  requiereFirmaRelease?: boolean;
  requiereFirmaAlta?: boolean;
  releaseIds?: string[];
  isActive?: boolean;
  afipModalidadContrato?: string;
  afipTipoServicio?: string;
  afipActividad?: string;
  afipModalidadLiquidacion?: string;
  generaAlta?: boolean;
}

class ContratosAPI {
  async list(): Promise<ContratoItem[]> {
    const { data } = await axios.get("/contratos");
    return data;
  }

  async create(payload: ContratoInput): Promise<ContratoItem> {
    const { data } = await axios.post("/contratos", payload);
    invalidateRefCache(CLAVE_CACHE_TIPOS_CONTRATO);
    return data;
  }

  async update(id: string, payload: ContratoInput): Promise<ContratoItem> {
    const { data } = await axios.put(`/contratos/${id}`, payload);
    invalidateRefCache(CLAVE_CACHE_TIPOS_CONTRATO);
    return data;
  }

  async remove(id: string): Promise<{ message: string }> {
    const { data } = await axios.delete(`/contratos/${id}`);
    invalidateRefCache(CLAVE_CACHE_TIPOS_CONTRATO);
    return data;
  }
}

export const contratosAPI = new ContratosAPI();

/**
 * LOS TIPOS DE CONTRATO QUE SE OFRECEN PARA ELEGIR: sólo los activos.
 *
 * El catálogo entero se sigue usando para mostrar el nombre de un contrato que ya existe; esto es para
 * los selectores. El que ya está elegido se conserva aunque esté inactivo (`elegidoId`): sacarlo de la
 * lista haría saltar el select a otro valor al editar un contrato o una plantilla de antes.
 */
/**
 * LOS RELEASES QUE LE TOCAN A UN TIPO DE CONTRATO («Plantilla de Release asignada», 16/10/2026).
 *
 * Los elegidos en su ABM; si no eligió ninguno —o no se sabe el tipo—, todos los que vienen, como
 * antes de que existiera la asignación. Va antes de cualquier otro filtro (firma, custom): esos
 * deciden qué se hace con los releases del tipo, éste decide cuáles son.
 */
export const releasesDelTipo = <R extends { _id: string }>(releases: R[], tipo: { data?: { releaseIds?: string[] } } | null | undefined): R[] => {
  const ids = tipo?.data?.releaseIds;
  if (!Array.isArray(ids) || ids.length === 0) return releases;
  const elegidos = new Set(ids.map(String));
  return releases.filter((r) => elegidos.has(String(r._id)));
};

export const tiposDeContratoActivos = <T extends { _id: string; isActive?: boolean }>(lista: T[], elegidoId?: string | null): T[] =>
  lista.filter((c) => c.isActive !== false || (!!elegidoId && c._id === elegidoId));
