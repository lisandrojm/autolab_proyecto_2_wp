export declare const ANULADO: "ANULADO";
export interface DatosDeAnulacion {
    el: Date;
    por: unknown;
    porNombre: string;
    motivo: string;
}
/** ¿Es la lápida de un contrato anulado? */
export declare const esLapida: (c: any) => boolean;
/** La lápida que queda en la posición del contrato anulado: su clave, la marca y nada más. */
export declare function lapidaDe(contrato: Record<string, any>, contratoKey: unknown, datos: DatosDeAnulacion): {
    contratoKey: unknown;
    estadoContrato: "ANULADO";
    anulacion: {
        claveFrame: string;
        claveIdentidad: string;
        el: Date;
        por: unknown;
        porNombre: string;
        motivo: string;
    };
};
/** ¿Queda algún contrato de verdad si se anula el de la posición `idx`? Si no, se va el vínculo entero. */
export declare const quedanContratosSiSeAnula: (contratos: any[], idx: number) => boolean;
/** La posición del último contrato que no es una lápida, o -1. Para los que caen «al último» cuando no les dicen cuál. */
export declare const ultimoNoAnulado: (contratos: any[]) => number;
/**
 * Los campos de contrato que tiene una lápida (debería no tener ninguno). Una lápida con datos es un
 * contrato anulado que alguien volvió a escribir —un endpoint por índice que apuntó a su posición— y
 * lo estaría «resucitando» a medias. El modelo se niega a guardarla (ver `UserProject`, pre validate).
 */
export declare function camposDeContratoEnLapida(lapida: Record<string, unknown>): string[];
