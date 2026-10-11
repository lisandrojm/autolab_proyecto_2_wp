import { Types } from "mongoose";
/**
 * UNA PERSONA NO TIENE DOS ALTAS A LA VEZ CON LA MISMA EMPLEADORA.
 *
 * Pedido del 10/10/2026: una vez presentada el alta de un contrato, no se presenta otra de la misma
 * persona hasta que termine la vigente. ARCA la aceptaría como una segunda relación laboral
 * superpuesta, y deshacerla es un trámite aparte.
 *
 * Es POR EMPLEADORA a propósito: alguien puede trabajar a la vez para dos CUIT distintos, y eso son
 * dos relaciones legítimas. «Termina» = su fecha de baja; sin baja, la relación sigue abierta.
 *
 * Cuenta como presentada lo que tiene marca y no falló: `presentada`, y también `indeterminado` y
 * `presentando`, que pueden haber entrado en ARCA (ver `altaArcaPresentada` en UserProject).
 */
export interface AltaPresentada {
    userId: string;
    userProjectId: string;
    contractIndex: number;
    empresaId: string;
    alta: string;
    baja: string;
}
/** Las altas ya presentadas de estas personas, en los proyectos del tenant. */
export declare function altasPresentadasDe(proyectosDelTenant: Array<string | Types.ObjectId>, userIds: string[]): Promise<AltaPresentada[]>;
/**
 * El alta ya presentada que se superpone con este contrato, si hay. Dos períodos se pisan si cada uno
 * empieza antes de que termine el otro. El mismo contrato no cuenta (es el que se está presentando).
 */
export declare function altaQueSePisa(contrato: {
    userId: string;
    userProjectId: string;
    contractIndex: number;
    empresaId: string;
    alta: string;
    baja: string;
}, presentadas: AltaPresentada[]): AltaPresentada | null;
/** «12/10/2026» para los mensajes. */
export declare const fechaCorta: (iso: string) => string;
export declare const textoAltaQueSePisa: (p: AltaPresentada) => string;
