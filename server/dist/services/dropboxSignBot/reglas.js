import { motivoPorTipo, reglaDe, REGLAS_COLOCACION, VIEWPORT, ORIGEN_FIRMA } from "../../compartido/reglasColocacionFirma.js";
/**
 * LAS REGLAS DE NEGOCIO DEL ENVÍO A LA FIRMA, puras y testeables (sin Playwright, sin base).
 *
 * Validadas con ~176 envíos reales hechos a mano (ver el brief del 22/10/2026). Lo que está acá no se
 * negocia desde el motor: el motor pregunta y obedece.
 *
 *  · DÓNDE VA LA FIRMA vive en `compartido/reglasColocacionFirma.ts` (tabla declarativa por tipo,
 *    anclada al texto del PDF, con la receta de pantalla como respaldo). Acá sólo se reexporta lo que
 *    el resto del bot necesita: el tipo por nombre de archivo y por qué un tipo no se envía.
 *  · El GUARD previo al click final: título exacto, CC correcto, firmante listado, tipo con regla.
 */
export { VIEWPORT, ORIGEN_FIRMA };
/** Los tipos reconocidos pero sin regla de colocación todavía, con el motivo que ve el usuario. */
export const TIPOS_PENDIENTES = Object.fromEntries(REGLAS_COLOCACION.filter((r) => r.estado === "pendiente").map((r) => [r.tipo, `Tipo ${r.tipo}: ${r.motivoPendiente || "falta definir posición de firma"}`]));
/** El tipo del documento por su nombre de archivo, o `null` si no matchea ninguna regla. */
export function tipoDeDocumento(archivo) {
    return reglaDe(archivo)?.tipo || null;
}
/** Por qué un archivo no se puede enviar por su tipo, o `null` si tiene regla activa. */
export function motivoSinColocacion(archivo) {
    return motivoPorTipo(archivo);
}
/** Hay regla ACTIVA para ese archivo (la colocación concreta la resuelve `resolverColocacion` con el texto del PDF). */
export const tieneRegla = (archivo) => !motivoPorTipo(archivo);
/** «JOAQUIN NAVARRO MARTIN»: primer nombre + apellido(s), en mayúsculas. */
export function nombreDeFirmante(user) {
    const primerNombre = String(user?.firstName || "")
        .trim()
        .split(/\s+/)[0];
    const apellidos = String(user?.lastName || "").trim();
    return `${primerNombre} ${apellidos}`.replace(/\s+/g, " ").trim().toUpperCase();
}
const normalizar = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
/**
 * EL GUARD ANTES DE «ENVIAR PARA FIRMAR». Si algo no cierra, no se envía: un envío con título
 * distinto o sin CC rompe el circuito IMAP y deja el contrato como no enviado para siempre.
 */
export function guardDeEnvio(d) {
    const sinColocacion = motivoSinColocacion(d.archivo);
    if (sinColocacion)
        return { ok: false, motivo: `${sinColocacion} (${d.archivo})` };
    if (String(d.titulo || "").trim() !== String(d.archivo || "").trim())
        return { ok: false, motivo: `El título («${d.titulo}») no es el nombre exacto del archivo («${d.archivo}»).` };
    if (!d.ccEsperado)
        return { ok: false, motivo: "No hay casilla de CC configurada (Configuración → DropboxSign)." };
    if (normalizar(d.cc) !== normalizar(d.ccEsperado))
        return { ok: false, motivo: `El CC («${d.cc || "vacío"}») no es la casilla configurada («${d.ccEsperado}»).` };
    if (!d.firmanteNombre || !d.firmanteEmail)
        return { ok: false, motivo: "Falta el nombre o el email del firmante." };
    const texto = normalizar(d.textoPagina);
    if (!texto.includes(normalizar(d.firmanteNombre)) || !texto.includes(normalizar(d.firmanteEmail))) {
        return { ok: false, motivo: `La pantalla de revisión no lista al firmante «${d.firmanteNombre} (${d.firmanteEmail})».` };
    }
    return { ok: true };
}
/** El texto exacto con el que Dropbox Sign frena los envíos (freno antiabuso, no documentado). */
export const TEXTO_LIMITE = "Debido a la seguridad de la cuenta, no puedes enviar más solicitudes de firma hasta mañana";
export const esTextoDeLimite = (texto) => normalizar(texto).includes(normalizar(TEXTO_LIMITE));
