/**
 * QUÉ PUESTO DESEMPEÑADO POR DEFECTO LE TOCA A CADA CONVENIO, y qué haría sembrarlo — sin escribir nada.
 *
 * La lista de abajo es una decisión de quien conoce los convenios, no una inferencia: se cargó a
 * pedido. Los demás convenios en uso NO reciben nada acá; el plan los lista (`sinDefault`) para que
 * alguien decida.
 *
 * Las reglas del plan, todas conservadoras:
 *   · el código tiene que EXISTIR Y ESTAR ACTIVO en el catálogo de puestos. Si no, ese convenio no se
 *     toca y se avisa: este script no crea puestos por su cuenta.
 *   · el convenio tiene que existir. Si no, se avisa.
 *   · un valor ya cargado NO se pisa, salvo con `pisar` explícito. Igual al deseado = «ya estaba».
 *   · correrlo dos veces da lo mismo que correrlo una: la segunda vez no hay nada para aplicar.
 *
 * Es puro (sin Mongoose) para poder probarlo; `scripts/sembrarPuestoPorConvenio.ts` le trae los datos.
 */
export interface PuestoDeseado {
    cct: string;
    nombre: string;
    puesto: string;
}
export declare const PUESTOS_POR_CONVENIO: PuestoDeseado[];
export interface ConvenioParaPlan {
    externalId: string;
    name?: string;
    puestoDesempenadoDefault?: string | null;
}
export interface PlanPuestoPorConvenio {
    /** Lo que se va a escribir: `de` es lo que tenía ("" = vacío). */
    aplicar: Array<{
        cct: string;
        nombre: string;
        de: string;
        a: string;
    }>;
    /** Ya tenían exactamente ese puesto. */
    yaEstaban: Array<{
        cct: string;
        puesto: string;
    }>;
    /** Tenían OTRO puesto cargado y no se pisó (falta `pisar`). */
    respetados: Array<{
        cct: string;
        actual: string;
        deseado: string;
    }>;
    /** Códigos que no existen o no están activos en el catálogo: sus convenios no se tocan. */
    puestosFaltantes: Array<{
        puesto: string;
        ccts: string[];
    }>;
    /** Convenios de la lista que no están en el ABM. */
    conveniosFaltantes: string[];
    /** Convenios EN USO que quedan sin default después de aplicar: para que alguien decida. */
    sinDefault: Array<{
        cct: string;
        nombre: string;
        contratos: number;
        categorias: number;
    }>;
}
export declare function planPuestoPorConvenio(o: {
    deseados?: PuestoDeseado[];
    convenios: ConvenioParaPlan[];
    /** Códigos del catálogo que existen y están activos. */
    puestosActivos: Iterable<string>;
    /** Convenios en uso: con contratos o con categorías cargadas. */
    enUso?: Array<{
        cct: string;
        contratos: number;
        categorias: number;
    }>;
    pisar?: boolean;
}): PlanPuestoPorConvenio;
