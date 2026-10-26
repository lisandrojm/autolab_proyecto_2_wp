import { motivoPorTipo, reglaDe, REGLAS_BASE, VIEWPORT, ORIGEN_FIRMA, type ReglaColocacion } from "../../compartido/reglasColocacionFirma.js";

/**
 * LAS REGLAS DE NEGOCIO DEL ENVÍO A LA FIRMA, puras y testeables (sin Playwright, sin base).
 *
 * Validadas con ~176 envíos reales hechos a mano (ver el brief del 22/10/2026). Lo que está acá no se
 * negocia desde el motor: el motor pregunta y obedece.
 *
 *  · DÓNDE VA LA FIRMA vive en `compartido/reglasColocacionFirma.ts` (tabla declarativa por tipo,
 *    anclada al texto del PDF o a las palabras del OCR; cada tenant tiene su copia editable, ver
 *    `reglasTenant.ts`). Acá sólo se reexporta lo que el resto del bot necesita: el tipo por nombre de
 *    archivo y por qué un tipo no se envía. Todas las funciones aceptan las reglas del tenant; sin
 *    ellas, rige el catálogo de fábrica.
 *  · El GUARD previo al click final: título exacto, CC correcto, firmante listado, tipo con regla.
 */

export { VIEWPORT, ORIGEN_FIRMA };

export type TipoDocumento = string;

/** El tipo del documento por su nombre de archivo, o `null` si no matchea ninguna regla. */
export function tipoDeDocumento(archivo: string, reglas: ReglaColocacion[] = REGLAS_BASE): TipoDocumento | null {
  return reglaDe(archivo, reglas)?.tipo || null;
}

/** Por qué un archivo no se puede enviar por su tipo, o `null` si tiene regla activa. */
export function motivoSinColocacion(archivo: string, reglas: ReglaColocacion[] = REGLAS_BASE): string | null {
  return motivoPorTipo(archivo, reglas);
}

/** Hay regla ACTIVA para ese archivo (la colocación concreta la resuelve `resolverColocacion` con el texto del PDF). */
export const tieneRegla = (archivo: string, reglas: ReglaColocacion[] = REGLAS_BASE): boolean => !motivoPorTipo(archivo, reglas);

/** «JOAQUIN NAVARRO MARTIN»: primer nombre + apellido(s), en mayúsculas. */
export function nombreDeFirmante(user: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  const primerNombre = String(user?.firstName || "")
    .trim()
    .split(/\s+/)[0];
  const apellidos = String(user?.lastName || "").trim();
  return `${primerNombre} ${apellidos}`.replace(/\s+/g, " ").trim().toUpperCase();
}

const normalizar = (s: string) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

export interface DatosDelGuard {
  /** Nombre exacto del archivo, con `.pdf`. */
  archivo: string;
  /** Lo que dice el campo título en «Revisar y enviar». */
  titulo: string;
  /** Lo que dice el campo CC. */
  cc: string;
  /** La casilla configurada en el tenant. */
  ccEsperado: string;
  firmanteNombre: string;
  firmanteEmail: string;
  /** El texto de la pantalla de revisión. */
  textoPagina: string;
  /** Las reglas del tenant (sin ellas, el catálogo). */
  reglas?: ReglaColocacion[];
  /** La posición la declaró la plantilla al generar el documento: no hace falta regla por nombre (25/10/2026). */
  posicionDeclarada?: boolean;
}

/**
 * EL GUARD ANTES DE «ENVIAR PARA FIRMAR». Si algo no cierra, no se envía: un envío con título
 * distinto o sin CC rompe el circuito IMAP y deja el contrato como no enviado para siempre.
 */
export function guardDeEnvio(d: DatosDelGuard): { ok: true } | { ok: false; motivo: string } {
  const sinColocacion = d.posicionDeclarada ? null : motivoSinColocacion(d.archivo, d.reglas);
  if (sinColocacion) return { ok: false, motivo: `${sinColocacion} (${d.archivo})` };
  if (String(d.titulo || "").trim() !== String(d.archivo || "").trim()) return { ok: false, motivo: `El título («${d.titulo}») no es el nombre exacto del archivo («${d.archivo}»).` };
  if (!d.ccEsperado) return { ok: false, motivo: "No hay casilla de CC configurada (Configuración → DropboxSign)." };
  if (normalizar(d.cc) !== normalizar(d.ccEsperado)) return { ok: false, motivo: `El CC («${d.cc || "vacío"}») no es la casilla configurada («${d.ccEsperado}»).` };
  if (!d.firmanteNombre || !d.firmanteEmail) return { ok: false, motivo: "Falta el nombre o el email del firmante." };
  const texto = normalizar(d.textoPagina);
  if (!texto.includes(normalizar(d.firmanteNombre)) || !texto.includes(normalizar(d.firmanteEmail))) {
    return { ok: false, motivo: `La pantalla de revisión no lista al firmante «${d.firmanteNombre} (${d.firmanteEmail})».` };
  }
  return { ok: true };
}

/** El texto exacto con el que Dropbox Sign frena los envíos (freno antiabuso, no documentado). */
export const TEXTO_LIMITE = "Debido a la seguridad de la cuenta, no puedes enviar más solicitudes de firma hasta mañana";
export const esTextoDeLimite = (texto: string): boolean => normalizar(texto).includes(normalizar(TEXTO_LIMITE));
