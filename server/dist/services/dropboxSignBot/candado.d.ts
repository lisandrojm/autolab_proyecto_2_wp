/**
 * UNA SOLA CORRIDA DEL BOT DE DROPBOX SIGN POR TENANT (patrón `arca/candadoArca.ts`). En memoria, como
 * el resto de las corridas: un proceso, una por vez. Es un candado APARTE del de ARCA a propósito:
 * son navegadores y sesiones distintas, y no hay motivo para que una corrida de altas frene un envío
 * a la firma, ni al revés.
 */
/** Qué tiene tomado el bot (27/10/2026): el mensaje de «ocupado» y el panel dicen QUÉ está corriendo. */
export type MotivoCandado = "envio" | "prueba" | "login" | "borradores";
export declare const mensajeOcupado: (o: {
    desde: Date;
    motivo: MotivoCandado;
}) => string;
export declare class CandadoDropboxSignOcupado extends Error {
    status: number;
    constructor(o: {
        desde: Date;
        motivo: MotivoCandado;
    });
}
export declare const quienTieneDropboxSign: (tenantId: string) => {
    desde: Date;
    automatica: boolean;
    motivo: MotivoCandado;
};
export declare function tomarCandadoDropboxSign(tenantId: string, automatica: boolean, motivo?: MotivoCandado): void;
export declare function soltarCandadoDropboxSign(tenantId: string): void;
