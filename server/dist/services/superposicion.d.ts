import { Types } from "mongoose";
import "../models/Client.js";
import { CompromisoExistente, PedidoDeAlta, Superposicion } from "../utils/superposicionContratos.js";
/** El pedido tal como viaja en la solicitud (`metadata` del payload). */
export declare function pedidoDesdeSolicitud(m: any): PedidoDeAlta;
/** Todo lo que la persona ya tiene comprometido: contratos (todos los proyectos) y solicitudes pendientes. */
export declare function compromisosDePersona(tenantId: Types.ObjectId, userId: string, excluirSolicitudId?: string): Promise<CompromisoExistente[]>;
/** El contrato que la persona ya tiene en esas fechas, si tiene (ver `contratoEnLasFechas`). */
export declare function contratoDePersonaEnFechas(tenantId: Types.ObjectId, userId: string | undefined, pedido: Pick<PedidoDeAlta, "desde" | "hasta" | "fechas">): Promise<CompromisoExistente | null>;
/** Por qué este alta ante ARCA no se puede hacer, o `null`. Sólo frena el trámite de ARCA, no el de Servicios. */
export declare function rechazoAltaArcaConContrato(tenantId: Types.ObjectId, userId: string | undefined, tramite: unknown, pedido: Pick<PedidoDeAlta, "desde" | "hasta" | "fechas">): Promise<string | null>;
/** Los avisos de superposición de un alta para una persona. `[]` si no es una persona registrada. */
export declare function superposicionesDeAlta(tenantId: Types.ObjectId, userId: string | undefined, pedido: PedidoDeAlta, excluirSolicitudId?: string): Promise<Superposicion[]>;
