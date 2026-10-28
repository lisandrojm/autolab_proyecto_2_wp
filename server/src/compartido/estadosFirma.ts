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
}

/** ¿El tipo manda a firmar algo? La firma del alta sólo cuenta si el tipo genera alta (como se muestra el check). */
export function tipoEnviaAFirmar(t: TipoParaFirma | null | undefined): boolean {
  if (!t) return true;
  if (t.requiereFirma !== false) return true;
  if (t.requiereFirmaRelease !== false) return true;
  return t.generaAlta !== false && t.requiereFirmaAlta !== false;
}

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
