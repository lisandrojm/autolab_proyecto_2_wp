import { Types } from "mongoose";
import { type AfipCatalogs } from "../../compartido/arca/afipCompleteness.js";
import { ConfigAltasAutomaticas } from "./horarioAltasAutomaticas.js";
export declare function catalogosArca(): Promise<AfipCatalogs>;
export interface CandidatoAlta {
    userProjectId: string;
    contractIndex: number;
    userId: string;
    /** Para editar o eliminar el contrato desde la cola (las rutas del equipo van por proyecto y persona). */
    projectId: string;
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
    /** La próxima corrida automática que lo presenta, ISO. */
    momento: string;
    /** Se puede presentar tal como está. */
    presentable: boolean;
    /** La baja ya pasó. Informativo: igual entra en la automática. */
    terminado: boolean;
    /**
     * ARCA ya lo rechazó con un motivo del padrón («ya posee una relación laboral activa»): el texto de ese
     * rechazo, para que alguien lo revise. Informativo: sigue en la cola. Ver `rechazoDefinitivo.ts`.
     */
    rechazoDefinitivo: string;
    /** Cuántas veces la automática ya la presentó y ARCA la rechazó. */
    intentos: number;
    /** ISO del primero de esos rechazos; vacío si no hubo. */
    primerIntentoEl: string;
    /** ISO del último rechazo; vacío si no está rechazada. Va al final de la próxima pasada (la del padrón, mañana). */
    rechazadaEl: string;
    /** Cuántas veces se mandó a ARCA, automática o forzada, con cualquier resultado. */
    envios: number;
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
    ultimaCola?: string;
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
    /** Se suma al nombre de cada corrida en el resumen («atrasadas»). */
    rotulo?: string;
    /** Se mira antes de cada lote: true = no arrancar más corridas (la cola le deja el paso a la corrida del día). */
    debeCortar?: () => boolean;
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
/**
 * Una corrida automática de UN tenant. Devuelve el resumen que se guarda.
 *   · "dia": la de la hora fija. PRIMERO las altas de su día (fecha de alta de hoy en adelante, hasta la
 *     anticipación), en corridas propias; DESPUÉS, en otras corridas, la cola de atrasadas. Así una falla
 *     de la cola no atrasa las del día.
 *   · "cola": modo frecuente, entre corrida y corrida del día: sólo lo que ya tuvo su turno. Corta entre
 *     lotes si llega la hora del día (`debeCortar`).
 */
export declare function correrPresentacionAutomatica(tenantId: string, tenantObjectId: Types.ObjectId, cfg: ConfigAltasAutomaticas, tipo: "dia" | "cola", o?: {
    debeCortar?: () => boolean;
}): Promise<{
    fecha: string;
    dia: string;
    tipo: "dia" | "cola";
    empresas: ResultadoEmpresa[];
    omitidos: {
        nombre: string;
        cuil: string;
        empresa: string;
        motivo: string;
    }[];
}>;
