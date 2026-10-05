/**
 * DEJA A CADA EMPLEADORA CON LAS SUCURSALES, CÓDIGOS Y ACTIVIDADES QUE TIENE EN ARCA.
 *
 * Los datos están en `scripts/datos/sucursalesPorEmpresaArca.ts` (leídos de Simplificación Registral →
 * Datos del Empleador → Domicilios de Explotación). Las reglas, en `utils/planSucursalesPorEmpresa.ts`,
 * probadas sin base. Este script trae lo que hay, muestra el plan y —si se le pide— escribe.
 *
 *   VER QUÉ HARÍA (no escribe):
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/cargarSucursalesPorEmpresa.ts --dry-run
 *
 *   APLICAR (deja código y actividades como en ARCA; lo que ARCA no tiene se lista y NO se quita):
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/cargarSucursalesPorEmpresa.ts
 *
 *   APLICAR Y QUITAR las asociaciones que ARCA no tiene:
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/cargarSucursalesPorEmpresa.ts --quitar
 *
 * · Idempotente. · Busca cada empresa por CUIT. · No crea domicilios ni actividades: avisa.
 * · El domicilio habitual sólo se cambia si quedó apuntando a una sucursal que la empresa ya no tiene
 *   y le queda UNA sola; con varias se informa y no se elige.
 * · No toca contratos. Los que quedaron con una sucursal o actividad que su empresa no tiene los
 *   lista `diagContratosConSucursalAjena.ts`.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Company } from "../models/Company.js";
import { ArcaSucursal } from "../models/ArcaSucursal.js";
import { ArcaActividad } from "../models/ArcaActividad.js";
import { planSucursalesPorEmpresa } from "../utils/planSucursalesPorEmpresa.js";
import { codigoActividad } from "../compartido/sucursalesDeEmpresa.js";
import { LEIDO_EL, SUCURSALES_POR_EMPRESA_ARCA } from "./datos/sucursalesPorEmpresaArca.js";
const args = process.argv.slice(2);
const desconocidos = args.filter((a) => !["--dry-run", "--quitar"].includes(a));
if (desconocidos.length > 0) {
    console.error(`Argumento desconocido: ${desconocidos.join(" ")}. Uso: [--dry-run] [--quitar]`);
    process.exit(1);
}
const enSeco = args.includes("--dry-run");
const quitar = args.includes("--quitar");
const soloDigitos = (v) => String(v ?? "").replace(/\D/g, "");
async function main() {
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const cuits = new Set(SUCURSALES_POR_EMPRESA_ARCA.map((e) => soloDigitos(e.cuit)));
    const todas = await Company.find({}).select("razonSocial cuit sucursalIds sucursalActividades defaultsArca.sucursalId updatedAt").lean();
    const empresas = todas.filter((e) => cuits.has(soloDigitos(e.cuit)));
    const catalogo = await ArcaSucursal.find({}).select("domicilio codigo").lean();
    const codigos = [...new Set(SUCURSALES_POR_EMPRESA_ARCA.flatMap((e) => e.sucursales.flatMap((s) => s.actividades.map((a) => codigoActividad(a.codigo)))))];
    const enNomenclador = await ArcaActividad.find({ externalId: { $in: codigos } }).select("externalId").lean();
    const plan = planSucursalesPorEmpresa({
        datos: SUCURSALES_POR_EMPRESA_ARCA,
        empresas: empresas.map((e) => ({
            _id: String(e._id),
            cuit: String(e.cuit || ""),
            razonSocial: String(e.razonSocial || ""),
            sucursalIds: (e.sucursalIds || []).map(String),
            sucursalActividades: (e.sucursalActividades || []).map((f) => ({ sucursalId: String(f.sucursalId), codigo: f.codigo, origen: f.origen, actividadHabitual: f.actividadHabitual, actividades: (f.actividades || []).map((a) => ({ codigo: String(a.codigo), descripcion: a.descripcion || "" })) })),
            habitualId: e.defaultsArca?.sucursalId ? String(e.defaultsArca.sucursalId) : null,
        })),
        catalogo: catalogo.map((d) => ({ _id: String(d._id), domicilio: String(d.domicilio || ""), codigo: d.codigo })),
        actividadesDelNomenclador: enNomenclador.map((a) => String(a.externalId)),
        quitar,
    });
    console.log(`Datos de ARCA leídos el ${LEIDO_EL}.`);
    console.log(enSeco ? "EN SECO: no se escribe nada." : quitar ? "APLICANDO, quitando las asociaciones que ARCA no tiene (--quitar)." : "APLICANDO (lo que ARCA no tiene se lista y NO se quita; para quitarlo, --quitar).");
    for (const f of plan.empresasFaltantes)
        console.log(`\n✗ ${f.razonSocial} (${f.cuit}): no hay ninguna empresa con ese CUIT en la base. No se carga nada de ella.`);
    for (const d of plan.domiciliosFaltantes)
        console.log(`\n✗ ${d.cuit}: el domicilio «${d.domicilio}» (sucursal ${d.codigo}) no está en el catálogo de Sucursales. Esa sucursal NO se carga: dalo de alta en ARCA → Sucursales y volvé a correr.`);
    for (const a of plan.actividadesFaltantes)
        console.log(`\n! ${a.cuit}: la actividad ${a.codigo} «${a.descripcion}» (${a.sucursal}) no está en el nomenclador de Actividades. Se carga igual en la empresa, porque es lo que ARCA tiene, pero revisá el nomenclador: no se crea desde acá.`);
    for (const h of plan.habitualesInvalidas)
        console.log(`\n✗ ${h.cuit}: la actividad habitual pedida (${h.codigo}) no está entre las de ${h.sucursal}. No se marca ninguna.`);
    let escritas = 0;
    for (const e of plan.empresas) {
        console.log(`\n── ${e.razonSocial} (${e.cuit})`);
        if (e.cambios.length === 0)
            console.log("   sin cambios: ya está como en ARCA.");
        for (const c of e.cambios)
            console.log(`   ${c}`);
        if (e.habitual.accion === "queda")
            console.log(`   domicilio habitual: ${e.habitual.nota}`);
        if (!e.cambia || enSeco)
            continue;
        const original = empresas.find((x) => String(x._id) === e.empresaId);
        const set = {
            sucursalIds: e.sucursalIds.map((id) => new Types.ObjectId(id)),
            sucursalActividades: e.sucursalActividades.map((f) => ({ sucursalId: new Types.ObjectId(f.sucursalId), codigo: f.codigo, actividades: f.actividades, actividadHabitual: f.actividadHabitual || "", ...(f.origen ? { origen: f.origen } : {}) })),
        };
        if (e.habitual.accion === "cambia" && e.habitual.a)
            set["defaultsArca.sucursalId"] = new Types.ObjectId(e.habitual.a);
        // Sólo si la empresa sigue como se leyó: si alguien la editó mientras tanto, no se pisa su cambio.
        const r = await Company.updateOne({ _id: e.empresaId, updatedAt: original?.updatedAt }, { $set: set });
        if (r.modifiedCount === 1) {
            escritas++;
            console.log("   → escrito.");
        }
        else {
            console.log("   NO se escribió: la empresa cambió mientras se corría el script. Volvé a correrlo.");
        }
    }
    const conCambios = plan.empresas.filter((e) => e.cambia).length;
    const sobran = plan.empresas.flatMap((e) => e.sobran.filter((s) => !s.quitada).map((s) => `${e.razonSocial}: ${s.domicilio}`));
    console.log(`\n${enSeco ? `Se modificarían ${conCambios}` : `Modificadas ${escritas} de ${conCambios}`} empresa(s) de ${plan.empresas.length}.`);
    if (sobran.length > 0)
        console.log(`Asociaciones que ARCA no tiene y siguen cargadas (se quitan con --quitar):\n${sobran.map((s) => `   ${s}`).join("\n")}`);
    if (plan.sinHabitual.length > 0) {
        console.log("\nSucursales con más de una actividad y SIN habitual marcada (ahí la actividad se elige en cada contrato):");
        for (const s of plan.sinHabitual)
            console.log(`   ${s.razonSocial}: ${s.sucursal} [${s.actividades.join(", ")}]`);
        console.log("   Para marcar una: actividadHabitual en scripts/datos/sucursalesPorEmpresaArca.ts, o la ★ de la actividad en la ficha de la empresa → ARCA → Domicilios.");
    }
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
