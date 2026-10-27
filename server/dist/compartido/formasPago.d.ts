/**
 * FORMAS DE PAGO (27/10/2026): Efectivo, Transferencia bancaria, Cheque… Catálogo propio (Configuración →
 * Formas de pago) que cada tipo de contrato acota: qué formas habilita y cuál es la predeterminada. El
 * contrato de un miembro guarda la elegida en `forma_pago_id`.
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
/**
 * LAS OPCIONES DEL SELECTOR DE FORMA DE PAGO DE UN CONTRATO.
 *
 *  · El tipo habilita algunas → sólo esas, y sólo las activas.
 *  · El tipo no habilita ninguna → todas las activas (no se bloquea el alta).
 *  · La que el contrato YA tiene se ofrece siempre, aunque después se haya desactivado o el tipo la haya
 *    sacado: editar un contrato viejo no puede borrarle su forma de pago en silencio.
 *
 * `predeterminada` es la del tipo, si está entre las opciones y activa.
 */
export declare function formasParaSelector<T extends FormaPagoLike>(todas: T[], tipo: FormasDelTipo | null | undefined, actualId?: string | null): {
    opciones: T[];
    predeterminada: string | null;
    restringido: boolean;
};
/** Datos bancarios de la persona (`User.metadata`) que pide una forma con `requiereDatosBancarios`. */
export declare function faltanDatosBancarios(metadata: {
    cbu?: string | null;
    aliasBancario?: string | null;
    bancoId?: number | string | null;
} | null | undefined): string[];
/**
 * ¿Se puede guardar este contrato con esta forma de pago? Devuelve el motivo para rechazarlo, o `null`.
 *
 * Una forma que el contrato YA tenía (`previaId`) no se vuelve a juzgar: desactivarla o sacarla del tipo
 * no puede impedir editar otra cosa del contrato. Una forma NUEVA tiene que estar activa, habilitada por
 * el tipo (si el tipo acota) y, si pide datos bancarios, la persona los tiene que tener cargados.
 */
export declare function rechazoDeFormaPago(p: {
    forma: FormaPagoLike | null;
    tipo: FormasDelTipo | null | undefined;
    previaId?: string | null;
    metadata?: Parameters<typeof faltanDatosBancarios>[0];
}): string | null;
