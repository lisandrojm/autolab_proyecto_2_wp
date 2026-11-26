import { Types } from "mongoose";
import { type RelacionArcaResumida } from "./arca/altasVigentes.js";
import "../models/Client.js";
import { CompromisoExistente, PedidoDeAlta, Superposicion } from "../utils/superposicionContratos.js";
import { type Liquidacion } from "../compartido/altaVigente.js";
/** El pedido tal como viaja en la solicitud (`metadata` del payload). */
export declare function pedidoDesdeSolicitud(m: any): PedidoDeAlta;
/** Todo lo que la persona ya tiene comprometido: contratos (todos los proyectos) y solicitudes pendientes. */
export declare function compromisosDePersona(tenantId: Types.ObjectId, userId: string, excluirSolicitudId?: string): Promise<CompromisoExistente[]>;
/**
 * LO MISMO PARA VARIAS PERSONAS, EN UNA SOLA LECTURA (26/11/2026). El alta masiva de plantillas revisa a
 * 36 personas de una vez y por cada una hacía estas cinco consultas, dos veces (avisos y altas de ARCA):
 * 360 idas a la base, y el preview tardaba lo que tardaban en volver. Acá son las mismas cinco para
 * todas juntas. Por `userId`; quien no tiene nada, lista vacía. Un id inválido no figura.
 */
export declare function compromisosDePersonas(tenantId: Types.ObjectId, userIds: string[], excluirSolicitudId?: string): Promise<Map<string, CompromisoExistente[]>>;
/**
 * Lee el trámite de un contrato: tipo → plantilla → el estado impositivo que la reclama, el mismo camino
 * que el tag de las pantallas (`estadoImpositivoDelContrato`). No se usa el estado del contrato: avanza por
 * el circuito y deja de decir el trámite. Sin plantilla o sin estado que la reclame, `null`: no se adivina.
 */
/**
 * El trámite (`alta_temprana_afip`, `constancia_cuit`…) del tipo de cada contrato, con las plantillas y los
 * estados impositivos leídos UNA vez. Lo usan también la bandeja Contratos y el panel de Modificaciones y Bajas.
 */
export declare function lectorDeTramites(): Promise<(tipo: CompromisoExistente["tipo"]) => string | null>;
/**
 * LAS BAJAS DE ARCA SOBRE LOS CONTRATOS (18/11/2026). Un contrato a tiempo indeterminado sin fecha de baja
 * en WeProdu cubre cualquier fecha futura, aunque en ARCA la relación ya terminó: la baja llega al espejo
 * (`RelacionLaboralArca`) pero no al contrato. Antes de mirar si se pisa, cada contrato toma la baja de
 * ARCA con el MISMO match de la presentación de altas (`bajaDeArcaQueAplica`: CUIL + CUIT de la empresa
 * del contrato + fecha de alta exacta). Sin empresa, sin CUIT o sin relación en ARCA queda como está.
 * `cuitDe`: `empresaId` → CUIT. Puro.
 */
export declare function compromisosConBajasDeArca(compromisos: CompromisoExistente[], relaciones: RelacionArcaResumida[], cuil: string, cuitDe: (empresaId: string) => string): CompromisoExistente[];
/** Lo que el cruce con ARCA necesita de la base para un grupo de personas: el CUIL de cada una, el CUIT y el nombre de cada empresa, y sus relaciones. */
interface LecturaArca {
    cuilDe: (userId: string) => string;
    cuitDe: (empresaId: string) => string;
    nombreEmpresa: (empresaId: string) => string;
    relaciones: RelacionArcaResumida[];
}
/**
 * Los códigos de ARCA de cada tipo de contrato (por `contrato_id`, o por el nombre en los contratos viejos)
 * con la cascada global, como el registro de alta (`afipCompleteness`, sin escalón de empresa): la
 * liquidación (el código, que decide) y, para decirlo, «código - nombre» de la liquidación y de la modalidad.
 */
declare function lectorDeCodigosArca(): Promise<(tipo: CompromisoExistente["tipo"]) => {
    liquidacion: string;
    liquidacionTexto: string;
    modalidadTexto: string;
}>;
/** Un contrato de ARCA de la persona que se cruza con lo pedido, con su liquidación y su empresa. */
export interface AltaArcaEnFechas extends CompromisoExistente {
    liquidacion: Liquidacion;
    origenLiquidacion: "arca" | "tipo" | "sin_dato";
    empresaNombre: string;
    nombreContrato: string;
    modalidadContrato: string;
    liquidacionTexto: string;
}
/**
 * Los contratos DE ARCA (trámite `alta_temprana_afip`) que la persona ya tiene en esas fechas, cada uno
 * con su liquidación: la de su relación en ARCA (misma persona, misma empleadora, misma fecha de alta) y,
 * si no está, la de su tipo de contrato. Uno de Servicios no cuenta.
 */
