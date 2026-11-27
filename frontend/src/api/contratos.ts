import axios from "./axiosConfig";
import { invalidateRefCache } from "../utils/refCache";

/** Clave con la que las pantallas cachean `contratosAPI.list()` (la usa Gestionar Equipo desde antes); las escrituras la invalidan. */
export const CLAVE_CACHE_TIPOS_CONTRATO = "contratos:all";


import type { ContratoItem } from "@compartido/arca/tiposArca";
export type { ContratoItem } from "@compartido/arca/tiposArca";

export interface ContratoInput {
  nombre: string;
  /** En qué casos se usa: ayudamemoria para quien lo elige. */
  descripcion?: string;
  /** Cambio de franco: todos los importes en cero. */
  importesEnCero?: boolean;
  /** Formas de pago habilitadas y la predeterminada (una de ellas). */
  formasPagoIds?: string[];
  formaPagoDefaultId?: string | null;
  cantidadJornadas?: string | number;
  multiplicadorDiario?: string | number;
  esTiempoIndeterminado?: boolean;
  modoFechas?: "periodo" | "dias";
  horasPorJornada?: string | number;
  diasPorSemana?: string | number;
  requiereFirma?: boolean;
  requiereFirmaRelease?: boolean;
  requiereFirmaAlta?: boolean;
  /** «Valida el CUIT en ARCA antes de Contratos» (sólo con constancia de CUIT). */
  validaCuit?: boolean;
  isActive?: boolean;
  afipModalidadContrato?: string;
  afipTipoServicio?: string;
  afipActividad?: string;
  afipModalidadLiquidacion?: string;
  generaAlta?: boolean;
}

class ContratosAPI {
  /** En el orden manual de Configuración → Contratos (`orden`), que es el que ven todos los selectores. */
  async list(): Promise<ContratoItem[]> {
    const { data } = await axios.get("/contratos");
    return data;
  }

  /** Guarda el orden manual de una vez (Ordenar en Configuración → Contratos → Tipos). */
  async reorder(items: { id: string; orden: number }[]): Promise<void> {
    await axios.patch("/contratos/reorder", { items });
    invalidateRefCache(CLAVE_CACHE_TIPOS_CONTRATO);
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
 * Qué releases lleva un tipo de contrato: la regla vive en `@compartido/pendienteDeFirma` desde el
 * 27/11/2026 (la comparte la generación automática del server). Se re-exporta con el camino de siempre.
 */
export { releaseEsDelTipo, releaseSinContratos, releasesDelTipo } from "@compartido/pendienteDeFirma";

export const tiposDeContratoActivos = <T extends { _id: string; isActive?: boolean }>(lista: T[], elegidoId?: string | null): T[] =>
  lista.filter((c) => c.isActive !== false || (!!elegidoId && c._id === elegidoId));
