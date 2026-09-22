import "dotenv/config";
import { Types } from "mongoose";
import { connectDB, disconnectDB } from "../config/db.js";
import { Tenant } from "../models/Tenant.js";
import { RoleFrame } from "../models/RoleFrame.js";
import { CategoriaSat } from "../models/CategoriaSat.js";
import { Valoracion } from "../models/Valoracion.js";

/**
 * VALORA LAS CATEGORÍAS DE TODAS LAS FUNCIONES (Roles Empresa) SEGÚN SU BRUTO.
 *
 * La regla, dentro de cada función y cada convenio:
 *   - la categoría de MENOR bruto → la valoración BAJA (la de menor `orden`: Plata); si varias
 *     empatan en el mínimo, todas;
 *   - las demás → la valoración ALTA (la de mayor `orden`: Oro);
 *   - si no hay elección por precio —una sola categoría, o todas con el mismo bruto— el convenio
 *     queda SIN VALORAR.
 *
 * Lo último no es un detalle. Valorar como Plata la única categoría de una función haría que un
 * proyecto Oro no tuviera ninguna de su nivel: el server le exige motivo a cada alta (422) por una
 * categoría que igual era la única posible. Sin valorar, el modo permisivo la ofrece y el alta la
 * elige sola, que es exactamente lo que tiene que pasar cuando no hay nada que elegir.
 *
 * Existe porque, hasta que una función tiene categorías valoradas, el alta de un contrato está en
 * modo permisivo: ofrece todas y no elige ninguna. Con 82 de 83 funciones sin valorar, un proyecto
 * Plata no se notaba en ningún lado. Hacerlo a mano en Roles Empresa es lo mismo, función por
 * función; esto lo hace de una vez con un criterio escrito, y después cada función sigue siendo
 * editable a mano.
 *
 * POR CONVENIO Y NO POR FUNCIÓN ENTERA: al contratar, el filtro de convenio va ANTES que el de
 * valoración (lo exige ARCA). Si la barata de la función fuera de un convenio que la empleadora no
 * tiene, un proyecto Plata con el otro convenio se quedaría sin opción Plata.
 *
 * El bruto sale del CATÁLOGO vigente (`categorias-sat`), no de la copia guardada en la función: esa
 * copia es de cuando se asoció la categoría y puede ser de una paritaria anterior. Si el catálogo no
 * lo tiene, se usa la copia.
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

type Asignacion = { categoriaId: number; nombre: string; convenio: string; bruto: number | null; valoracion: "baja" | "alta" | null; motivo?: string };

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

    /*
      La regla es de DOS niveles. Con tres o más no está definido qué recibe el del medio, y
      adivinarlo acá sería decidir sueldos con un criterio que nadie escribió: se frena.
    */
    const valoraciones = await Valoracion.find({ tenantId: tenant._id, activo: { $ne: false } })
      .select("name orden")
      .sort({ orden: 1 })
      .lean();
    if (valoraciones.length !== 2) {
      console.error(`❌ La regla es para exactamente 2 valoraciones activas y hay ${valoraciones.length}: ${valoraciones.map((v) => v.name).join(", ") || "ninguna"}.`);
      process.exit(1);
    }
    const [baja, alta] = valoraciones;
    console.log(`📊 Baja = «${baja.name}» (la de menor bruto) · Alta = «${alta.name}» (las demás)\n`);

    const catalogo = await CategoriaSat.find({}).select("data.id data.nombre data.convenio data.sueldoBruto").lean();
    const delCatalogo = new Map(catalogo.map((c: any) => [Number(c.data?.id), c.data]));

    const funciones = await RoleFrame.find({ "data.categoriasSat.0": { $exists: true } })
      .select("name data.categoriasSat")
      .sort({ name: 1 })
      .lean();

    let aValorar = 0;
    let salteadas = 0;
    let categoriasBaja = 0;
    let categoriasAlta = 0;
    let sinValorar = 0;
    let sinEleccion = 0;
    const operaciones: any[] = [];

    for (const funcion of funciones as any[]) {
      const asociadas: any[] = funcion.data?.categoriasSat || [];
      if (!force && asociadas.some((c) => c?.valoracionId)) {
        salteadas++;
        console.log(`⏭️  ${funcion.name}: ya tiene categorías valoradas a mano, no se toca.`);
        continue;
      }

      const asignaciones: Asignacion[] = asociadas.map((c) => {
        const vigente = delCatalogo.get(Number(c.id));
        const bruto = Number(vigente?.sueldoBruto ?? c.sueldoBruto);
        return {
          categoriaId: Number(c.id),
          nombre: String(vigente?.nombre || c.nombre || c.id),
          convenio: String(vigente?.convenio || "").trim(),
          bruto: Number.isFinite(bruto) && bruto > 0 ? bruto : null,
          valoracion: null,
        };
      });

      const porConvenio = new Map<string, Asignacion[]>();
      for (const a of asignaciones) porConvenio.set(a.convenio, [...(porConvenio.get(a.convenio) || []), a]);

      for (const grupo of porConvenio.values()) {
        const conBruto = grupo.filter((a) => a.bruto != null);
        // Sin bruto no se puede decir si es la barata: queda sin valorar y se informa, en vez de
        // caer en «alta» por descarte.
        for (const a of grupo.filter((x) => x.bruto == null)) a.motivo = "sin bruto en el catálogo";
        const minimo = Math.min(...conBruto.map((a) => a.bruto as number));
        if (!conBruto.some((a) => (a.bruto as number) > minimo)) {
          for (const a of conBruto) a.motivo = conBruto.length === 1 ? "única del convenio: no hay qué elegir" : "todas con el mismo bruto: no hay una más barata";
          continue;
        }
        for (const a of conBruto) a.valoracion = a.bruto === minimo ? "baja" : "alta";
      }

      if (!asignaciones.some((a) => a.valoracion)) {
        sinEleccion++;
        console.log(`➖ ${funcion.name}: ${asignaciones.map((a) => `${a.nombre} (${a.motivo})`).join(", ")} → queda sin valorar.`);
        continue;
      }
      aValorar++;
      console.log(`🔧 ${funcion.name}`);
      for (const [convenio, grupo] of porConvenio) {
        console.log(`     ${convenio || "(sin convenio)"}`);
        for (const a of [...grupo].sort((x, y) => (x.bruto ?? Infinity) - (y.bruto ?? Infinity))) {
          const destino = a.valoracion === "baja" ? baja.name : a.valoracion === "alta" ? alta.name : `sin valorar (${a.motivo})`;
          console.log(`        ${a.nombre.padEnd(48)} ${formatoPlata(a.bruto).padStart(14)}  → ${destino}`);
          if (a.valoracion === "baja") categoriasBaja++;
          else if (a.valoracion === "alta") categoriasAlta++;
          else sinValorar++;

          if (a.valoracion) {
            /*
              Una actualización POR CATEGORÍA con arrayFilters, y no reescribir el array entero: si
              alguien edita la función en Roles Empresa mientras esto corre, reescribir el array le
              pisaría los cambios. Así sólo se toca el `valoracionId` de esa entrada.
            */
            operaciones.push({
              updateOne: {
                filter: { _id: funcion._id },
                update: { $set: { "data.categoriasSat.$[c].valoracionId": new Types.ObjectId(String(a.valoracion === "baja" ? baja._id : alta._id)) } },
                arrayFilters: [{ "c.id": a.categoriaId }],
              },
            });
          }
        }
      }
    }

    console.log("\n── Resumen ──");
    console.log(`Funciones con categorías: ${funciones.length}`);
    console.log(`  a valorar: ${aValorar} · sin elección por precio (quedan sin valorar): ${sinEleccion} · salteadas (ya valoradas a mano): ${salteadas}`);
    console.log(`Categorías de las funciones a valorar → ${baja.name}: ${categoriasBaja} · ${alta.name}: ${categoriasAlta} · sin valorar: ${sinValorar}`);

    if (!aplicar) {
      console.log("\n🧪 En seco: no se escribió nada.");
      return;
    }
    if (operaciones.length === 0) {
      console.log("\nNada para escribir.");
      return;
    }
    // Mongoose no castea dentro de arrayFilters: el ObjectId va armado a mano arriba y esto va
    // directo a la colección.
    const resultado = await RoleFrame.collection.bulkWrite(operaciones, { ordered: false });
    console.log(`\n✅ Escrito: ${resultado.modifiedCount} categoría(s) valorada(s) en ${aValorar} función(es).`);
  } finally {
    await disconnectDB();
  }
}

valorarFuncionesPorBruto().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