/** El contrato que se está editando: no se frena consigo mismo. */
export type ContratoExcluido = {
    userProjectId: string;
    contractIndex: number;
} | null | undefined;
/**
 * TODO LO QUE EL CHEQUEO DE UN ALTA LEE DE LA BASE, UNA VEZ PARA UN GRUPO DE PERSONAS: los compromisos de
 * cada una, lo de ARCA y los catálogos (trámites y códigos). El alta masiva de plantillas lo arma una vez
 * y se lo pasa a cada persona (`superposicionesDeAlta`, `decisionAltaDePersona`); el alta individual no
 * lo pasa, y cada función lo lee para esa sola persona, como siempre.
 */
export interface LecturasDeAlta {
    compromisos: Map<string, CompromisoExistente[]>;
    arca: LecturaArca;
    /** Los catálogos, leídos la primera vez que hacen falta: sólo si alguien ya tiene un contrato en esas fechas. */
    lectores: () => Promise<{
        tramiteDe: Awaited<ReturnType<typeof lectorDeTramites>>;
        codigosDelTipo: Awaited<ReturnType<typeof lectorDeCodigosArca>>;
    }>;
}
export declare function lecturasDeAlta(tenantId: Types.ObjectId, userIds: (string | undefined)[]): Promise<LecturasDeAlta>;
export declare function altasArcaEnFechas(tenantId: Types.ObjectId, userId: string | undefined, pedido: Pick<PedidoDeAlta, "desde" | "hasta" | "fechas">, excluir?: ContratoExcluido, lecturas?: LecturasDeAlta): Promise<AltaArcaEnFechas[]>;
export interface DecisionAlta {
    /** Un alta mensual en esas fechas: sólo Servicios. */
    soloServicios: AltaArcaEnFechas | null;
    /** Un alta por jornada con la misma empresa en esas fechas: no otra alta de ARCA con ella. */
    mismaEmpleadora: AltaArcaEnFechas | null;
    /** El primero de los dos, ya dicho. Vacío si nada frena. */
    mensaje: string;
    /** Todas las altas de ARCA en esas fechas, frenen o no (para avisar cuando todavía no hay fechas). */
    altas: AltaArcaEnFechas[];
}
/** La regla de `compartido/altaVigente.ts` sobre las altas de la persona en esas fechas. */
export declare function decisionAltaDePersona(tenantId: Types.ObjectId, userId: string | undefined, pedido: Pick<PedidoDeAlta, "desde" | "hasta" | "fechas">, empresaId?: string | null, excluir?: ContratoExcluido, lecturas?: LecturasDeAlta): Promise<DecisionAlta>;
/**
 * Por qué este alta ante ARCA no se puede hacer, o `null`. Sólo frena el trámite de ARCA, no el de
 * Servicios. `empresaId`: la empresa del contrato nuevo (sin ella no se revisa la misma empleadora).
 */
export declare function rechazoAltaArcaConContrato(tenantId: Types.ObjectId, userId: string | undefined, tramite: unknown, pedido: Pick<PedidoDeAlta, "desde" | "hasta" | "fechas">, empresaId?: string | null, excluir?: ContratoExcluido): Promise<string | null>;
/** El trámite de un tipo de contrato por su `_id` (tipo → plantilla → estado impositivo), o `null`. */
/** El trámite del tipo de UN contrato (por su `contrato_id`, o por el nombre en los viejos). */
export declare function tramiteDelContrato(c: {
    nombre_contrato?: string;
    tipo_contrato_id?: unknown;
    contrato_id?: unknown;
}): Promise<string | null>;
export declare function tramiteDelTipo(contratoId: unknown): Promise<string | null>;
/** Los avisos de superposición de un alta para una persona. `[]` si no es una persona registrada. `compromisos`: los ya leídos para el lote (ver `lecturasDeAlta`). */
export declare function superposicionesDeAlta(tenantId: Types.ObjectId, userId: string | undefined, pedido: PedidoDeAlta, excluirSolicitudId?: string, compromisos?: CompromisoExistente[]): Promise<Superposicion[]>;
export {};
