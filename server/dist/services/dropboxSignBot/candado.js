const QUE_HACE = {
    envio: "una tanda de envío a la firma",
    prueba: "una prueba de conexión con Dropbox Sign",
    login: "el login asistido («Conectarse a Dropbox Sign»)",
    borradores: "la revisión o limpieza de borradores",
};
const tomados = new Map();
export const mensajeOcupado = (o) => `El bot de Dropbox Sign está ocupado con ${QUE_HACE[o.motivo]} (desde ${o.desde.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}). Esperá a que termine.`;
export class CandadoDropboxSignOcupado extends Error {
    status = 409;
    constructor(o) {
        super(mensajeOcupado(o));
    }
}
export const quienTieneDropboxSign = (tenantId) => tomados.get(tenantId) || null;
export function tomarCandadoDropboxSign(tenantId, automatica, motivo = "envio") {
    const actual = tomados.get(tenantId);
    if (actual)
        throw new CandadoDropboxSignOcupado(actual);
    tomados.set(tenantId, { desde: new Date(), automatica, motivo });
}
export function soltarCandadoDropboxSign(tenantId) {
    tomados.delete(tenantId);
}
