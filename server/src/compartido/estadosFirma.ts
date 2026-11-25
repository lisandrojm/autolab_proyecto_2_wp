/**
 * ESTADOS QUE DEPENDEN DE UNA FIRMA DEL COLABORADOR (Dropbox Sign) (28/10/2026).
 *
 * Un estado marcado `vinculadoAFirma` (ENVIO DE DOCUMENTACION, FIRMA PENDIENTE, FIRMA ENVIADA…) sólo
 * tiene sentido en un tipo de contrato que manda algo a firmar: el contrato, el release o el alta de
 * ARCA. Si el tipo no manda nada, el contrato nunca pasaría por esos estados y no se le pueden asignar.
 *
 * Sin dependencias: lo usan el modal de Contrato (`@compartido`), la ruta de estados y la semilla.
 */

/** Los checks de «Envío a firmar» del tipo de contrato (`Contrato.data`). Ausente = `true`, como en el modelo. */
export interface TipoParaFirma {
  requiereFirma?: boolean | null;
  requiereFirmaRelease?: boolean | null;
  requiereFirmaAlta?: boolean | null;
  generaAlta?: boolean | null;
  /** «Valida el CUIT en ARCA antes de Contratos» (sólo cuenta con constancia de CUIT). Ausente = sí, como en el modelo. */
  validaCuit?: boolean | null;
}

/** ¿El tipo manda a firmar algo? La firma del alta sólo cuenta si el tipo genera alta (como se muestra el check). */
export function tipoEnviaAFirmar(t: TipoParaFirma | null | undefined): boolean {
  if (!t) return true;
  if (t.requiereFirma !== false) return true;
  if (t.requiereFirmaRelease !== false) return true;
  return t.generaAlta !== false && t.requiereFirmaAlta !== false;
}

/**
 * ¿UN CONTRATO NUEVO QUEDA CONTRATADO AL CREARSE, sin pasar por el circuito? Sólo si no tiene NADA que
 * hacer en él: su tipo no manda nada a firmar y no lleva trámite impositivo.
 *
 * `tipoImpositivo` es el del estado con el que nace el contrato (el de su plantilla):
 *   · «alta_temprana_afip» → lleva el alta en ARCA: sigue el circuito (regla del 28/10/2026);
 *   · «constancia_cuit» (Servicios) → TIENE QUE VALIDARSE EL CUIT (14/11/2026, pedido del usuario): aunque
 *     no se firme nada, pasa por Trámite impositivo › Constancia de CUIT y no llega a Contratos hasta que
 *     el Padrón de ARCA diga que el CUIT está activo. A un CUIT que da mal no se le puede facturar. Antes
 *     estos contratos nacían contratados y el CUIT no lo validaba nadie.
 *     SALVO QUE EL TIPO DIGA QUE NO (25/11/2026, «Valida el CUIT en ARCA antes de Contratos» apagado):
 *     Servicios Adicional e Intercambio son para quien ya tiene una Jornada vigente; nadie factura, y el
 *     padrón puede dar inactivo a alguien que sólo está en relación de dependencia. Ese contrato quedaba
 *     en el Paso 2 para siempre. Con el check apagado nace en Contratos, como antes del 14/11. El check
 *     va en el tipo y no en el estado porque «Servicios» lo comparten varios tipos y sólo algunos lo saltean.
 * Validada la constancia, lo que no se firma va a Contratos sin pasar por Generar Documentos (eso no cambia).
 */
export function quedaContratadoAlCrearse(tipo: TipoParaFirma | null | undefined, tipoImpositivo: string | null | undefined): boolean {
  if (!tipo) return false;
  if (tipoImpositivo === "alta_temprana_afip") return false;
  if (tipoImpositivo === "constancia_cuit" && tipoValidaCuit(tipo)) return false;
  return !tipoEnviaAFirmar({ ...tipo, generaAlta: false });
}

/** ¿El tipo valida el CUIT en ARCA antes de Contratos? Ausente = sí: sólo se saltea si alguien lo apagó. */
export const tipoValidaCuit = (t: TipoParaFirma | null | undefined): boolean => t?.validaCuit !== false;

export interface EstadoParaFirma {
  data?: { vinculadoAFirma?: boolean | null; esImpositivo?: boolean | null } | null;
}

/** Un impositivo nunca es de firma: es el trámite de ARCA, no lo que firma la persona. */
export const esEstadoDeFirma = (e: EstadoParaFirma | null | undefined): boolean => e?.data?.vinculadoAFirma === true && e?.data?.esImpositivo !== true;

/** ¿Se le puede asignar este estado a un tipo con estos checks? */
export const estadoPermitidoParaTipo = (e: EstadoParaFirma | null | undefined, t: TipoParaFirma | null | undefined): boolean => !esEstadoDeFirma(e) || tipoEnviaAFirmar(t);

/**
 * VALOR INICIAL (sólo para la semilla): los estados que ya existían y son de firma por su nombre o
 * porque vigilan la carpeta de enviados/firmados de Dropbox Sign.
 */
// Misma normalización que `claveEstado` (utils/estadoClave.ts), que no vive en compartido.
const normalizar = (s: string): string => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const NOMBRES_DE_FIRMA = ["envio de documentacion", "firma pendiente", "firma enviada"];
const PROPOSITOS_DE_FIRMA = ["pendbox", "firmados"];

export function pareceEstadoDeFirma(name: string, carpetas?: Array<{ proposito?: string | null }> | null): boolean {
  if (NOMBRES_DE_FIRMA.includes(normalizar(name))) return true;
  return (carpetas || []).some((c) => PROPOSITOS_DE_FIRMA.includes(String(c?.proposito ?? "")));
}
