import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Tenant } from "../models/Tenant.js";
import { CampaniaVacaciones } from "../models/CampaniaVacaciones.js";
import { contextoDeScript } from "../utils/contextoAuditoria.js";
import { cambiarFechaLimite } from "../services/vacaciones/campaniaVacaciones.js";
/**
 * CAMBIAR LA FECHA LÍMITE PARA ELEGIR DE UNA CAMPAÑA DE GOCE LANZADA (23/11/2026). EN SECO POR DEFECTO.
 *
 * Lo mismo que `PUT /campanias-vacaciones/:id/fecha-limite` (`cambiarFechaLimite`): mueve la fecha de la campaña y la
 * de cada invitación a la que todavía le corre el plazo, con su paso en el historial. No avisa a nadie.
 *
 * Uso (desde server/):
 *   npm run vacaciones:fecha-limite -- --fecha 2026-12-18               → en seco (la campaña lanzada del tenant)
 *   npm run vacaciones:fecha-limite -- --fecha 2026-12-18 --aplicar     → escribe
 *   --campania <id> si hay más de una lanzada; TENANT_SLUG=<slug> para otro tenant.
 */
const arg = (nombre) => {
    const i = process.argv.indexOf(`--${nombre}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
};
async function main() {
    const aplicar = process.argv.includes("--aplicar");
    const fecha = arg("fecha");
    if (!fecha)
        throw new Error("Falta --fecha aaaa-mm-dd");
    contextoDeScript("campaniaFechaLimite", { motivo: `Fecha límite de la campaña de goce al ${fecha}` });
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const t = await Tenant.findOne({ slug: process.env.TENANT_SLUG || "demo-tenant" }).select("_id").lean();
    if (!t)
        throw new Error("No encontré el tenant.");
    const pedida = arg("campania");
    const lanzadas = await CampaniaVacaciones.find({ tenantId: t._id, estado: "lanzada", ...(pedida ? { _id: pedida } : {}) }).select("nombre").lean();
    if (lanzadas.length !== 1)
        throw new Error(lanzadas.length ? `Hay ${lanzadas.length} campañas lanzadas: elegí una con --campania (${lanzadas.map((c) => `${c._id} «${c.nombre}»`).join(", ")}).` : "No hay ninguna campaña lanzada.");
    const r = await cambiarFechaLimite(t._id, String(lanzadas[0]._id), fecha, null, { enSeco: !aplicar });
    console.log(`${aplicar ? "APLICADO" : "EN SECO"} · «${r.campania}» · fecha límite ${r.anterior || "—"} → ${r.nueva} · ${r.invitaciones} invitaciones a las que les corre el plazo · a quien no elija se le asigna desde el ${r.primeraAsignacion}${r.aplicado ? "" : aplicar ? " · no cambió nada (ya tenía esa fecha)" : " · nada escrito: correlo con --aplicar"}`);
    await mongoose.disconnect();
}
main().catch(async (e) => {
    console.error(e?.message || e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
