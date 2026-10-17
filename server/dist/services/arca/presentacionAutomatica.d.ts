import { Types } from "mongoose";
import { type AfipCatalogs } from "../../compartido/arca/afipCompleteness.js";
import { ConfigAltasAutomaticas } from "./horarioAltasAutomaticas.js";
export declare function catalogosArca(): Promise<AfipCatalogs>;
export interface CandidatoAlta {
    userProjectId: string;
    contractIndex: number;
    userId: string;
    nombre: string;
    cuil: string;
    proyecto: string;
    cliente: string;
    tipoContrato: string;
    fechaAlta: string;
    fechaBaja: string;
    empresa: {
        _id: string;
        razonSocial: string;
    } | null;
    /** La próxima corrida automática que lo presenta, ISO. Vacío = más vieja que el límite de atrasadas: se fuerza a mano. */
    momento: string;
    /** Se puede presentar tal como está. */
    presentable: boolean;
    /** La baja ya pasó: la automática no lo toma (y no cuenta como omitido de una corrida), pero se puede forzar a mano. */
    terminado: boolean;
    /**
     * ARCA ya lo rechazó con un motivo que no cambia por insistir («ya posee una relación laboral
     * activa»): el texto de ese rechazo. La automática no lo vuelve a presentar; queda listado para que
     * alguien lo revise, y se puede forzar a mano. Ver `rechazoDefinitivo.ts`.
     */
    rechazoDefinitivo: string;
    /** Por qué no, si no se puede. */
    motivo: string;
    /** El registro de 85, si está completo. */
    registro: string | null;
}
/**
 * Las altas tempranas pendientes de presentar del tenant, con su registro armado o el motivo por el
 * que no se puede. `desde`/`hasta` acotan por fecha de alta; `soloContrato` busca uno puntual.
 */
export declare function candidatosDeAlta(tenantObjectId: Types.ObjectId, opts?: {
    desde?: string;
    hasta?: string;
    soloContrato?: {
        userProjectId: string;
        contractIndex: number;
    };
    cfg?: ConfigAltasAutomaticas;
}): Promise<CandidatoAlta[]>;
export interface ResultadoEmpresa {
    empresa: string;
    enviados: number;
    enSeco?: boolean;
    error?: string;
}
/**
 * Presenta los candidatos, una corrida por empleadora (en ARCA se entra con el CUIT de cada una), en
 * fila: cada corrida espera a que termine la anterior. Si hay otra corrida de ARCA en curso (una
 * validación de obras sociales, una presentación manual), espera a que se libere.
 */
export declare function presentarCandidatos(o: {
    tenantId: string;
    tenantObjectId: Types.ObjectId;
    usuarioId?: string;
    candidatos: CandidatoAlta[];
    automatica: boolean;
}): Promise<ResultadoEmpresa[]>;
/** La corrida del día de UN tenant: las altas de hoy (y de los próximos días, según la anticipación). Devuelve el resumen que se guarda. */
export declare function correrPresentacionDelDia(tenantId: string, tenantObjectId: Types.ObjectId, cfg: ConfigAltasAutomaticas): Promise<{
    fecha: string;
    dia: string;
    empresas: ResultadoEmpresa[];
    omitidos: {
        nombre: string;
        cuil: string;
        empresa: string;
        motivo: string;
    }[];
}>;
