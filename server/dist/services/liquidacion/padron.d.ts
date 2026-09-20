import { Types } from "mongoose";
import { Regimen } from "../../utils/liquidacion/contratos.js";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL PADRÓN DE UN PERÍODO: quién se liquida, en qué empresa, en qué hoja
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Una fila por (persona, contrato vigente en el período) con las cuatro cosas que definen dónde
 * cae en el archivo de Memosoft: legajo, empresa, centro de costo y régimen. Es el cimiento: sin
 * esto resuelto no tiene sentido calcular un solo concepto.
 *
 * ES UNA FILA POR CONTRATO Y NO POR PERSONA, a propósito: alguien con dos contratos vigentes en
 * empresas distintas se liquida dos veces, con dos legajos, en dos hojas. Colapsarlo a una fila por
 * persona sería perder justamente el caso que el archivo tiene que contemplar.
 *
 * LO QUE NO RESUELVE NO SE INVENTA: va a `excepciones` con el motivo y el nombre de la persona.
 * Una liquidación con huecos visibles se arregla; una con huecos tapados, se paga mal.
 *
 * Sobre el peso: este servicio proyecta CADA campo que trae. Traer los contratos enteros de las
 * 700 personas son megabytes, y el cluster entrega a unos 90 KB/s (ver los `medir*.ts`): un padrón
 * "simple" sin proyección tarda minutos.
 */
export interface FiltrosPadron {
    empresaId?: string;
    ccCodigo?: string;
    tipoContratoId?: number;
    projectId?: string;
    rolFrame?: string;
    regimen?: Regimen;
}
export interface FilaPadron {
    /**
     * QUÉ CONTRATO ES, no qué persona.
     *
     * Hace falta porque alguien puede tener DOS contratos vigentes en el mismo proyecto —pasa con los
     * que cambian de categoría a mitad de mes—, y con (persona, proyecto) las excepciones de uno se
     * le pegaban al otro: filtrando por mensuales aparecían 16 avisos de un contrato jornalero que ni
     * siquiera estaba en la lista.
     */
    filaId: string;
    userId: string;
    apellidoYNombre: string;
    legajo: string | null;
    empresaId: string | null;
    empresaNombre: string | null;
    ccCodigo: string | null;
    ccNombre: string | null;
    regimen: Regimen | null;
    projectId: string;
    proyectoNombre: string;
    rolFrame: string | null;
    contrato: {
        nombre: string | null;
        tipoId: number | null;
        jornadas: number | null;
        alta: string;
        baja: string;
    };
    /** De dónde salió cada dato flojo. Sirve para saber cuánto del padrón se apoya en texto. */
    origen: {
        empresa: string | null;
        regimen: string | null;
        legajo: "por_empresa" | "tango" | null;
    };
}
export type TipoExcepcion = "empresa_sin_dato" | "empresa_ambigua" | "regimen_sin_dato" | "regimen_contradictorio" | "sin_legajo" | "legajo_duplicado" | "sin_centro_de_costo" | "centro_de_costo_ambiguo";
export interface ExcepcionPadron {
    tipo: TipoExcepcion;
    /** El contrato al que le pasa esto. Ver `FilaPadron.filaId`. */
    filaId: string;
    userId: string;
    apellidoYNombre: string;
    projectId: string;
    proyectoNombre: string;
    detalle: string;
}
export interface Padron {
    periodo: string;
    desde: string;
    hasta: string;
    filas: FilaPadron[];
    excepciones: ExcepcionPadron[];
    resumen: {
        contratos: number;
        personas: number;
        completos: number;
        conExcepcion: number;
        porRegimen: Record<string, number>;
    };
}
export declare function armarPadron(tenantId: Types.ObjectId, periodo: string, filtros?: FiltrosPadron): Promise<Padron>;
