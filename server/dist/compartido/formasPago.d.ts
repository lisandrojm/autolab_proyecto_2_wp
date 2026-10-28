/**
 * FORMAS DE PAGO (27/10/2026): Efectivo, Transferencia bancaria, Cheque… Catálogo propio (Configuración →
 * Formas de pago). Cada tipo de contrato dice con cuál o cuáles se paga (`formasPagoIds`; por defecto
 * Transferencia bancaria). No se elige por persona. Si todas piden datos bancarios, el alta los exige.
 *
 * Las reglas viven acá, compartidas: el server las hace cumplir y el formulario las usa para no ofrecer
 * lo que después se rechaza. Sin dependencias (se importa desde el front con `@compartido`).
 */
export interface FormaPagoLike {
    _id: string;
    /** El nombre («Transferencia bancaria»). */
    name: string;
    /** El código («TRANSFERENCIA_BANCARIA»): `externalId` del catálogo. */
    externalId?: string;
    descripcion?: string;
    requiereDatosBancarios?: boolean;
    requiereComprobante?: boolean;
    /** Ausente = activa, igual que en Entidades Financieras. */
    activo?: boolean;
    orden?: number | null;
}
/** Lo que un tipo de contrato dice de las formas de pago (`Contrato.data`). */
export interface FormasDelTipo {
    formasPagoIds?: Array<string | {
        toString(): string;
    }> | null;
    formaPagoDefaultId?: string | {
        toString(): string;
    } | null;
}
export declare const NOMBRE_MIN = 3;
export declare const NOMBRE_MAX = 50;
export declare const DESCRIPCION_MAX = 200;
export declare const formaActiva: (f: Pick<FormaPagoLike, "activo"> | null | undefined) => boolean;
/** «Compensación / Intercambio» → «COMPENSACION_INTERCAMBIO»: mayúsculas, sin tildes, sin espacios. */
export declare function codigoDesdeNombre(nombre: string): string;
/** Lo que se escribió en el campo «Código», llevado a la forma válida (mismas reglas que el autogenerado). */
export declare const normalizarCodigo: (codigo: string) => string;
/**
 * Valida nombre, código y descripción de un alta o edición. `undefined` = el campo no vino (edición
 * parcial: un interruptor o el orden) y no se valida. Devuelve el primer error, o `null`.
 */
export declare function errorDeCampos(c: {
    nombre?: string;
    codigo?: string;
    descripcion?: string;
}): string | null;
/**
 * NOMBRE Y CÓDIGO ÚNICOS. El nombre sin distinguir mayúsculas ni tildes («efectivo» = «Efectivo»); el
 * código, exacto (ya viene normalizado). `idPropio` excluye al registro que se está editando.
 */
export declare function conflictoDeUnicidad(existentes: FormaPagoLike[], candidato: {
    nombre?: string;
    codigo?: string;
}, idPropio?: string | null): string | null;
/**
 * BORRAR SÓLO LO QUE NADIE USA. Con contratos o tipos de contrato asociados se rechaza diciendo cuántos y
 * ofreciendo la salida que no rompe nada: desactivarla.
 */
export declare function motivoParaNoBorrar(nombre: string, uso: {
    contratos: number;
    tipos: number;
}): string | null;
/** Por `orden` (los sin orden, al final) y después por nombre: el orden de todos los selectores. */
export declare function ordenarFormas<T extends FormaPagoLike>(lista: T[]): T[];
/**
 * Lo que guarda un tipo de contrato: habilitadas sin repetir y la predeterminada SÓLO si es una de
 * ellas (si se deshabilita la que era predeterminada, se limpia).
 */
export declare function normalizarFormasDelTipo(formasPagoIds: unknown, formaPagoDefaultId: unknown): {
    formasPagoIds: string[];
    formaPagoDefaultId: string | null;
};
/** El código de la forma que se asigna por defecto a un tipo de contrato. */
export declare const CODIGO_POR_DEFECTO = "TRANSFERENCIA_BANCARIA";
/**
 * LAS FORMAS DE PAGO DEL TIPO DE CONTRATO (28/10/2026: se definen en el tipo, una o varias; no se eligen
 * por persona). Las de `formasPagoIds` (y la vieja `formaPagoDefaultId`, si quedó), en el orden del catálogo.
 */
export declare function formasDelTipo<T extends FormaPagoLike>(todas: T[], tipo: FormasDelTipo | null | undefined): T[];
/** Datos bancarios de la persona (`User.metadata`) que pide una forma con `requiereDatosBancarios`. */
export declare function faltanDatosBancarios(metadata: {
    cbu?: string | null;
    aliasBancario?: string | null;
    bancoId?: number | string | null;
} | null | undefined): string[];
/**
 * ¿Se puede dar de alta a esta persona con este tipo de contrato? Si TODAS sus formas de pago piden datos
 * bancarios y a la persona le faltan, el motivo; con alguna que no los pide (efectivo, por ejemplo) hay
 * con qué pagarle y no se frena. Sin formas definidas, tampoco.
 */
export declare function rechazoPorDatosBancarios(formas: FormaPagoLike[], metadata: Parameters<typeof faltanDatosBancarios>[0]): string | null;
