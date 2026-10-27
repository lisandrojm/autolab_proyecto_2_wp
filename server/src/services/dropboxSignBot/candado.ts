/**
 * UNA SOLA CORRIDA DEL BOT DE DROPBOX SIGN POR TENANT (patrón `arca/candadoArca.ts`). En memoria, como
 * el resto de las corridas: un proceso, una por vez. Es un candado APARTE del de ARCA a propósito:
 * son navegadores y sesiones distintas, y no hay motivo para que una corrida de altas frene un envío
 * a la firma, ni al revés.
 */
/** Qué tiene tomado el bot (27/10/2026): el mensaje de «ocupado» y el panel dicen QUÉ está corriendo. */
export type MotivoCandado = "envio" | "prueba" | "login" | "borradores";
const QUE_HACE: Record<MotivoCandado, string> = {
  envio: "una tanda de envío a la firma",
  prueba: "una prueba de conexión con Dropbox Sign",
  login: "el login asistido («Conectarse a Dropbox Sign»)",
  borradores: "la revisión o limpieza de borradores",
};
const tomados = new Map<string, { desde: Date; automatica: boolean; motivo: MotivoCandado }>();

export const mensajeOcupado = (o: { desde: Date; motivo: MotivoCandado }) =>
  `El bot de Dropbox Sign está ocupado con ${QUE_HACE[o.motivo]} (desde ${o.desde.toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}). Esperá a que termine.`;

export class CandadoDropboxSignOcupado extends Error {
  status = 409;
  constructor(o: { desde: Date; motivo: MotivoCandado }) {
    super(mensajeOcupado(o));
  }
}

export const quienTieneDropboxSign = (tenantId: string) => tomados.get(tenantId) || null;

export function tomarCandadoDropboxSign(tenantId: string, automatica: boolean, motivo: MotivoCandado = "envio"): void {
  const actual = tomados.get(tenantId);
  if (actual) throw new CandadoDropboxSignOcupado(actual);
  tomados.set(tenantId, { desde: new Date(), automatica, motivo });
}

export function soltarCandadoDropboxSign(tenantId: string): void {
  tomados.delete(tenantId);
}
