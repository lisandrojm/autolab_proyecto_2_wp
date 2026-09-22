import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { Tenant } from "../models/Tenant.js";
import { planValoracionPorBruto, aplicarPlan } from "../services/valorarFunciones.js";

/**
 * VALORA LAS CATEGORÍAS DE TODAS LAS FUNCIONES (Roles Empresa) SEGÚN SU BRUTO.
 *
 * La regla —de menor a mayor: la más barata de cada convenio toma el nivel más bajo, la siguiente
 * el que sigue y las que sobran el más alto— vive en `utils/valoracionPorBruto.ts`, con sus tests.
 * Este script y la acción «Valorar por bruto» de la pantalla de Valoraciones usan la misma, vía
 * `services/valorarFunciones.ts`: no hay una segunda copia que se desalinee.
 *
 * Existe porque, hasta que una función tiene categorías valoradas, el alta de un contrato está en
 * modo permisivo: ofrece todas y no elige ninguna. Con 82 de 83 funciones sin valorar, un proyecto
 * Plata no se notaba en ningún lado. Hacerlo a mano en Roles Empresa es lo mismo, función por
 * función; esto lo hace de una vez con un criterio escrito, y después cada función sigue siendo
 * editable a mano.
 *
 * NO TOCA las funciones que ya tienen alguna categoría valorada —eso lo hizo una persona, a
 * propósito— salvo con FORCE=true. Tampoco agrega ni quita categorías: sólo escribe `valoracionId`.
 *
 * Variables de entorno:
 *   TENANT_SLUG=<slug>   -> tenant dueño de las valoraciones (o TENANT_ID=<ObjectId>). REQUERIDO.
 *   APLICAR=true         -> escribe. SIN esto sólo muestra qué haría.
 *   FORCE=true           -> (opcional) revalora también las funciones que ya tienen categorías valoradas.
 *
 * Al revés que `backfillUserRolesFrame` (que escribe salvo DRY=true), acá hay que PEDIR escribir:
 * esto decide qué categoría —o sea, qué sueldo— se ofrece en cada contrato nuevo, y correrlo sin
 * querer por olvidarse una variable no es un error que se note enseguida.
 *
 * Uso: TENANT_SLUG=demo-tenant npm run valorar:funciones:dry
 *      TENANT_SLUG=demo-tenant npm run valorar:funciones
 */

const formatoPlata = (n: number | null) => (n == null ? "sin bruto" : `$${Math.round(n).toLocaleString("es-AR")}`);

async function valorarFuncionesPorBruto() {
  const tenantSlug = process.env.TENANT_SLUG?.trim();
  const tenantIdEnv = process.env.TENANT_ID?.trim();
  const aplicar = String(process.env.APLICAR).toLowerCase() === "true";
  const force = String(process.env.FORCE).toLowerCase() === "true";

  if (!tenantSlug && !tenantIdEnv) {
    console.error("❌ Falta TENANT_SLUG=<slug> (o TENANT_ID=<ObjectId>).");
    process.exit(1);
  }

  await connectDB();
  try {
    const tenant = tenantIdEnv ? await Tenant.findById(tenantIdEnv).select("_id slug name") : await Tenant.findOne({ slug: tenantSlug }).select("_id slug name");
    if (!tenant) {
      console.error(`❌ Tenant no encontrado (${tenantSlug || tenantIdEnv}).`);
      process.exit(1);
    }
    console.log(`🏢 Tenant: ${tenant.name} (slug=${tenant.slug})`);
    console.log(aplicar ? "✍️  APLICAR=true: se va a escribir." : "🧪 En seco: no se escribe nada (APLICAR=true para escribir).");

    const plan = await planValoracionPorBruto(tenant._id as any, { incluirValoradas: force });
    const nombre = new Map(plan.niveles.map((n) => [n._id, n.name]));
    const etiqueta = (id: string | null) => (id ? nombre.get(id) || "?" : "sin valorar");
    console.log(`📊 Niveles, de menor a mayor: ${[...plan.niveles].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((n) => n.name).join(" < ") || "ninguno"}\n`);

    for (const f of plan.funciones) {
      console.log(`🔧 ${f.funcion}`);
      for (const c of f.cambios) console.log(`     ${(c.convenio || "(sin convenio)").padEnd(9)} ${c.nombre.padEnd(46)} ${formatoPlata(c.bruto).padStart(14)}  ${etiqueta(c.antes)} → ${etiqueta(c.despues)}${c.motivo ? ` (${c.motivo})` : ""}`);
    }
    for (const n of plan.salteadas) console.log(`⏭️  ${n}: ya tiene categorías valoradas, no se toca (FORCE=true para revalorarla).`);

    console.log("\n── Resumen ──");
    console.log(`Funciones con cambios: ${plan.funciones.length} · categorías: ${plan.operaciones.length} · salteadas: ${plan.salteadas.length}`);

    if (!aplicar) {
      console.log("\n🧪 En seco: no se escribió nada.");
      return;
    }
    const escritas = await aplicarPlan(plan);
    console.log(`\n✅ Escrito: ${escritas} categoría(s) en ${plan.funciones.length} función(es).`);
  } finally {
    await disconnectDB();
  }
}

valorarFuncionesPorBruto().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
