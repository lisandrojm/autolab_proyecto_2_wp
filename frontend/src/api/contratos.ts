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
/** ¿Este release está asignado EXPLÍCITAMENTE a este tipo de contrato (`Release.contratoIds`)? */
export const releaseEsDelTipo = (release: { contratoIds?: string[] }, tipoId: string | null | undefined): boolean =>
  !!tipoId && Array.isArray(release.contratoIds) && release.contratoIds.map(String).includes(String(tipoId));

/** Un release sin contratos asignados: sólo lo llevan los tipos que no eligieron ninguno. */
export const releaseSinContratos = (release: { contratoIds?: string[] }): boolean => !Array.isArray(release.contratoIds) || release.contratoIds.length === 0;

/**
 * LOS RELEASES QUE LE TOCAN A UN TIPO DE CONTRATO (se asignan desde el release, 16/10/2026):
 *  - si el tipo tiene releases ASIGNADOS, sólo esos («que aparezca sólo el que se eligió»);
 *  - si no tiene ninguno, los que no están asignados a ningún contrato, que es como estaban todos antes
 *    de poder asignarlos: así los tipos que nadie configuró siguen igual.
 * Sin tipo conocido, todos los que vienen, como antes. Va antes de cualquier otro filtro (firma,
 * custom): esos deciden qué se hace con los releases del tipo; éste decide cuáles son.
 */
export const releasesDelTipo = <R extends { _id: string; contratoIds?: string[] }>(releases: R[], tipo: { _id?: string } | null | undefined, universo?: { contratoIds?: string[] }[]): R[] => {
  if (!tipo?._id) return releases;
  // Si el tipo tiene asignados se decide con TODOS los releases (`universo`), no con la lista ya filtrada:
  // un asignado que no va a firma igual hace que el tipo deje de llevar los generales.
  const tieneAsignados = (universo ?? releases).some((r) => releaseEsDelTipo(r, tipo._id));
  return releases.filter((r) => (tieneAsignados ? releaseEsDelTipo(r, tipo._id) : releaseSinContratos(r)));
};

export const tiposDeContratoActivos = <T extends { _id: string; isActive?: boolean }>(lista: T[], elegidoId?: string | null): T[] =>
  lista.filter((c) => c.isActive !== false || (!!elegidoId && c._id === elegidoId));
