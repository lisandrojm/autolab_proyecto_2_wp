/**
 * EL CIRCUITO DE UN CONTRATO SE RECORRE EN ORDEN (07/11/2026, pedido del usuario):
 *
 *   Trámite impositivo → Generar Documentos → Para firmar → Enviado a la firma → Firmados → Contratados
 *
 * Hasta acá un contrato podía saltear Generar Documentos sin que nadie le generara el contrato:
 *
 *   · el mail de Dropbox Sign de su CONSTANCIA DE ARCA («se inició proceso de firma») lo pasaba a
 *     «Firma enviada», porque el código del aviso era de un documento suyo — el alta, no el contrato;
 *   · entre el 20 y el 24/10 los RECIBOS DE SUELDO se registraron como documento «Contrato» y, al pasar
 *     por Outbox, Pendbox y Firmados, lo movían igual que el contrato.
 *
 * Dos reglas, puras (las usan la transición automática, el escaneo de carpetas, el aviso por mail y el
 * script que repara los que ya saltaron):
 *
 *   1. `esDocumentoDelContrato`: lo que mueve un contrato por Outbox / Pendbox / Firmados es SU contrato
 *      o SU release. Una constancia de ARCA o de CUIT, o un recibo de sueldo, pasa por las mismas
 *      carpetas pero es otro trámite.
 *   2. `motivoParaNoAvanzar`: a un estado posterior a Generar Documentos se llega desde Generar
 *      Documentos (o después), y con los documentos generados. La excepción es la de siempre: un tipo
 *      que no manda nada a firmar va directo a Contratados (ver `destinoSiNoSeFirma`).
 */

/** Los tipos de documento que genera Generar Documentos (los de la nomenclatura). */
const TIPOS_DEL_CONTRATO = new Set(["Contrato", "Release"]);

/**
 * ¿Este documento es el contrato o el release de la persona? Con el registro del código
 * (`documentos_generados`) manda el registro; sin registro (archivos de antes de los códigos), el nombre.
 */
export function esDocumentoDelContrato(registro: { tipo?: string | null; clase?: string | null } | null | undefined, nombre: string): boolean {
  if (registro) return TIPOS_DEL_CONTRATO.has(String(registro.tipo || "")) && registro.clase !== "recibo_sueldo";
  return !/_Alta(AFIP|Arca)_|_ConstanciaCUIT_|REC_SUELDO/i.test(String(nombre || ""));
}

export type MotivoNoAvanzar = "saltea_generar_documentos" | "sin_documentos_generados";

export const TEXTO_NO_AVANZAR: Record<MotivoNoAvanzar, string> = {
  saltea_generar_documentos: "todavía no pasó por Generar Documentos",
  sin_documentos_generados: "en Generar Documentos todavía no se le generaron el contrato ni el release",
};

/**
 * ¿Puede el contrato pasar a ese estado sin romper el circuito? `null` si sí; si no, por qué. Puro.
 *
 * Sólo frena lo que va MÁS ALLÁ de Generar Documentos (`ordenGenerar`): desde antes no se llega (hay
 * que pasar por ahí), y desde ahí sólo con algo generado. Lo que ya está más adelante sigue solo.
 */
export function motivoParaNoAvanzar(o: { ordenActual: number; ordenDestino: number; ordenGenerar: number | null; documentosGenerados: boolean }): MotivoNoAvanzar | null {
  if (o.ordenGenerar == null || o.ordenDestino <= o.ordenGenerar) return null;
  if (o.ordenActual < o.ordenGenerar) return "saltea_generar_documentos";
  if (o.ordenActual === o.ordenGenerar && !o.documentosGenerados) return "sin_documentos_generados";
  return null;
}

/** El contrato tiene algo generado en Generar Documentos (contrato o release). */
export const tieneDocumentosGenerados = (c: any): boolean => !!(c?.firmaGeneradoAt || c?.firmaReleasesGeneradoAt || (Array.isArray(c?.firmaReleases) && c.firmaReleases.length > 0));

/** Los contratos que siguen el circuito: los de WeProdu (Solicitudes o «Agregar miembro»), como el paso 6. */
export const sigueElCircuito = (c: any): boolean => !!(c?.solicitudId || c?.origen === "agregar_miembro");

/**
 * ¿VUELVE A GENERAR DOCUMENTOS? Para los contratos que ya están más allá (Firma pendiente, enviada,
 * Disponible): si su contrato o su release existe hoy en Dropbox, no — está en el circuito. Si no hay
 * ninguno (sólo la constancia de ARCA, sólo un recibo, o lo generado se borró), sí: hay que generarlo. Puro.
 *
 * `documentos`: los registrados para ese contrato (con su código) y si el archivo está en Dropbox.
 * `sinCodigo`: archivos de esa persona y ese período encontrados por nombre (los de antes de los códigos).
 */
export function decidirReparacion(o: { documentos: Array<{ codigo: string; tipo?: string | null; clase?: string | null; archivo: string; enDropbox: boolean }>; sinCodigo: string[] }): { volver: boolean; motivo: string } {
  const delContrato = o.documentos.filter((d) => esDocumentoDelContrato(d, d.archivo));
  const vivo = delContrato.find((d) => d.enDropbox);
  if (vivo) return { volver: false, motivo: `su ${String(vivo.tipo || "contrato").toLowerCase()} está en Dropbox (${vivo.codigo})` };
  const viejo = o.sinCodigo.find((n) => esDocumentoDelContrato(null, n));
  if (viejo) return { volver: false, motivo: `hay un documento suyo en Dropbox sin código: ${viejo}` };
  const otros = o.documentos.filter((d) => !esDocumentoDelContrato(d, d.archivo)).map((d) => `${d.clase === "recibo_sueldo" || /REC_SUELDO/i.test(d.archivo) ? "recibo" : String(d.tipo || "otro")} ${d.codigo}`);
  const borrados = delContrato.map((d) => d.codigo);
  const partes = [borrados.length ? `lo generado (${borrados.join(", ")}) ya no está en Dropbox` : "nunca se le generó el contrato ni el release", otros.length ? `sólo tuvo ${otros.join(", ")}` : ""].filter(Boolean);
  return { volver: true, motivo: partes.join("; ") };
}
