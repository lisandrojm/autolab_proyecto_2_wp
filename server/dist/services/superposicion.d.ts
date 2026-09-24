import { Types } from "mongoose";
import "../models/Client.js";
import { CompromisoExistente, PedidoDeAlta, Superposicion } from "../utils/superposicionContratos.js";
/** El pedido tal como viaja en la solicitud (`metadata` del payload). */
export declare function pedidoDesdeSolicitud(m: any): PedidoDeAlta;
/** Todo lo que la persona ya tiene comprometido: contratos (todos los proyectos) y solicitudes pendientes. */
export declare function compromisosDePersona(tenantId: Types.ObjectId, userId: string, excluirSolicitudId?: string): Promise<CompromisoExistente[]>;
/** Los avisos de superposición de un alta para una persona. `[]` si no es una persona registrada. */
export declare function superposicionesDeAlta(tenantId: Types.ObjectId, userId: string | undefined, pedido: PedidoDeAlta, excluirSolicitudId?: string): Promise<Superposicion[]>;
