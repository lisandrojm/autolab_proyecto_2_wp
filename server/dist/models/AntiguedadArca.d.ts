import { Document, Types } from "mongoose";
/**
 * LA ANTIGÜEDAD DE CADA PERSONA SEGÚN ARCA, YA CALCULADA (materializada).
 *
 * Una fila por (tenant, cuil, empleadora) y una fila GLOBAL por (tenant, cuil, empleadoraCuit: null)
 * que junta todas las empleadoras del tenant. Se recalcula al final de cada seed y de cada sync,
 * sólo para los CUIL que se tocaron; el cálculo en sí es puro y está en
 * `utils/antiguedadArca.ts` (recibe las relaciones de un CUIL y devuelve estas métricas).
 *
 * Se guardan LAS DOS medidas, porque las dos se usan:
 *  - `antiguedadDesdePrimeraAlta`: días entre la primera alta y hoy, con huecos y todo. Es la
 *    antigüedad «desde que entró».
 *  - `diasTrabajados`: la suma de los días de cada relación (fin − inicio + 1), FUSIONANDO las que se
 *    solapan para no contar un día dos veces; una relación abierta cuenta hasta hoy. Es la
 *    antigüedad «efectiva».
 * Las dos dependen de «hoy»: `calculadoEl` dice con qué día se calcularon.
 */
export interface IAntiguedadArca extends Document {
    tenantId: Types.ObjectId;
    cuil: string;
    /** 11 dígitos, o `null` en la fila global (todas las empleadoras). */
    empleadoraCuit: string | null;
    /** El nombre de la relación más reciente. */
    apellidoNombre: string;
    primeraAlta: Date;
    /** La mayor FECHA DE FIN; si hay una relación abierta, el «hoy» del cálculo. */
    ultimaFecha: Date;
    /** Días corridos entre `primeraAlta` y el «hoy» del cálculo. */
    antiguedadDesdePrimeraAlta: {
        dias: number;
        anios: number;
    };
    /** Días efectivamente trabajados (relaciones fusionadas), y su equivalente en años. */
    diasTrabajados: number;
    aniosTrabajados: number;
    cantidadContratos: number;
    /** ¿Hay alguna relación sin fecha de fin? */
    tieneRelacionAbierta: boolean;
    /** En la fila global: los CUIT de las empleadoras que aportan. En la fila por empleadora, sólo ella. */
    empresas: string[];
    calculadoEl: Date;
    createdAt: Date;
    updatedAt: Date;
}
export declare const AntiguedadArca: import("mongoose").Model<IAntiguedadArca, {}, {}, {}, Document<unknown, {}, IAntiguedadArca, {}, {}> & IAntiguedadArca & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default AntiguedadArca;
