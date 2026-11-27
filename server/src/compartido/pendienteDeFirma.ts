/**
 * ═══════════════════════════════════════════════════════════════════════
 * QUÉ LE FALTA A UN CONTRATO PARA IR A LA FIRMA, y si se puede generar sin preguntar nada
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Es la regla de la bandeja Generar Documentos (paso 3): qué plantilla de contrato le toca, si el
 * contrato se firma, qué releases van, si el alta de ARCA se suma, con qué empresa se genera y qué
 * no se puede generar sin una decisión de una persona (el proyecto tiene varias empresas y la fila
 * no eligió, un contrato custom sin texto, una plantilla vacía).
 *
 * Vivía en el frontend (`ContractBulkTabs.tsx`, 19/10/2026). Pasó a `compartido` el 27/11/2026 para
 * que la GENERACIÓN AUTOMÁTICA del server (`services/automatizacionesContratacion`) decida exactamente
 * lo mismo que los botones de la pantalla: una sola regla, dos consumidores. Es PURA: sin React, sin
 * Mongoose, con tipos estructurales que cumplen tanto las filas del listado como los documentos de la
 * base.
 */
import { plantillaDelContrato } from "./plantillaDelContrato.js";
import { textoCustomDeRelease, textoCustomUsable } from "./textoCustom.js";

/** Los checks de «Envío a firmar» del tipo de contrato (`Contrato.data`). Ausente = sí, como en el modelo. */
export interface TipoDeContratoParaFirma {
  requiereFirma?: boolean | null;
  requiereFirmaRelease?: boolean | null;
  requiereFirmaAlta?: boolean | null;
}

/** La plantilla de contrato (`ContratoFrame`), con su tipo principal populado o como id. */
export interface PlantillaParaFirma {
  _id: unknown;
  name?: string;
  data?: { id?: number | string | null; nombre?: string } | null;
  content?: string | null;
  esCustom?: boolean | null;
  contratoId?: unknown;
}

/** Un release (`Release`), con su tipo de release populado o como id. */
export interface ReleaseParaFirma {
  _id: unknown;
  esCustom?: boolean | null;
  contratoIds?: unknown[] | null;
  releaseTipoId?: unknown;
}

/** Lo que la regla mira de un contrato (la fila del listado o el subdocumento de la base). */
export interface ContratoParaFirma {
  nombre_contrato?: string | null;
  tipo_contrato_id?: unknown;
  /** El tipo de contrato que guarda el contrato (`contrato_id`); la fila lo trae como `tipoContratoId`. */
  tipoContratoId?: unknown;
  contrato_id?: unknown;
  firmaGeneradoAt?: unknown;
  firmaReleasesGeneradoAt?: unknown;
  firmaReleases?: { releaseId?: unknown }[] | null;
  firmaEnviadaAt?: unknown;
  altaDocumentoUrl?: string | null;
  contenidoCustomContrato?: string | null;
  contenidoCustomReleases?: { releaseId?: unknown; content?: string | null }[] | null;
  empresaContratoId?: unknown;
  empresaReleaseId?: unknown;
  /** Las empresas que el proyecto ofrece para generar (la fila las trae; el server las arma del proyecto). */
  contratoEmpresas?: { id: string }[] | null;
  releaseEmpresas?: { id: string }[] | null;
}

export type TramiteImpositivo = "alta_temprana_afip" | "constancia_cuit";

const id = (x: unknown): string => (x && typeof x === "object" && "_id" in (x as any) ? String((x as any)._id ?? "") : x == null ? "" : String(x));
const tipoDePlantilla = (p: PlantillaParaFirma | null): TipoDeContratoParaFirma | null => (p && p.contratoId && typeof p.contratoId === "object" ? ((p.contratoId as any).data as TipoDeContratoParaFirma | null) || {} : null);

// ── Los releases de un tipo de contrato (se asignan desde el release, 16/10/2026) ──

/** ¿Este release está asignado EXPLÍCITAMENTE a este tipo de contrato (`Release.contratoIds`)? */
export const releaseEsDelTipo = (release: { contratoIds?: unknown[] | null }, tipoId: string | null | undefined): boolean =>
  !!tipoId && Array.isArray(release.contratoIds) && release.contratoIds.map((x) => id(x)).includes(String(tipoId));

/** Un release sin contratos asignados: sólo lo llevan los tipos que no eligieron ninguno. */
export const releaseSinContratos = (release: { contratoIds?: unknown[] | null }): boolean => !Array.isArray(release.contratoIds) || release.contratoIds.length === 0;

/**
 * LOS RELEASES QUE LE TOCAN A UN TIPO DE CONTRATO:
 *  - si el tipo tiene releases ASIGNADOS, sólo esos («que aparezca sólo el que se eligió»);
 *  - si no tiene ninguno, los que no están asignados a ningún contrato, que es como estaban todos antes
 *    de poder asignarlos: así los tipos que nadie configuró siguen igual.
 * Sin tipo conocido, todos los que vienen. `universo`: si el tipo tiene asignados se decide con TODOS
 * los releases, no con la lista ya filtrada (un asignado que no va a firma igual hace que el tipo deje
 * de llevar los generales).
 */
