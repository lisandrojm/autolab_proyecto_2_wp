/**
 * EL TRÁMITE IMPOSITIVO DE UN CONTRATO: alta temprana ante ARCA, o locación de servicios.
 *
 * Todo contrato declara uno de los dos. No es una preferencia: es cómo se declara el vínculo ante el
 * organismo, y de eso dependen el TXT que se genera, la bandeja donde cae el contrato y qué papeles
 * hay que juntar.
 *
 * ESTA ES LA FUENTE ÚNICA. El tipo y la lista de trámites estaban escritos por separado en
 * `ContractStatesTab` y en `ContractBulkTabs`, y ahora los necesitan también la solicitud de mobile,
 * la tabla de Solicitudes y el wizard de Agregar Miembro. Seis copias de dos strings terminan como
 * siempre: alguien agrega un caso en una y las otras cinco siguen diciendo otra cosa.
 *
 * LA CLAVE ES `alta_temprana_afip`, NO `alta_temprana_arca` — el organismo se llama ARCA y así se
 * muestra, pero el valor guardado en los estados sigue siendo el viejo y renombrarlo es una
 * migración de datos aparte. Ver `components/contratos/altaTemprana.ts`.
 */

import { InfoItem } from "../api/info";
import { ContratoFrameItem } from "../api/contratosFrame";

export type TipoImpositivo = "alta_temprana_afip" | "constancia_cuit";

export const TRAMITES_IMPOSITIVOS: { value: TipoImpositivo; label: string; descripcion: string }[] = [
  {
    value: "alta_temprana_afip",
    label: "Alta temprana de ARCA",
    descripcion: "Registro anticipado de la relación laboral en ARCA, que se hace ANTES de que la persona empiece a trabajar. Da de alta al trabajador en tiempo y forma.",
  },
  {
    value: "constancia_cuit",
    label: "Constancia de CUIT",
    descripcion: "Comprobante de inscripción que emite ARCA acreditando el CUIT y la situación fiscal de la persona.",
  },
];

export const esTipoImpositivo = (v: unknown): v is TipoImpositivo => TRAMITES_IMPOSITIVOS.some((t) => t.value === v);

/** Los dos estados impositivos configurados, en el orden del ABM. */
export const estadosImpositivos = (estados: InfoItem[]): InfoItem[] => estados.filter((e) => !!e.data?.esImpositivo);

/**
 * El estado impositivo que representa un trámite.
 *
 * Se exige `esImpositivo` además del trámite: un estado que dejó de ser impositivo puede conservar
 * el `tipoImpositivo` viejo en la base, y mirar solo el trámite lo daría por vigente.
 */
export const estadoImpositivoPorTipo = (estados: InfoItem[], tipo: TipoImpositivo | "" | undefined): InfoItem | null => (tipo ? estados.find((e) => !!e.data?.esImpositivo && e.data?.tipoImpositivo === tipo) || null : null);

/**
 * El estado impositivo vinculado a una PLANTILLA: es el estado con el que arranca un contrato nuevo.
 * A lo sumo hay uno por plantilla (lo exige el ABM de Estados). `undefined` = la plantilla no tiene.
 */
export const estadoImpositivoDePlantilla = (estados: InfoItem[], contratoFrameId: string | undefined): InfoItem | undefined =>
  contratoFrameId ? estadosImpositivos(estados).find((e) => (e.data?.contratoFrameIds || []).some((id) => String(id) === String(contratoFrameId))) : undefined;

/**
 * El trámite que declara un TIPO DE CONTRATO (el `Contrato`, no la Plantilla).
 *
 * El estado impositivo se vincula a la PLANTILLA (`contratoFrameIds`), no al tipo de contrato, así
 * que hay que ir por ese camino: tipo de contrato → sus plantillas → el estado impositivo que
 * alguna de ellas tenga vinculada. Un tipo sin plantillas, o con plantillas que ningún estado
 * impositivo reclama, devuelve `null` — que significa «todavía no está configurado», no «ninguno».
 */
export const tipoImpositivoDeContrato = (contratoId: string, contratoFrames: ContratoFrameItem[], estados: InfoItem[]): TipoImpositivo | null => {
  if (!contratoId) return null;
  const idsPlantillas = contratoFrames.filter((cf) => (typeof cf.contratoId === "object" ? cf.contratoId?._id : cf.contratoId) === contratoId).map((cf) => String(cf._id));
  if (idsPlantillas.length === 0) return null;

  const estado = estadosImpositivos(estados).find((e) => (e.data?.contratoFrameIds || []).some((id) => idsPlantillas.includes(String(id))));
  const tipo = estado?.data?.tipoImpositivo;
  return esTipoImpositivo(tipo) ? tipo : null;
};
