import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { Vacation } from "../models/Vacation.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import { nivelQueFalta } from "../compartido/vacaciones/etapaDeAprobacion.js";
import { cadenaDeAprobacion } from "../services/vacaciones/cadenaDeAprobacion.js";
import { avanzar } from "../services/vacaciones/aprobacionPorEtapas.js";
import { nombreDePersona } from "../services/novedadesNotificaciones.js";

/**
 * LAS SOLICITUDES PENDIENTES DE ANTES ENTRAN A LA JERARQUÍA (15/11/2026). EN SECO POR DEFECTO.
 *
 * Desde el 15/11 una solicitud sube Supervisor → Coordinador → Admin (ver
 * `compartido/vacaciones/etapaDeAprobacion.ts`). Las `pending` creadas antes no tienen `cadena` y la
 * bandeja del admin las muestra como suyas, pero el admin ya no pre-aprueba: así quedarían trabadas.
 *
 * Este script calcula la cadena de cada una (quién es su supervisor y su coordinador HOY) y lista adónde
 * iría. Con `--aplicar`:
 *   · guarda la cadena;
 *   · si le falta supervisor o coordinador, les avisa (la ven en «Aprobaciones» de la app);
 *   · si no tiene a nadie, la pre-aprueba (con su PDF) y pasa a «Para aprobar» del admin.
 * Las `pre_approved` no se tocan: el admin ya las pre-aprobó con el circuito viejo.
 *
 * También sirve para revisar que la cadena salga bien con datos reales antes de publicar.
 *
 * Uso (desde server/):
 *   npm run vacaciones:cadena               → en seco
 *   npm run vacaciones:cadena -- --aplicar  → escribe
 *   (TENANT_SLUG=<slug> para uno solo)
 */

const APLICAR = process.argv.includes("--aplicar");

async function main() {
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  console.log(APLICAR ? "APLICANDO.\n" : "En seco (con --aplicar escribe).\n");
  const tenants: any[] = await Tenant.find(process.env.TENANT_SLUG ? { slug: process.env.TENANT_SLUG } : {}).select("_id slug").lean();
  const nombres = new Map<string, string>();
  const nombre = async (id: unknown) => {
    const k = String(id);
    if (!nombres.has(k)) nombres.set(k, nombreDePersona(await User.findById(k).select("firstName lastName metadata.fullName").lean()));
    return nombres.get(k)!;
  };
  const proyecto = new Map<string, string>();
  const nombreProyecto = async (id: unknown) => {
    const k = String(id);
    if (!proyecto.has(k)) proyecto.set(k, String(((await Project.findById(k).select("name").lean()) as any)?.name || k));
    return proyecto.get(k)!;
  };

  const totales = { supervisor: 0, coordinador: 0, admin: 0, errores: 0 };
  for (const t of tenants) {
    const pendientes = await Vacation.find({ tenantId: t._id, status: "pending", "cadena.calculadaAt": { $exists: false } }).sort({ createdAt: 1 });
    if (!pendientes.length) continue;
    console.log(`== ${t.slug}: ${pendientes.length} pendientes sin cadena`);
    for (const v of pendientes) {
      try {
        const cadena = await cadenaDeAprobacion(t._id, String(v.userId));
        const va = nivelQueFalta({ cadena, aprobaciones: v.aprobaciones as any });
        totales[va]++;
        const detalle = [];
        for (const p of cadena.proyectos) {
          const s = await Promise.all(p.supervisores.map(nombre));
          const c = await Promise.all(p.coordinadores.map(nombre));
          detalle.push(`${await nombreProyecto(p.projectId)}: supervisor ${s.join(", ") || "—"} · coordinador ${c.join(", ") || "—"}`);
        }
        const inicio = v.startDate.toISOString().slice(0, 10);
        console.log(`  ${v.vacationNumber} ${v.userName} (${inicio}, ${v.daysRequested} d) → ${va.toUpperCase()}${inicio < new Date().toISOString().slice(0, 10) ? "  ⚠ ya empezó" : ""}`);
        for (const d of detalle) console.log(`      ${d}`);
        if (!detalle.length) console.log("      sin contrato vigente en ningún proyecto");
        if (APLICAR) {
          v.cadena = cadena as any;
          await v.save();
          await avanzar(v, t._id, null);
        }
      } catch (e: any) {
        totales.errores++;
        console.error(`  ${v.vacationNumber}: ERROR ${e?.message || e}`);
      }
    }
  }
  console.log(`\nVan al supervisor: ${totales.supervisor} · al coordinador: ${totales.coordinador} · directo al admin: ${totales.admin} · errores: ${totales.errores}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
