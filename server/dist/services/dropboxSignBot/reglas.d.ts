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
export declare const VIEWPORT: {
    readonly width: 1457;
    readonly height: 812;
};
/** Dónde está el ítem «Firma» del panel izquierdo del editor, en ese viewport. */
export declare const ORIGEN_FIRMA: {
    readonly x: 69;
    readonly y: 504;
};
export interface Colocacion {
    tipo: TipoDocumento;
    /** En qué página va la firma. */
    pagina: "primera" | "ultima";
    /** Ticks de rueda del visor antes de arrastrar, y dónde apuntar la rueda. `null` = sin scroll. */
    scroll: {
        ticks: number;
        direccion: "abajo" | "arriba";
        en: {
            x: number;
            y: number;
        };
    } | null;
    /** Dónde soltar el campo «Firma». */
    destino: {
        x: number;
        y: number;
    };
    /** Qué se espera ver en la zona, para el humano que lea el log. */
    descripcion: string;
}
/** Tipos que se reconocen pero todavía no tienen regla de colocación, con el motivo que ve el usuario. */
export declare const TIPOS_PENDIENTES: Partial<Record<TipoDocumento, string>>;
/**
 * El tipo del documento por su nombre de archivo. `null` si no es ninguno de los conocidos: ahí entran
 * `_CCM_`, `_Contrato_Servicios_`, `_Release_Servicios_` y cualquier otro.
 */
export declare function tipoDeDocumento(archivo: string): TipoDocumento | null;
/** Dónde va la firma para ese archivo, o `null` si el tipo no tiene regla (desconocido o pendiente). */
export declare function colocacionDe(archivo: string): Colocacion | null;
/** Por qué un archivo no se puede enviar por su tipo, o `null` si sí se puede. */
export declare function motivoSinColocacion(archivo: string): string | null;
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
