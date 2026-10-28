/** Las formas con las que arranca el catálogo. Se identifican por código. */
export declare const FORMAS_INICIALES: readonly [{
    readonly codigo: "EFECTIVO";
    readonly nombre: "Efectivo";
}, {
    readonly codigo: "TRANSFERENCIA_BANCARIA";
    readonly nombre: "Transferencia bancaria";
    readonly requiereDatosBancarios: true;
}, {
    readonly codigo: "CHEQUE";
    readonly nombre: "Cheque";
    readonly requiereComprobante: true;
}, {
    readonly codigo: "BILLETERA_VIRTUAL";
    readonly nombre: "Billetera virtual";
}, {
    readonly codigo: "COMPENSACION_INTERCAMBIO";
    readonly nombre: "Compensación / Intercambio";
    readonly descripcion: "Sin pago en dinero: el día trabajado compensa otro (cambio de franco).";
}];
/**
 * LA PRIMERA CARGA DE FORMAS DE PAGO, UNA SOLA VEZ (patrón `paisesResidenciaSeed.ts`).
 *
 * Upsert por código con `$setOnInsert`: correrla de nuevo no duplica ni pisa lo que alguien editó. La marca
 * en `SemillaAplicada` hace que un reinicio no reponga una forma que alguien borró a propósito desde el ABM.
 *
 * Además deja al tipo de contrato «Servicios Intercambio» (importes en 0) con «Compensación / Intercambio»
 * como única habilitada y predeterminada, sólo si todavía no tenía formas configuradas.
 */
export declare function sembrarFormasPagoUnaVez(): Promise<void>;
/**
 * TRANSFERENCIA BANCARIA POR DEFECTO (28/10/2026), UNA SOLA VEZ: los tipos de contrato que no tienen
 * ninguna forma de pago quedan con Transferencia bancaria. Los que ya tienen alguna (por ejemplo «Servicios
 * Intercambio» con Compensación) no se tocan. Después, lo que cada tipo tenga lo decide quien lo edita.
 */
export declare function transferenciaPorDefectoUnaVez(): Promise<void>;
