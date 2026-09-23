import { Types } from "mongoose";
import { IEscalaPeriodo } from "../models/EscalaPeriodo.js";
import { ValoresDelActa } from "../utils/escalaCalculo.js";
import { AdicionalVigente } from "../utils/liquidacionReferencia.js";
/**
 * LO QUE COMPARTEN LAS RUTAS Y LOS SCRIPTS DE CARGA.
 *
 * Las cuentas puras están en `utils/escalaCalculo`, `utils/escalaAFecha` y `utils/aplicarParitaria`, con sus
 * tests. Acá vive lo que necesita la base: armar un período con sus importes efectivos, validar que no se
 * pise con otro, resolver qué rige a una fecha, y ESPEJAR el vigente en `ConvenioGrupo`.
 *
 * Está en un servicio y no en la ruta porque los scripts de seed cargan exactamente lo mismo. Dos copias de
 * "cómo se arma un período" se desalinean, y la que corre por script es la que escribe doce grupos de una vez.
 */
export declare class DatoDeEscalaInvalido extends Error {
}
export interface DatosDePeriodo {
    convenio: string;
    grupo?: number | null;
    grupoId?: Types.ObjectId | string | null;
    categoriaId?: Types.ObjectId | string | null;
    desde: string;
    hasta?: string | null;
    basico: number;
    adicionalPct?: number | null;
    presentismoPct?: number | null;
    netoFactor?: number | null;
    /** Lo que publica el acta. Lo que venga acá GANA sobre la cuenta. */
    acta?: ValoresDelActa;
    totalLetras?: string;
    netoLetras?: string;
    acuerdoId?: Types.ObjectId | string | null;
    tramo?: string;
    origen?: IEscalaPeriodo["origen"];
    migracion?: string;
    nota?: string;
    createdBy?: Types.ObjectId | string | null;
}
/**
 * Los campos de un período, listos para `create` o `updateOne`.
 *
 * La regla del acta: si el acta publica un importe, ése es el que rige y la cuenta queda en `diferencias`.
 * Si no lo publica, rige el calculado. Nunca al revés — el sueldo que se paga es el del acta, incluso
 * cuando el acta se equivoca en un centavo.
 */
export declare function armarPeriodo(d: DatosDePeriodo): Record<string, any>;
/**
 * Que el período nuevo no comparta ningún día con otro del mismo grupo.
 *
 * Devuelve el mensaje de error o `null`. No lanza, porque quien llama decide: la ruta responde 409 y el
 * script de carga lo saltea y lo informa al final.
 */
export declare function motivoDeSuperposicion(convenio: string, grupo: number | null, desde: string, hasta: string | null, excluirId?: string): Promise<string | null>;
/**
 * Cierra el período que estaba abierto para dejar entrar al nuevo: su `hasta` pasa a ser el día anterior.
 *
 * Es el paso que evita dos escalas vigentes el mismo día. Sólo toca los que NO declaran `hasta` —los que ya
 * tienen vencimiento los puso alguien a propósito y pisarlos sería cambiar un dato cargado a mano.
 */
export declare function cerrarPeriodosAbiertos(convenio: string, grupo: number | null, desdeDelNuevo: string): Promise<number>;
export interface ResultadoEspejo {
    grupo: number | null;
    espejado: boolean;
    motivo?: string;
}
/**
 * COPIA EL PERÍODO VIGENTE A `ConvenioGrupo`, que es lo que lee todo el resto del sistema.
 *
 * Sin esto, aplicar una paritaria no cambiaría nada en los contratos, ni en los PDFs, ni en el TXT de ARCA:
 * esas pantallas leen el grupo, no el historial. Con esto, la escala versionada es la fuente y el grupo es
 * la foto de lo vigente.
 *
 * Dos cosas que NO hace, a propósito:
 *  - No crea grupos que no existan. Un grupo nuevo se da de alta en su ABM; inventarlo acá haría que un
 *    período mal cargado creara estructura.
 *  - Si a `hoy` no rige ningún período, no toca nada. Borrar la escala vigente porque el historial no llega
 *    hasta hoy sería destruir el único importe que hay.
 */
export declare function espejarVigenteEnGrupo(convenio: string, grupo: number | null, hoy: string): Promise<ResultadoEspejo>;
/** La escala de todos los grupos del convenio a una fecha, ordenada por grupo. */
export declare function escalaDelConvenioAFecha(convenio: string, fecha: string): Promise<IEscalaPeriodo[]>;
export interface AdicionalConValor extends AdicionalVigente {
    _id: string;
    capitulo: "general" | "pequenas_empresas";
    orden: number;
    condicion?: string;
    /** Desde cuándo rige el importe que se está mostrando. Vacío = no hay valor para esa fecha. */
    valorDesde?: string;
    valorHasta?: string;
    valorId?: string;
}
/**
 * Los adicionales del convenio con el importe que rige a esa fecha.
 *
 * Los que no tienen valor para la fecha se devuelven igual, con `monto: null`. Esconderlos sería peor:
 * "Guardería sin importe cargado para mayo" es información, y desaparecer de la lista no lo es.
 */
export declare function adicionalesAFecha(convenio: string, fecha: string, capitulo?: "general" | "pequenas_empresas"): Promise<AdicionalConValor[]>;
/** El capítulo de pequeñas empresas a una fecha, por grupo. */
export declare function pequenasEmpresasAFecha(convenio: string, fecha: string): Promise<any[]>;
/**
 * La jornada adicional tendría que ser la semana ÷ 5. Devuelve el desvío, o `null` si cierra.
 *
 * No bloquea el guardado: el importe que se paga es el del acta. Es un aviso para que un número tipeado mal
 * se vea al cargarlo y no tres meses después.
 */
export declare function desvioJornadaAdicional(semana: number, jornada: number): number | null;
/** `true` si ese período rige hoy: lo usa la ruta para decidir si hay que espejar después de guardar. */
export declare const esElVigente: (periodo: {
    desde?: any;
    hasta?: any;
}, hoy: string) => boolean;
