import { Types } from "mongoose";
import { Modalidad } from "../models/Modalidad.js";

/** Las que trae una productora que todavía no cargó ninguna. Presencial es la por defecto. */
export const MODALIDADES_INICIALES = [
  { name: "Presencial", orden: 1, esDefault: true },
  { name: "Remoto", orden: 2, esDefault: false },
  { name: "Híbrido", orden: 3, esDefault: false },
];

/**
 * Siembra las modalidades iniciales si el tenant no tiene NINGUNA (ni siquiera apagadas): si borró o
 * renombró alguna, eso fue una decisión suya y no se le vuelve a poner. `upsert` por nombre para que
 * dos pedidos simultáneos no choquen contra el índice único.
 */
export async function asegurarModalidades(tenantId: Types.ObjectId | string): Promise<void> {
  const tid = new Types.ObjectId(String(tenantId));
  if (await Modalidad.exists({ tenantId: tid })) return;
  await Promise.all(
    MODALIDADES_INICIALES.map((m) =>
      Modalidad.updateOne({ tenantId: tid, name: m.name }, { $setOnInsert: { ...m, tenantId: tid, externalId: "", data: { nombre: m.name }, activo: true } }, { upsert: true }).catch(() => undefined),
    ),
  );
}

/** La modalidad por defecto del tenant (la marcada; si no hay marcada, la primera activa por orden). */
export async function modalidadPorDefecto(tenantId: Types.ObjectId | string): Promise<{ _id: Types.ObjectId; name: string } | null> {
  await asegurarModalidades(tenantId);
  const tid = new Types.ObjectId(String(tenantId));
  const marcada = await Modalidad.findOne({ tenantId: tid, esDefault: true, activo: { $ne: false } }).select("name").lean();
  if (marcada) return marcada as any;
  return (await Modalidad.findOne({ tenantId: tid, activo: { $ne: false } }).sort({ orden: 1, name: 1 }).select("name").lean()) as any;
}

/**
 * Qué modalidad se guarda en un contrato que llega de un formulario.
 *
 * Vacío → la por defecto (la regla: «por defecto, presencial»). Un id tiene que ser de ESTE tenant;
 * apagada se acepta sólo si es la que el contrato ya tenía (editar un contrato viejo no puede
 * obligar a cambiársela).
 */
export async function modalidadParaGuardar(tenantId: Types.ObjectId | string, bruto: unknown, anteriorId?: unknown): Promise<{ modalidadId: Types.ObjectId | null; nombre_modalidad: string } | { error: string }> {
  const id = bruto == null ? "" : String(bruto).trim();
  if (!id) {
    const def = await modalidadPorDefecto(tenantId);
    return { modalidadId: def?._id ?? null, nombre_modalidad: def?.name ?? "" };
  }
  if (!Types.ObjectId.isValid(id)) return { error: "La modalidad elegida no es válida." };
  const m: any = await Modalidad.findOne({ _id: id, tenantId: new Types.ObjectId(String(tenantId)) }).select("name activo").lean();
  if (!m) return { error: "La modalidad elegida no existe. Recargá la página y elegila de nuevo." };
  if (m.activo === false && String(anteriorId ?? "") !== id) return { error: `La modalidad «${m.name}» está inactiva: no se puede usar en un contrato nuevo.` };
  return { modalidadId: m._id, nombre_modalidad: m.name };
}
