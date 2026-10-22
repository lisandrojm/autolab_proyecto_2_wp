import { type ILineaEnvio } from "../../models/DropboxSignEnvioLog.js";
import { type ArchivoResuelto, type ConfigEnvio, type EstadoThrottle, type Plan } from "./planificador.js";
export type EventoEnvio = {
    tipo: "abriendo" | "sesion" | "cola" | "documento" | "irreversible" | "resultado" | "limite" | "fin" | "fallo" | "info";
    at: Date;
    texto: string;
    archivo?: string;
    codigo?: string;
    estado?: string;
};
export interface CorridaEnvio {
    tenantId: string;
    enSeco: boolean;
    automatica: boolean;
    eventos: EventoEnvio[];
    terminada: boolean;
    /** Se está apretando «Enviar para firmar» de un documento: «Detener» espera a que termine ése. */
    irreversible: boolean;
    señal: {
        cortada: boolean;
    };
    arrancadaEl: Date;
    total: number;
    enviados: number;
    errores: number;
    limite: boolean;
    lineas: ILineaEnvio[];
}
export declare const corridaEnvioDe: (tenantId: string) => CorridaEnvio | undefined;
/** Seco salvo que se diga lo contrario fuera de producción; en producción, real salvo que se fuerce seco. */
export declare function enSecoForzado(): boolean;
export declare function detenerCorridaEnvio(tenantId: string): {
    ok: boolean;
    motivo?: string;
};
/** La configuración y el estado del throttle del tenant, con los defaults. */
export declare function configDelTenant(tenantId: string): Promise<{
    config: ConfigEnvio;
    estado: EstadoThrottle;
    cc: string;
    bot: any;
}>;
/**
 * QUIÉN FIRMA, desde la base. El código del nombre («ID-000123») lleva al `DocumentoGenerado` y de ahí
 * al usuario: su email manda sobre el del nombre de archivo (caso real: el archivo decía
 * `korova-oi@hotmail.com` y la persona tiene `korova_oi@hotmail.com`), y el nombre es «PRIMER NOMBRE
 * APELLIDOS». Sin registro en la base, se busca al usuario por el email del nombre de archivo y se
 * deja constancia del respaldo.
 */
export declare function resolverFirmante(tenantId: string, archivo: string, avisar?: (texto: string) => void): Promise<ArchivoResuelto>;
export interface Cola extends Plan {
    outbox: string | null;
    archivosEnOutbox: number;
    avisos: string[];
    /** Por qué el scheduler no correría ahora (informativo). */
    motivoNoCorre: string | null;
}
/** Qué enviaría la próxima tanda: lee el Outbox, resuelve firmantes y planifica. */
export declare function armarCola(tenantId: string, opciones?: {
    manual?: boolean;
}): Promise<Cola>;
/** Arranca una corrida y vuelve en el acto. `manual` = botón de la UI (respeta sólo enfriamiento y cupo). */
export declare function arrancarCorridaEnvio(tenantId: string, opciones?: {
    automatica?: boolean;
    enSeco?: boolean;
}): Promise<{
    total: number;
    enSeco: boolean;
}>;
export declare const ocupadaPor: (tenantId: string) => {
    desde: Date;
    automatica: boolean;
};
