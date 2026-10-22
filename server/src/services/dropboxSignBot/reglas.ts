/**
 * LAS REGLAS DE NEGOCIO DEL ENVÍO A LA FIRMA, puras y testeables (sin Playwright, sin base).
 *
 * Validadas con ~176 envíos reales hechos a mano (ver el brief del 22/10/2026). Lo que está acá no se
 * negocia desde el motor: el motor pregunta y obedece.
 *
 *  · El TIPO del documento sale del nombre del archivo, y decide dónde va la firma. Un tipo sin regla
 *    de colocación NO se envía: queda `requiere_revision`. Jamás se adivina la colocación.
 *  · Hay tipos RECONOCIDOS PERO PENDIENTES (hoy `REC_SUELDO`, los recibos de sueldo): se saben nombrar,
 *    pero falta relevar dónde va la firma. Cuando se defina, es una entrada más de `colocacionDe` y su
 *    test, nunca algo en el motor.
 *  · El GUARD previo al click final: título exacto, CC correcto, firmante listado, colocación conocida.
 */

export type TipoDocumento = "AltaAFIP" | "Contrato_Jornada" | "Contrato_Plazo-fijo" | "Release" | "REC_SUELDO";

/** Viewport con el que se validaron las coordenadas. El motor lo exige: con otro, nada de esto vale. */
export const VIEWPORT = { width: 1457, height: 812 } as const;
/** Dónde está el ítem «Firma» del panel izquierdo del editor, en ese viewport. */
export const ORIGEN_FIRMA = { x: 69, y: 504 } as const;

export interface Colocacion {
  tipo: TipoDocumento;
  /** En qué página va la firma. */
  pagina: "primera" | "ultima";
  /** Ticks de rueda del visor antes de arrastrar, y dónde apuntar la rueda. `null` = sin scroll. */
  scroll: { ticks: number; direccion: "abajo" | "arriba"; en: { x: number; y: number } } | null;
  /** Dónde soltar el campo «Firma». */
  destino: { x: number; y: number };
  /** Qué se espera ver en la zona, para el humano que lea el log. */
  descripcion: string;
}

/** Tipos que se reconocen pero todavía no tienen regla de colocación, con el motivo que ve el usuario. */
export const TIPOS_PENDIENTES: Partial<Record<TipoDocumento, string>> = {
  REC_SUELDO: "Tipo REC_SUELDO: falta definir posición de firma",
};

/**
 * El tipo del documento por su nombre de archivo. `null` si no es ninguno de los conocidos: ahí entran
 * `_CCM_`, `_Contrato_Servicios_`, `_Release_Servicios_` y cualquier otro.
 */
export function tipoDeDocumento(archivo: string): TipoDocumento | null {
  const n = String(archivo || "");
  if (/_AltaAFIP_/i.test(n)) return "AltaAFIP";
  if (/_Contrato_Jornada(_|\.pdf$)/i.test(n)) return "Contrato_Jornada";
  if (/_Contrato_Plazo-fijo/i.test(n)) return "Contrato_Plazo-fijo";
  // Un Release «de servicios» es otro documento, con otra colocación que todavía no se relevó.
  if (/_Release_/i.test(n) && !/_Release_Servicios/i.test(n)) return "Release";
  if (/_REC_SUELDO_/i.test(n)) return "REC_SUELDO";
  return null;
}

/** Dónde va la firma para ese archivo, o `null` si el tipo no tiene regla (desconocido o pendiente). */
export function colocacionDe(archivo: string): Colocacion | null {
  const tipo = tipoDeDocumento(archivo);
  switch (tipo) {
    case "AltaAFIP":
      return { tipo, pagina: "primera", scroll: { ticks: 3, direccion: "abajo", en: { x: 680, y: 500 } }, destino: { x: 900, y: 478 }, descripcion: "celda «Firma empleado y fecha de notificación» de la tabla de ARCA (página 1; la página 2, talón del empleador, no se firma)" };
    case "Contrato_Jornada":
      return { tipo, pagina: "ultima", scroll: { ticks: 4, direccion: "arriba", en: { x: 680, y: 450 } }, destino: { x: 543, y: 280 }, descripcion: "sobre la línea «Firma: ____» de la última página (mitad superior)" };
    case "Contrato_Plazo-fijo":
      return { tipo, pagina: "ultima", scroll: { ticks: 3, direccion: "abajo", en: { x: 680, y: 450 } }, destino: { x: 543, y: 446 }, descripcion: "sobre la línea «Firma: ____» de la última página (mitad inferior)" };
    case "Release":
      return { tipo, pagina: "ultima", scroll: null, destino: { x: 465, y: 418 }, descripcion: "columna izquierda (la del empleado) de la última página, sobre la línea de firma encima de «Aclaración: <NOMBRE>»" };
    default:
      return null;
  }
}

/** Por qué un archivo no se puede enviar por su tipo, o `null` si sí se puede. */
export function motivoSinColocacion(archivo: string): string | null {
  if (colocacionDe(archivo)) return null;
  const tipo = tipoDeDocumento(archivo);
  if (tipo && TIPOS_PENDIENTES[tipo]) return TIPOS_PENDIENTES[tipo]!;
  return "Tipo de documento sin regla de colocación de la firma: no se envía hasta que se defina.";
}

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
}

/**
 * EL GUARD ANTES DE «ENVIAR PARA FIRMAR». Si algo no cierra, no se envía: un envío con título
 * distinto o sin CC rompe el circuito IMAP y deja el contrato como no enviado para siempre.
 */
export function guardDeEnvio(d: DatosDelGuard): { ok: true } | { ok: false; motivo: string } {
  const sinColocacion = motivoSinColocacion(d.archivo);
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
