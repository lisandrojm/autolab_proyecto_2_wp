/**
 * BORRA EL REGISTRO ENTERO DE UNA PERSONA EN UNA CAMPAÑA DE VACACIONES (24/11/2026): la invitación con su acuse,
 * propuesta, aviso, historial y recordatorios. Es lo mismo que el tacho de la fila en Vacaciones → Campaña, por
 * si hay que hacerlo sin la pantalla. Sólo si la persona no tiene solicitudes vivas de la campaña (el servicio lo
 * comprueba y se niega). En seco por defecto.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/eliminarInvitacionCampania.ts \
 *       --campania <campaniaId> (--invitacion <invId> | --nombre <texto>) [--commit]
 */
import mongoose from "mongoose";
import { CampaniaVacaciones, InvitacionVacaciones } from "../models/CampaniaVacaciones.js";
import { Vacation } from "../models/Vacation.js";
import { eliminarInvitacion } from "../services/vacaciones/campaniaVacaciones.js";
import { contextoDeScript } from "../utils/contextoAuditoria.js";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const commit = process.argv.includes("--commit");
  const campaniaId = arg("--campania") || "";
  const invId = arg("--invitacion");
  const nombre = arg("--nombre");
  if (!mongoose.isValidObjectId(campaniaId) || (!invId && !nombre)) throw new Error("Faltan --campania <id> y --invitacion <id> o --nombre <texto>.");
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  contextoDeScript("eliminarInvitacionCampania", { motivo: "Borrar el registro de una persona en la campaña de vacaciones, a pedido del administrador." });
  const c: any = await CampaniaVacaciones.findById(campaniaId).lean();
  if (!c) throw new Error("No existe esa campaña.");
  const filtro: any = { campaniaId: c._id, ...(invId ? { _id: invId } : { nombre: new RegExp(String(nombre).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }) };
  const invs: any[] = await InvitacionVacaciones.find(filtro).lean();
  console.log(`${commit ? "MODO COMMIT" : "DRY-RUN"} · campaña «${c.nombre}» (${c.estado}) · ${invs.length} registro(s) que coinciden`);
  if (invs.length !== 1) throw new Error(invs.length === 0 ? "No hay ningún registro que coincida." : `Coinciden ${invs.length}: afiná con --invitacion <id>: ${invs.map((i) => `${i._id} ${i.nombre}`).join(" · ")}`);
  const inv = invs[0];
  const ids = [...(inv.tramos || []).map((t: any) => t.vacationId), inv.asignacion?.vacationId].filter(Boolean);
  const vivas = ids.length ? await Vacation.find({ _id: { $in: ids } }).select("startDate endDate status").lean() : [];
  console.log(`  ${inv._id} · ${inv.nombre} · estado ${inv.estado} · acuse ${inv.acuseInvitacionAt ? new Date(inv.acuseInvitacionAt).toISOString() : "-"} · tramos ${inv.tramos?.length || 0} · asignación ${inv.asignacion?.desde || "-"} · historial ${inv.historial?.length || 0} · solicitudes vivas ${vivas.length}`);
  if (!commit) {
    console.log(vivas.length ? "No se podría borrar: tiene solicitudes vivas. Eliminalas primero." : "Con --commit se borra el registro entero (y se rearman los turnos si la campaña está lanzada).");
    return;
  }
  const r = await eliminarInvitacion(c.tenantId, String(c._id), String(inv._id), null);
  console.log(`✔ Borrado el registro de ${r.nombre} (estaba ${r.estado}) en «${r.campania}».`);
}

main()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e?.message || e);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
