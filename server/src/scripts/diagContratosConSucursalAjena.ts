/**
 * DIAGNÓSTICO, SÓLO LECTURA: contratos que quedaron con una sucursal o una actividad que SU empresa no
 * tiene en ARCA, y contratos todavía sin presentar que van a necesitar que alguien elija la actividad.
 *
 * Se evalúa contra lo que ARCA tiene (`scripts/datos/sucursalesPorEmpresaArca.ts`), es decir contra
 * cómo queda cada empresa después de `cargarSucursalesPorEmpresa.ts --quitar`, con la misma regla que
 * va a frenar los TXT (`problemaDeSucursalYActividad`). No corrige nada: lista, para decidir.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/diagContratosConSucursalAjena.ts
 */
import mongoose from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Company } from "../models/Company.js";
import { ArcaSucursal } from "../models/ArcaSucursal.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { planSucursalesPorEmpresa } from "../utils/planSucursalesPorEmpresa.js";
import { codigoDeSucursalParaEmpresa, problemaDeSucursalYActividad, TEXTO_PROBLEMA_SUCURSAL } from "../compartido/sucursalesDeEmpresa.js";
import { claveEstado } from "../utils/estadoClave.js";
import { SUCURSALES_POR_EMPRESA_ARCA } from "./datos/sucursalesPorEmpresaArca.js";

const soloDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const dia = (v: unknown) => String(v instanceof Date ? v.toISOString() : v || "").slice(0, 10);
/** Estados en los que el alta todavía no se presentó: ahí la actividad se va a necesitar. */
const SIN_PRESENTAR = new Set(["pedido de afip"]);

async function main() {
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  const cuits = new Set(SUCURSALES_POR_EMPRESA_ARCA.map((e) => soloDigitos(e.cuit)));
  const empresas: any[] = (await Company.find({}).select("razonSocial cuit sucursalIds sucursalActividades defaultsArca.sucursalId").lean()).filter((e: any) => cuits.has(soloDigitos(e.cuit)));
  const catalogo: any[] = await ArcaSucursal.find({}).select("domicilio codigo").lean();
  const domicilio = new Map(catalogo.map((d) => [String(d._id), `${d.domicilio}`]));
  const codigoCatalogo = new Map(catalogo.map((d) => [String(d._id), String(d.codigo || "")]));

  // Cómo queda cada empresa según ARCA (el plan con `quitar`), sin escribir nada.
  const plan = planSucursalesPorEmpresa({
    datos: SUCURSALES_POR_EMPRESA_ARCA,
    empresas: empresas.map((e) => ({ _id: String(e._id), cuit: String(e.cuit || ""), razonSocial: String(e.razonSocial || ""), sucursalIds: (e.sucursalIds || []).map(String), sucursalActividades: (e.sucursalActividades || []).map((f: any) => ({ sucursalId: String(f.sucursalId), codigo: f.codigo, origen: f.origen, actividadHabitual: f.actividadHabitual, actividades: f.actividades || [] })), habitualId: e.defaultsArca?.sucursalId ? String(e.defaultsArca.sucursalId) : null })),
    catalogo: catalogo.map((d) => ({ _id: String(d._id), domicilio: String(d.domicilio || ""), codigo: d.codigo })),
    actividadesDelNomenclador: SUCURSALES_POR_EMPRESA_ARCA.flatMap((e) => e.sucursales.flatMap((s) => s.actividades.map((a) => a.codigo))),
    quitar: true,
  });
  const segunArca = new Map(plan.empresas.map((e) => [e.empresaId, e]));
  const habitual = new Map(empresas.map((e) => [String(e._id), e.defaultsArca?.sucursalId ? String(e.defaultsArca.sucursalId) : ""]));

  const ups: any[] = await UserProject.aggregate([
    { $match: { "contracts.empresaContratoId": { $in: empresas.map((e) => e._id) } } },
    { $project: { userId: 1, c: { $map: { input: { $range: [0, { $size: { $ifNull: ["$contracts", []] } }] }, as: "i", in: { i: "$$i", e: { $arrayElemAt: ["$contracts.empresaContratoId", "$$i"] }, s: { $arrayElemAt: ["$contracts.sucursalArcaId", "$$i"] }, a: { $arrayElemAt: ["$contracts.actividadArca", "$$i"] }, st: { $arrayElemAt: ["$contracts.nombre_estado_empleado", "$$i"] }, alta: { $arrayElemAt: ["$contracts.fecha_alta_contrato", "$$i"] }, baja: { $arrayElemAt: ["$contracts.fecha_baja_contrato", "$$i"] } } } } } },
  ]);
  const users: any[] = await User.find({ _id: { $in: ups.map((u) => u.userId) } }).select("firstName lastName email").lean();
  const nombre = new Map(users.map((u) => [String(u._id), `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email]));

  const conDatoAjeno: string[] = [];
  const porElegir: string[] = [];
  let revisados = 0;
  for (const up of ups) {
    for (const c of up.c || []) {
      const e = segunArca.get(String(c.e || ""));
      if (!e) continue;
      revisados++;
      const explicita = c.s ? String(c.s) : "";
      const sucursalId = explicita || (e.habitual.a ?? habitual.get(e.empresaId) ?? "");
      const problema = problemaDeSucursalYActividad({ sucursalIdsDeLaEmpresa: e.sucursalIds, asociaciones: e.sucursalActividades, sucursalId, codigoDelCatalogo: codigoCatalogo.get(sucursalId), actividad: c.a });
      if (!problema) continue;
      const codigo = codigoDeSucursalParaEmpresa(e.sucursalActividades, sucursalId, codigoCatalogo.get(sucursalId)).codigo;
      const linea = `  ${String(nombre.get(String(up.userId)) || up.userId).padEnd(34)} ${e.razonSocial.padEnd(14)} ${dia(c.alta)}→${dia(c.baja) || "sin fin"}  ${String(c.st || "-").padEnd(22)} sucursal=${explicita ? `${codigo || "?"} ${domicilio.get(explicita) || explicita}` : `(habitual: ${domicilio.get(sucursalId) || "ninguna"})`} actividad=${c.a || "(sin elegir)"} → ${TEXTO_PROBLEMA_SUCURSAL[problema]}  ref=${up._id}:${c.i}`;
      // Con un dato ESCRITO en el contrato que su empresa no tiene, es un contrato a corregir.
      if (problema === "sucursal_ajena" || problema === "actividad_no_habilitada") conDatoAjeno.push(linea);
      // Sin presentar y sin actividad elegible sola: alguien va a tener que elegirla.
      else if (SIN_PRESENTAR.has(claveEstado(String(c.st || "")))) porElegir.push(linea);
    }
  }
  console.log(`Contratos revisados (de ${plan.empresas.map((e) => e.razonSocial).join(", ")}): ${revisados}`);
  console.log(`\nA) Con una sucursal o actividad ESCRITA en el contrato que su empresa no tiene en ARCA: ${conDatoAjeno.length}`);
  for (const l of conDatoAjeno.sort()) console.log(l);
  console.log(`\nB) Sin presentar («Pedido de ARCA») que van a frenar el TXT hasta que se resuelva: ${porElegir.length}`);
  for (const l of porElegir.sort()) console.log(l);
  console.log("\nNo se corrigió nada. La columna `ref` es UserProject:índice del contrato.");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
