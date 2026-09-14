/**
 * ═══════════════════════════════════════════════════════════════════════
 * TIPOS DE ENTIDAD FINANCIERA: Banco, Billetera Virtual, Compañía Financiera…
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Eran una lista fija en el código, repetida en tres pantallas. Ahora se administran desde
 * Entidades Financieras → Tipos, y cada uno dice QUÉ DATOS PIDE: una billetera no tiene tipo ni número
 * de cuenta, y su número se llama CVU y no CBU. Eso es lo que arma la cascada de datos bancarios del
 * registro y de la ficha de usuario.
 *
 * `clave` es lo que queda guardado en cada entidad (`Banco.tipoEntidad`) y en cada persona
 * (`metadata.tipoEntidadFinanciera`). Por eso sale del nombre al crear y NO se cambia después: el nombre
 * se puede corregir, la clave no.
 *
 * VIVE EN `infos` (type "tipo-entidad-financiera") y no en una colección propia: el cluster de Atlas
 * está en su tope de colecciones.
 */
export declare const TIPO_INFO = "tipo-entidad-financiera";
/** «No tengo Banco» no es un tipo de entidad: es la ausencia de una. No se puede crear con esa clave. */
export declare const CLAVE_SIN_BANCO = "sin_banco";
export declare const ROTULOS_CBU: readonly ["CBU", "CVU", "CBU/CVU"];
export type RotuloCbu = (typeof ROTULOS_CBU)[number];
export interface TipoEntidadFinanciera {
    _id: string;
    clave: string;
    nombre: string;
    /** Si se ofrece en los selectores. Quien ya lo tiene cargado lo sigue viendo. */
    activo: boolean;
    pideTipoCuenta: boolean;
    pideNroCuenta: boolean;
    rotuloCbu: RotuloCbu;
    orden: number;
}
export declare const aTipo: (d: any) => TipoEntidadFinanciera;
/** «Compañía Financiera» → «compania_financiera»: sin acentos, minúsculas y guiones bajos. */
export declare const claveDesdeNombre: (nombre: string) => string;
/** Todos los tipos, en su orden. `soloActivos` para lo que se ofrece a elegir (el registro público). */
export declare function listarTipos(soloActivos?: boolean): Promise<TipoEntidadFinanciera[]>;
