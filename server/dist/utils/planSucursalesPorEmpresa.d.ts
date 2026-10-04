/**
 * DEJAR A CADA EMPRESA CON LAS SUCURSALES, CÓDIGOS Y ACTIVIDADES QUE TIENE EN ARCA — el plan, sin escribir.
 *
 * Los datos de ARCA entran de afuera (`scripts/datos/sucursalesPorEmpresaArca.ts`) y este módulo dice
 * qué habría que cambiar en cada empresa para quedar igual. Es puro (sin Mongoose) para poder probarlo;
 * `scripts/cargarSucursalesPorEmpresa.ts` le trae lo que hay en la base y aplica el resultado.
 *
 * Reglas, todas conservadoras:
 *
 *  · La empresa se busca por CUIT. Si no está, se avisa y no se toca nada de ella.
 *  · El domicilio se busca en el catálogo por coincidencia EXACTA del texto normalizado (mayúsculas,
 *    sin acentos, espacios colapsados). Nada de parecidos: un domicilio que no está se avisa y no se
 *    crea — el catálogo de domicilios se mantiene desde su ABM.
 *  · Cada sucursal de ARCA queda con SU código y SUS actividades para esa empresa, marcada `arca`.
 *  · Las asociaciones que ARCA NO tiene se LISTAN siempre y se quitan sólo con `quitar`. Sin el flag
 *    quedan como estaban, con sus filas intactas.
 *  · Cada código de actividad se verifica contra el nomenclador. Si falta, se avisa: no se crea.
 *  · El domicilio habitual (`defaultsArca.sucursalId`): si queda apuntando a una sucursal que la
 *    empresa ya no tiene, se informa. Sólo se elige otra cuando le queda UNA sola — ahí no hay nada
 *    que decidir—; con varias, no se elige por ella.
 *  · LA ACTIVIDAD HABITUAL de una sucursal con varias actividades es una decisión de la empresa, no
 *    un dato de ARCA: se marca la que traigan los datos, si está entre las de esa sucursal. Si los
 *    datos no dicen nada, se conserva la que ya estuviera marcada (y siga siendo válida) y no se
 *    elige ninguna por ella. Con una sola actividad no se marca nada: rige esa.
 *  · Idempotente: aplicado una vez, la segunda corrida no tiene nada que cambiar.
 */
export interface ActividadSegunArca {
    codigo: string;
    descripcion: string;
}
export interface SucursalSegunArca {
    codigo: string;
    domicilio: string;
    codigoPostal?: string;
    actividades: ActividadSegunArca[];
    /**
     * La actividad HABITUAL de esa empresa en esa sucursal, cuando tiene más de una. No viene de ARCA:
     * la decide la empresa. Sin esto no se marca ninguna y se elige en cada contrato.
     */
    actividadHabitual?: string;
}
export interface EmpresaSegunArca {
    cuit: string;
    razonSocial: string;
    sucursales: SucursalSegunArca[];
}
export interface EmpresaEnBase {
    _id: string;
    cuit: string;
    razonSocial: string;
    sucursalIds: string[];
    sucursalActividades: Array<{
        sucursalId: string;
        codigo?: string | null;
        origen?: string | null;
        actividadHabitual?: string | null;
        actividades: Array<{
            codigo: string;
            descripcion?: string;
        }>;
    }>;
    /** `defaultsArca.sucursalId`: el domicilio habitual. */
    habitualId?: string | null;
}
export interface DomicilioEnCatalogo {
    _id: string;
    domicilio: string;
    codigo?: string;
}
export interface FilaResultante {
    sucursalId: string;
    codigo: string;
    origen?: "arca" | "manual";
    actividades: Array<{
        codigo: string;
        descripcion: string;
    }>;
    /** "" = sin habitual marcada. */
    actividadHabitual: string;
}
export interface PlanDeEmpresa {
    cuit: string;
    razonSocial: string;
    empresaId: string;
    /** Hay algo para escribir. */
    cambia: boolean;
    /** Cómo quedan `sucursalIds` y `sucursalActividades` si se aplica. */
    sucursalIds: string[];
    sucursalActividades: FilaResultante[];
    /** Renglones legibles de qué cambia, para mostrar. */
    cambios: string[];
    /** Asociaciones que la base tiene y ARCA no. Se quitan sólo con `quitar`. */
    sobran: Array<{
        sucursalId: string;
        domicilio: string;
        quitada: boolean;
    }>;
    habitual: {
        accion: "queda" | "cambia" | "sin_resolver" | "sin_habitual";
        de: string | null;
        a: string | null;
        nota: string;
    };
}
export interface PlanSucursalesPorEmpresa {
    empresas: PlanDeEmpresa[];
    /** CUIT de los datos que no están en la base. */
    empresasFaltantes: Array<{
        cuit: string;
        razonSocial: string;
    }>;
    /** Domicilios de los datos que no están en el catálogo: esa sucursal no se carga. */
    domiciliosFaltantes: Array<{
        cuit: string;
        codigo: string;
        domicilio: string;
    }>;
    /** Actividades de los datos que no están en el nomenclador. Se avisa; no se crean. */
    actividadesFaltantes: Array<{
        cuit: string;
        sucursal: string;
        codigo: string;
        descripcion: string;
    }>;
    /** Habituales pedidas en los datos que NO están entre las actividades de esa sucursal: no se marcan. */
    habitualesInvalidas: Array<{
        cuit: string;
        sucursal: string;
        codigo: string;
    }>;
    /** Sucursales con más de una actividad que quedan SIN habitual: ahí se elige en cada contrato. */
    sinHabitual: Array<{
        cuit: string;
        razonSocial: string;
        sucursal: string;
        actividades: string[];
    }>;
}
/** Texto de un domicilio para comparar por igualdad exacta: mayúsculas, sin acentos, un solo espacio. */
export declare const normalizarDomicilio: (v: unknown) => string;
export declare function planSucursalesPorEmpresa(o: {
    datos: EmpresaSegunArca[];
    empresas: EmpresaEnBase[];
    catalogo: DomicilioEnCatalogo[];
    /** Códigos de actividad que existen en el nomenclador (`ArcaActividad`). */
    actividadesDelNomenclador: Iterable<string>;
    /** Quitar las asociaciones que ARCA no tiene. Sin esto sólo se listan. */
    quitar?: boolean;
}): PlanSucursalesPorEmpresa;
