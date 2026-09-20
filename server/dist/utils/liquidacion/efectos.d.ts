import type { IMemosoftEffect } from "../../models/RequestConfig.js";
import type { Regimen } from "./contratos.js";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ EFECTOS RIGEN UN DÍA DADO, Y SI ESTÁN BIEN CONFIGURADOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dos funciones puras, sin Mongo, por lo mismo que las de `contratos.ts`: son las que deciden qué
 * termina en el recibo de alguien.
 *
 * LA VIGENCIA SE EVALÚA CONTRA EL DÍA DE LA NOVEDAD, NO CONTRA HOY. Si en octubre RRHH cambia a qué
 * concepto va "Enfermedad", volver a liquidar septiembre tiene que seguir usando el mapeo de
 * septiembre. Liquidar con las reglas de hoy un mes que ya se pagó da diferencias que nadie puede
 * explicar tres meses después.
 */
/** Lo que el catálogo dice de un concepto. El subconjunto que hace falta para validar. */
export interface ConceptoConocido {
    codigo: string;
    descripcion: string;
    usaPar1: boolean;
    usaPar2: boolean;
    unidadPar1?: string | null;
    unidadPar2?: string | null;
    activo?: boolean;
}
export interface ContextoDeEfecto {
    /** La empresa del contrato de la persona. */
    empresaId?: string | null;
    regimen?: Regimen | null;
    aplicaA?: "titular" | "reemplazante";
}
/**
 * LOS EFECTOS QUE RIGEN ESE DÍA PARA ESA PERSONA.
 *
 * Los efectos son ADITIVOS: todos los que matchean se aplican. No hay override por especificidad
 * —"el de la empresa le gana al general"—, porque esa regla es invisible en la pantalla y hace que
 * agregar una línea haga desaparecer otra sin que se vea. Si algo no tiene que aplicar a una
 * empresa, se acota esa empresa; no se lo tapa con otro efecto.
 */
export declare function efectosVigentesEn(efectos: IMemosoftEffect[], fecha: string, contexto?: ContextoDeEfecto): IMemosoftEffect[];
/**
 * SI EL EFECTO SE PUEDE EMITIR CONTRA EL CATÁLOGO.
 *
 * Devuelve el problema en castellano, o `null` si está bien. Chequea tres cosas, y las tres
 * existen porque las tres pasan:
 *
 *   1. Que el concepto exista. Un código inventado hace que Memosoft rechace el archivo entero.
 *   2. Que el parámetro elegido sea uno que el concepto USA. Poner el número en la columna que el
 *      concepto ignora no da error: entra como cero y la persona cobra de menos.
 *   3. Que la unidad coincida. Un 0012 con 3 en la columna de importe son tres PESOS de licencia
 *      por enfermedad en vez de tres DÍAS, y eso no lo detecta nadie mirando el archivo.
 */
export declare function validarEfecto(efecto: IMemosoftEffect, concepto: ConceptoConocido | undefined): string | null;
/**
 * Cierra los efectos que regían y deja los nuevos, en vez de pisar la lista.
 *
 * Es lo que convierte "editar el mapeo" en una operación que no borra historia: lo que regía hasta
 * ayer queda con su `vigenteHasta`, y lo nuevo arranca hoy. Los que ya estaban cerrados no se tocan.
 */
export declare function reemplazarVigentes(actuales: IMemosoftEffect[], nuevos: IMemosoftEffect[], desde: string): IMemosoftEffect[];
