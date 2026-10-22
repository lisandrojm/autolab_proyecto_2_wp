import { VIEWPORT, ORIGEN_FIRMA, type ReglaColocacion } from "../../compartido/reglasColocacionFirma.js";
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
export declare function tipoDeDocumento(archivo: string, reglas?: ReglaColocacion[]): TipoDocumento | null;
/** Por qué un archivo no se puede enviar por su tipo, o `null` si tiene regla activa. */
export declare function motivoSinColocacion(archivo: string, reglas?: ReglaColocacion[]): string | null;
/** Hay regla ACTIVA para ese archivo (la colocación concreta la resuelve `resolverColocacion` con el texto del PDF). */
export declare const tieneRegla: (archivo: string, reglas?: ReglaColocacion[]) => boolean;
/** «JOAQUIN NAVARRO MARTIN»: primer nombre + apellido(s), en mayúsculas. */
export declare function nombreDeFirmante(user: {
    firstName?: string | null;
    lastName?: string | null;
} | null | undefined): string;
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
}
/**
 * EL GUARD ANTES DE «ENVIAR PARA FIRMAR». Si algo no cierra, no se envía: un envío con título
 * distinto o sin CC rompe el circuito IMAP y deja el contrato como no enviado para siempre.
 */
export declare function guardDeEnvio(d: DatosDelGuard): {
    ok: true;
} | {
    ok: false;
    motivo: string;
};
/** El texto exacto con el que Dropbox Sign frena los envíos (freno antiabuso, no documentado). */
export declare const TEXTO_LIMITE = "Debido a la seguridad de la cuenta, no puedes enviar m\u00E1s solicitudes de firma hasta ma\u00F1ana";
export declare const esTextoDeLimite: (texto: string) => boolean;