export const releasesDelTipo = <R extends { contratoIds?: unknown[] | null }>(releases: R[], tipo: { _id?: unknown } | null | undefined, universo?: { contratoIds?: unknown[] | null }[]): R[] => {
  const tipoId = tipo?._id ? id(tipo._id) : "";
  if (!tipoId) return releases;
  const tieneAsignados = (universo ?? releases).some((r) => releaseEsDelTipo(r, tipoId));
  return releases.filter((r) => (tieneAsignados ? releaseEsDelTipo(r, tipoId) : releaseSinContratos(r)));
};

// ── Los checks del tipo de contrato y del tipo de release ──

/** «Se envía a firmar» del Tipo de Contrato de la plantilla. Sin el dato populado, sí (como antes de existir el campo). */
export const contratoRequiereFirma = (template: PlantillaParaFirma | null): boolean => tipoDePlantilla(template)?.requiereFirma !== false;
/** «Se envía a firmar el release» del Tipo de Contrato. Sin el dato, sí. */
export const contratoRequiereFirmaRelease = (template: PlantillaParaFirma | null): boolean => tipoDePlantilla(template)?.requiereFirmaRelease !== false;
/** «Se envía a firmar el alta de ARCA» del Tipo de Contrato. Sin el dato, sí. */
export const contratoRequiereFirmaAlta = (template: PlantillaParaFirma | null): boolean => tipoDePlantilla(template)?.requiereFirmaAlta !== false;
/** Mismo criterio, para el Tipo de Release (`release.releaseTipoId`). */
export const releaseRequiereFirma = (release: ReleaseParaFirma): boolean => {
  const tipo = release.releaseTipoId;
  return tipo && typeof tipo === "object" ? (tipo as any).requiereFirma !== false : true;
};

/**
 * La plantilla se puede generar si tiene contenido REAL redactado. El editor devuelve "<p></p>" cuando
 * está vacío, así que se mira el texto sin etiquetas. Una CUSTOM no tiene contenido propio (sólo el
 * placeholder): el texto es del trámite, y eso lo mira `pendienteDeFirma`.
 */
export const plantillaTieneContenido = (cf: PlantillaParaFirma | null): boolean =>
  !!cf?.esCustom || (!!cf?.content && cf.content.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0);

/** La plantilla de contrato que le corresponde al contrato (ver `plantillaDelContrato`). */
export const plantillaDe = <T extends PlantillaParaFirma>(contrato: ContratoParaFirma, plantillas: T[]): T | null => plantillaDelContrato(contrato, plantillas as any) as T | null;

/**
 * EL TIPO DE CONTRATO DE LA FILA, para saber qué releases le tocan: el que guarda el contrato
 * (`tipoContratoId` en la fila, `contrato_id` en la base) y, si no lo guarda, el principal de su plantilla.
 */
export const tipoDeLaFila = (contrato: ContratoParaFirma, template: PlantillaParaFirma | null): { _id?: string } | null => {
  const propio = id(contrato.tipoContratoId) || id(contrato.contrato_id);
  if (propio) return { _id: propio };
  const principal = template?.contratoId ? id(template.contratoId) : "";
  return principal ? { _id: principal } : null;
};

/**
 * LOS RELEASES QUE VAN A FIRMA PARA ESTA FILA: los que su tipo de release manda a firmar (ya vienen
 * filtrados en `releasesQueFirman`) y sólo si el Tipo de Contrato también lo pide. Un release custom
 * entra sólo en el trámite que tiene su texto escrito.
 */
export const releasesDeLaFila = <R extends ReleaseParaFirma>(template: PlantillaParaFirma | null, releasesQueFirman: R[], contrato: ContratoParaFirma, todosLosReleases?: ReleaseParaFirma[]): R[] =>
  contratoRequiereFirmaRelease(template) ? releasesDelTipo(releasesQueFirman, tipoDeLaFila(contrato, template), todosLosReleases).filter((r) => !r.esCustom || textoCustomUsable(textoCustomDeRelease(contrato.contenidoCustomReleases, id(r._id)))) : [];

/** El alta de ARCA va a firma: trámite de alta temprana, documento cargado y el tipo lo pide. */
export const altaVaAFirma = (contrato: ContratoParaFirma, template: PlantillaParaFirma | null, tipo?: TramiteImpositivo | null): boolean =>
  tipo === "alta_temprana_afip" && !!contrato.altaDocumentoUrl && contratoRequiereFirmaAlta(template);

