/**
 * VERIFICA EN ARCA LAS ALTAS TRABADAS por «ARCA ya tiene un alta de ese día» (ver
 * `services/arca/verificacionAltas.ts`). Lo mismo que hace la corrida del día y el botón «Reverificar en
 * ARCA», a mano y con salida por consola.
 *
 * EN SECO POR DEFECTO: consulta ARCA (Relaciones Laborales → Consultas, solo lectura) y dice qué se
 * decidiría, sin escribir nada en los contratos. Con `APLICAR=1` aplica: marca presentadas las que ya
 * están en ARCA y deja en revisión manual el resto, con su auditoría. (Abrir la sesión de ARCA renueva
 * la cookie guardada del tenant, como cualquier corrida: es lo único que se escribe en seco.)
 *
 * Uso (desde server/):
 *
 *   ./node_modules/.bin/dotenv -e .env.production -v TENANT=demo-tenant [-v APLICAR=1 | -v SOLO_LISTAR=1] [-v CUILS=20381538487,20381514294] \
 *     -- ./node_modules/.bin/tsx src/scripts/verificarAltasTrabadas.ts
 */
import mongoose, { Types } from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { candidatosDeAlta } from "../services/arca/presentacionAutomatica.js";
import { itemDe, verificarAltasEnArca } from "../services/arca/verificacionAltas.js";

const fecha = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

async function main() {
  const tenantRef = process.env.TENANT || "";
  const aplicar = process.env.APLICAR === "1";
  const cuils = new Set(String(process.env.CUILS || "").split(",").map((c) => c.replace(/\D/g, "")).filter(Boolean));
  if (!tenantRef) throw new Error("Falta TENANT (slug o id).");
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  const tenant: any = mongoose.isValidObjectId(tenantRef) ? await Tenant.findById(tenantRef).lean() : await Tenant.findOne({ slug: tenantRef }).lean();
  if (!tenant) throw new Error(`No encontré el tenant ${tenantRef}`);
  const tenantObjectId = new Types.ObjectId(String(tenant._id));

  const candidatos = await candidatosDeAlta(tenantObjectId);
  const trabadas = candidatos.filter((c) => (c.verificable || c.otroContratoMismoDia) && (cuils.size === 0 || cuils.has(c.cuil)));
  console.log(`${aplicar ? "APLICANDO" : "EN SECO (no escribe nada)"} · ${trabadas.length} alta(s) trabada(s) por un alta del mismo día:`);
  for (const c of trabadas) console.log(`  · ${c.nombre} (${c.cuil}) · ${c.empresa?.razonSocial} · ${c.tipoContrato} ${fecha(c.fechaAlta)}–${fecha(c.fechaBaja)}${c.otroContratoMismoDia ? " · duplicado en WeProdu" : ""}`);
  // SOLO_LISTAR=1: sólo la base, sin abrir ARCA.
  if (trabadas.length === 0 || process.env.SOLO_LISTAR === "1") return;

  const r = await verificarAltasEnArca({ tenantId: String(tenant._id), tenantObjectId, items: trabadas.map(itemDe), automatica: false, enSeco: !aplicar });
  console.log("\nResultado:");
  for (const x of r) {
    const vistas = x.consulta && x.consulta.ok ? x.consulta.relaciones.map((rel) => `${fecha(rel.inicio)}–${rel.fin ? fecha(rel.fin) : "sin fin"}${rel.baja ? ` (baja: ${rel.baja})` : ""}`).join(", ") || "ninguna" : x.consulta && x.consulta.ok === false ? `error: ${x.consulta.error}` : "no se consultó";
    console.log(`\n■ ${x.item.nombre} (${x.item.cuil}) · alta ${fecha(x.item.alta)} baja ${fecha(x.item.baja)}`);
    console.log(`  ARCA muestra: ${vistas}`);
    console.log(`  Decisión: ${x.decision.accion === "presentada" ? "PRESENTADA (ya estaba en ARCA)" : "REVISIÓN MANUAL"} → ${x.accion}`);
    console.log(`  ${x.decision.motivo}`);
  }
}

main()
  .catch((e) => {
    console.error("Error:", e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
