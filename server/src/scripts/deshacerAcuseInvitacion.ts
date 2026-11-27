/**
 * DESHACE EL ACUSE DE RECIBO DE LA INVITACIÓN DE UNA PERSONA EN UNA CAMPAÑA DE VACACIONES (27/11/2026): el recibo
 * vuelve a «No» y, si estaba en «Acusó recibo», el estado vuelve a «Invitado». No borra nada: queda anotado en el
 * historial. Pensado para volver a probar el flujo del empleado, o si la persona dice que no acusó.
 *
 * Sólo mientras todavía puede elegir («Invitado», «Acusó recibo» o «Propuesta rechazada»): si ya propuso fechas, el
 * acuse es parte de la propuesta y no se toca (se niega).
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/deshacerAcuseInvitacion.ts \
 *       (--invitacion <invId> | --nombre <texto>) [--campania <campaniaId>] [--commit]
 *
 * Sin --campania usa la única campaña lanzada (si hay más de una, hay que decir cuál). En seco por defecto.
 */

import mongoose from "mongoose";
import { CampaniaVacaciones, InvitacionVacaciones } from "../models/CampaniaVacaciones.js";
import { contextoDeScript } from "../utils/contextoAuditoria.js";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const PUEDEN_VOLVER = ["invitado", "acuso_recibo", "rechazada"];

async function main() {
  const commit = process.argv.includes("--commit");
  const invId = arg("--invitacion");
  const nombre = arg("--nombre");
  if (!invId && !nombre) throw new Error("Falta --invitacion <id> o --nombre <texto>.");
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  contextoDeScript("deshacerAcuseInvitacion", { motivo: "Deshacer el acuse de recibo de la invitación a elegir vacaciones, a pedido del administrador." });

  let campaniaId = arg("--campania");
  if (!campaniaId) {
    const lanzadas: any[] = await CampaniaVacaciones.find({ estado: "lanzada" }).select("_id nombre tenantId").lean();
    if (lanzadas.length !== 1) throw new Error(lanzadas.length === 0 ? "No hay ninguna campaña lanzada: indicá --campania <id>." : `Hay ${lanzadas.length} campañas lanzadas, indicá --campania <id>: ${lanzadas.map((c) => `${c._id} «${c.nombre}»`).join(" · ")}`);
    campaniaId = String(lanzadas[0]._id);
  }
  if (!mongoose.isValidObjectId(campaniaId)) throw new Error("--campania no es un id válido.");
  const c: any = await CampaniaVacaciones.findById(campaniaId).lean();
  if (!c) throw new Error("No existe esa campaña.");

  const filtro: any = { campaniaId: c._id, ...(invId ? { _id: invId } : { nombre: new RegExp(String(nombre).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }) };
  const invs: any[] = await InvitacionVacaciones.find(filtro).lean();
  console.log(`${commit ? "MODO COMMIT" : "DRY-RUN"} · campaña «${c.nombre}» (${c.estado}) · ${invs.length} registro(s) que coinciden`);
  if (invs.length !== 1) throw new Error(invs.length === 0 ? "No hay ningún registro que coincida." : `Coinciden ${invs.length}: afiná con --invitacion <id>: ${invs.map((i) => `${i._id} ${i.nombre}`).join(" · ")}`);
  const inv = invs[0];
  const acuse = inv.acuseInvitacionAt ? new Date(inv.acuseInvitacionAt).toISOString() : "-";
  console.log(`  ${inv._id} · ${inv.nombre} · estado ${inv.estado} · acuse ${acuse} · tramos ${inv.tramos?.length || 0} · historial ${inv.historial?.length || 0}`);

  if (!inv.acuseInvitacionAt) {
    console.log("  Ya está sin acuse: no hay nada que deshacer.");
    return;
  }
  if (!PUEDEN_VOLVER.includes(inv.estado)) throw new Error(`Está «${inv.estado}»: el acuse ya es parte de su propuesta y no se deshace. Si hace falta, primero se cancela la propuesta.`);
  const estadoNuevo = inv.estado === "acuso_recibo" ? "invitado" : inv.estado;
  console.log(`  → acuse: ${acuse} → (ninguno) · estado: ${inv.estado} → ${estadoNuevo} · se anota en el historial`);
  if (!commit) {
    console.log("Con --commit se aplica.");
    return;
  }
  const r = await InvitacionVacaciones.updateOne(
    { _id: inv._id, acuseInvitacionAt: inv.acuseInvitacionAt },
    { $set: { acuseInvitacionAt: null, estado: estadoNuevo }, $push: { historial: { accion: "acuse_deshecho", porUserId: null, at: new Date(), detalle: `El administrador deshizo el acuse de recibo del ${acuse} (script). Vuelve a «${estadoNuevo}».` } } } as any,
  );
  if (r.modifiedCount !== 1) throw new Error("No se aplicó: el registro cambió mientras tanto. Volvé a correrlo.");
  console.log(`✔ Deshecho el acuse de ${inv.nombre}: recibo «No», estado «${estadoNuevo}».`);
}

main()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e?.message || e);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
