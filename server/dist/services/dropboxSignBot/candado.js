/**
 * UNA SOLA CORRIDA DEL BOT DE DROPBOX SIGN POR TENANT (patrón `arca/candadoArca.ts`). En memoria, como
 * el resto de las corridas: un proceso, una por vez. Es un candado APARTE del de ARCA a propósito:
 * son navegadores y sesiones distintas, y no hay motivo para que una corrida de altas frene un envío
 * a la firma, ni al revés.
 */
const tomados = new Map();
export class CandadoDropboxSignOcupado extends Error {
    status = 409;
    constructor(desde) {
        super(`Ya hay una corrida de envío a la firma en curso (desde ${desde.toLocaleTimeString("es-AR")}). Esperá a que termine.`);
    }
}
export const quienTieneDropboxSign = (tenantId) => tomados.get(tenantId) || null;
export function tomarCandadoDropboxSign(tenantId, automatica) {
    const actual = tomados.get(tenantId);
    if (actual)
        throw new CandadoDropboxSignOcupado(actual.desde);
    tomados.set(tenantId, { desde: new Date(), automatica });
}
export function soltarCandadoDropboxSign(tenantId) {
    tomados.delete(tenantId);
}
