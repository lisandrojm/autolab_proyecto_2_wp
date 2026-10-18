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
    /** Cuántas veces la automática ya la presentó y ARCA la rechazó (ver `MAX_INTENTOS_AUTOMATICOS`). */
    intentos: number;
    /** ISO del primero de esos rechazos; vacío si no hubo. */
    primerIntentoEl: string;
    /** Llegó al tope de intentos: la automática no insiste más; se puede forzar. */
    agotado: boolean;
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
    /** Avisa cuando la primera corrida arrancó (o falló al arrancar): el forzado en masa responde recién ahí, para que la pantalla ya la vea. */
    onArranque?: (r: {
        arranco: boolean;
        error?: string;
    }) => void;
    /** Se va completando corrida por corrida (el forzado en masa lo expone a la pantalla). */
    acumular?: (r: ResultadoEmpresa) => void;
}): Promise<ResultadoEmpresa[]>;
/** El forzado en masa de un tenant («Forzar presentación de N»): qué se pidió, qué corrida va y cómo terminó cada una. */
export interface ForzadoAltasEnCurso {
    arrancadoEl: Date;
    total: number;
    empresas: string[];
    resultados: ResultadoEmpresa[];
    omitidas: Array<{
        nombre: string;
        motivo: string;
    }>;
    terminado: boolean;
}
export declare const forzadoAltasDe: (tenantId: string) => ForzadoAltasEnCurso | undefined;
export declare function registrarForzadoAltas(tenantId: string, f: ForzadoAltasEnCurso): ForzadoAltasEnCurso;
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
