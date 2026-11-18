import { Types } from "mongoose";
import { type RelacionArcaResumida } from "./arca/altasVigentes.js";
import "../models/Client.js";
import { CompromisoExistente, PedidoDeAlta, Superposicion } from "../utils/superposicionContratos.js";
/** El pedido tal como viaja en la solicitud (`metadata` del payload). */
export declare function pedidoDesdeSolicitud(m: any): PedidoDeAlta;
/** Todo lo que la persona ya tiene comprometido: contratos (todos los proyectos) y solicitudes pendientes. */
export declare function compromisosDePersona(tenantId: Types.ObjectId, userId: string, excluirSolicitudId?: string): Promise<CompromisoExistente[]>;
/**
 * LAS BAJAS DE ARCA SOBRE LOS CONTRATOS (18/11/2026). Un contrato a tiempo indeterminado sin fecha de baja
 * en WeProdu cubre cualquier fecha futura, aunque en ARCA la relación ya terminó: la baja llega al espejo
 * (`RelacionLaboralArca`) pero no al contrato. Antes de mirar si se pisa, cada contrato toma la baja de
 * ARCA con el MISMO match de la presentación de altas (`bajaDeArcaQueAplica`: CUIL + CUIT de la empresa
 * del contrato + fecha de alta exacta). Sin empresa, sin CUIT o sin relación en ARCA queda como está.
 * `cuitDe`: `empresaId` → CUIT. Puro.
 */
export declare function compromisosConBajasDeArca(compromisos: CompromisoExistente[], relaciones: RelacionArcaResumida[], cuil: string, cuitDe: (empresaId: string) => string): CompromisoExistente[];
/** El contrato DE ARCA que la persona ya tiene en esas fechas, si tiene. Uno de Servicios no traba nada. */
export declare function contratoDePersonaEnFechas(tenantId: Types.ObjectId, userId: string | undefined, pedido: Pick<PedidoDeAlta, "desde" | "hasta" | "fechas">): Promise<CompromisoExistente | null>;
/** Por qué este alta ante ARCA no se puede hacer, o `null`. Sólo frena el trámite de ARCA, no el de Servicios. */
export declare function rechazoAltaArcaConContrato(tenantId: Types.ObjectId, userId: string | undefined, tramite: unknown, pedido: Pick<PedidoDeAlta, "desde" | "hasta" | "fechas">): Promise<string | null>;
/** Los avisos de superposición de un alta para una persona. `[]` si no es una persona registrada. */
export declare function superposicionesDeAlta(tenantId: Types.ObjectId, userId: string | undefined, pedido: PedidoDeAlta, excluirSolicitudId?: string): Promise<Superposicion[]>;