export const contratoGenerado = (c: ContratoParaFirma): boolean => !!c.firmaGeneradoAt;
export const releasesGenerados = (c: ContratoParaFirma, releasesAplicables: ReleaseParaFirma[]): boolean => {
  if (releasesAplicables.length === 0) return true;
  if (!c.firmaReleasesGeneradoAt) return false;
  // Un release custom entra al grupo cuando se le escribe el texto: si se sumó después de generar, el grupo ya no es el que se tiene que enviar.
  const conPdf = new Set((c.firmaReleases || []).map((f) => id(f.releaseId)));
  return releasesAplicables.filter((a) => a.esCustom).every((a) => conPdf.has(id(a._id)));
};

/** Con qué empresa generar: la guardada o, si el proyecto ofrece una sola, ésa. Con varias y ninguna elegida, falta una decisión. */
export const empresaParaGenerar = (guardada: unknown, opciones: { id: string }[] | null | undefined): { id?: string; falta: boolean } => {
  const g = id(guardada);
  if (g) return { id: g, falta: false };
  const lista = opciones || [];
  if (lista.length <= 1) return { id: lista[0]?.id, falta: false };
  return { falta: true };
};

export interface PendienteDeFirma<P extends PlantillaParaFirma = PlantillaParaFirma, R extends ReleaseParaFirma = ReleaseParaFirma> {
  /** La fila tiene algo que mandar a firma (contrato, release o alta). Sin esto no hay nada que hacer. */
  algoAplica: boolean;
  template: P | null;
  /** El contrato se firma (según el tipo). */
  contratoAplica: boolean;
  releasesAplicables: R[];
  faltaContrato: boolean;
  faltaRelease: boolean;
  /** Con qué empresa generar (`undefined` = la que elija el server: la primera del proyecto). */
  empresaContrato?: string;
  empresaRelease?: string;
  /** Por qué no se puede generar solo el contrato / el release. Vacío = se puede (o no hace falta). */
  motivoContrato: string;
  motivoRelease: string;
  /** Los dos juntos. */
  motivo: string;
  /** Todo lo que aplica ya está generado y no se envió: se puede mandar a firmar. */
  enviable: boolean;
  /** Lo que lleva el envío (los tres checks del tipo). */
  envio: { incluirContrato: boolean; incluirReleases: boolean; incluirAlta: boolean };
}

/**
 * LO QUE LE FALTA A UNA FILA PARA PODER ENVIARSE, y si se puede generar sin preguntar nada.
 *
 * `releasesQueFirman`: los releases activos cuyo tipo de release manda a firmar. `todosLosReleases`:
 * los activos, con o sin firma (para decidir si el tipo tiene asignados; ver `releasesDelTipo`).
 */
export function pendienteDeFirma<P extends PlantillaParaFirma, R extends ReleaseParaFirma>(
  contrato: ContratoParaFirma,
  plantillas: P[],
  releasesQueFirman: R[],
  tipo: TramiteImpositivo | null | undefined,
  todosLosReleases?: ReleaseParaFirma[],
): PendienteDeFirma<P, R> {
  const template = plantillaDe(contrato, plantillas);
  const contratoAplica = contratoRequiereFirma(template);
  const releasesAplicables = releasesDeLaFila(template, releasesQueFirman, contrato, todosLosReleases);
  const alta = altaVaAFirma(contrato, template, tipo);
  const algoAplica = contratoAplica || releasesAplicables.length > 0 || alta;
  const faltaContrato = contratoAplica && !contratoGenerado(contrato);
  const faltaRelease = releasesAplicables.length > 0 && !releasesGenerados(contrato, releasesAplicables);
  const empC = empresaParaGenerar(contrato.empresaContratoId, contrato.contratoEmpresas);
  const empR = empresaParaGenerar(contrato.empresaReleaseId, contrato.releaseEmpresas);
  let motivoContrato = "";
  if (faltaContrato) {
    if (!template) motivoContrato = "No tiene plantilla de contrato";
    else if (template.esCustom && !textoCustomUsable(contrato.contenidoCustomContrato)) motivoContrato = "Contrato custom sin texto escrito";
    else if (!template.esCustom && !plantillaTieneContenido(template)) motivoContrato = "La plantilla del contrato no tiene contenido";
    else if (empC.falta) motivoContrato = "Falta elegir la empresa del contrato";
  }
  const motivoRelease = faltaRelease && empR.falta ? "Falta elegir la empresa del release" : "";
  const motivo = [motivoContrato, motivoRelease].filter(Boolean).join(" · ");
  const enviable = !contrato.firmaEnviadaAt && algoAplica && !faltaContrato && !faltaRelease;
  return {
    algoAplica,
    template,
    contratoAplica,
    releasesAplicables,
    faltaContrato,
    faltaRelease,
    empresaContrato: empC.id,
    empresaRelease: empR.id,
    motivoContrato,
    motivoRelease,
    motivo,
    enviable,
    envio: { incluirContrato: contratoAplica, incluirReleases: releasesAplicables.length > 0, incluirAlta: alta },
  };
}
