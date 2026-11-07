import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { ConstanciaArca } from "../models/ConstanciaArca.js";
import { getTenantDropboxConfig } from "../services/dropboxService.js";
import { actualizarUbicaciones, filasPresentadas, sincronizarConstancias } from "../services/arca/constanciasArca.js";
import { categoriaDe, elegirParaCorrida, yaTieneConstancia, type EstadoConstancia } from "../services/arca/cicloConstancia.js";
import { MAX_POR_EMPLEADORA } from "../services/arca/descargaConstanciasAutomatica.js";
import { evaluarConstancia, type ConstanciaTrabajador } from "../utils/constanciaTrabajadorPdf.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";

/**
 * MIGRACIÓN DE LAS CONSTANCIAS DE ARCA A `constancias_arca` (07/11/2026), y backfill del vínculo con el
 * documento. EN SECO POR DEFECTO: lee la base y Dropbox, no escribe nada, e imprime lo que haría.
 *
 *   1. Una fila por cada alta presentada (persona + empleadora + fecha de alta), con el estado que dice
 *      el contrato.
 *   2. El backlog de las que esperan constancia: cuántas rebotaban con la regla vieja («Es una
 *      constancia de «baja», no de Alta») y cuántas rebotan con la nueva (debe dar cero). Es una
 *      simulación: la constancia que daría ARCA se deduce del contrato (con cese si la baja ya pasó).
 *   3. El cupo: qué entra en la próxima corrida (nuevas primero) y en cuántos días se vacía la cola.
 *   4. Dónde está hoy cada documento (por código, o por CUIL + fecha + CUIT en los de antes de los
 *      códigos), el estado que eso significa, y los que no aparecen en ninguna carpeta → revisión
 *      («documento no ubicado», con la fecha en que se borró).
 *   5. El resumen: cuántas quedan en cada estado.
 *
 * Con `--aplicar` escribe 1 y 4 (y archiva en «Alta temprana de Arca/Firmadas» las ya firmadas). Lo
 * corre el usuario, después del deploy.
 *
 * Uso (desde server/):
 *   npx dotenv -e .env.production -- tsx src/scripts/migrarConstanciasArca.ts            → en seco
 *   npx dotenv -e .env.production -- tsx src/scripts/migrarConstanciasArca.ts --aplicar  → escribe
 *   (TENANT_SLUG=<slug> para uno solo; sin él, todos los tenants con altas presentadas)
 */

const APLICAR = process.argv.includes("--aplicar");

const contar = <T extends string>(xs: T[]) => xs.reduce((a, x) => ((a[x] = (a[x] || 0) + 1), a), {} as Record<string, number>);
const tabla = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `   ${String(v).padStart(4)}  ${k}`).join("\n");

async function main() {
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  console.log(`${APLICAR ? "APLICANDO" : "[EN SECO] no se escribe nada"} · base ${process.env.MONGO_DB_NAME}`);
  const slug = process.env.TENANT_SLUG?.trim();
  const tenants: any[] = await Tenant.find(slug ? { slug } : {}).lean();
  const hoy = hoyArgentina();
  for (const t of tenants) {
    const filas = await filasPresentadas(t._id);
    if (filas.length === 0) continue;
    console.log(`\n══════ tenant ${t.slug || t._id} · ${filas.length} altas presentadas`);
    const existentes = new Map((await ConstanciaArca.find({ tenantId: t._id }).lean()).map((d: any) => [d.clave, d]));
    const docs: any[] = filas.map((f) => existentes.get(f.clave) || f);
    console.log(`   ${existentes.size} ya tenían fila en constancias_arca`);

    // ── 2. El backlog y la simulación de la regla de la constancia de baja ──
    const backlog = docs.filter((d) => !yaTieneConstancia(d.estado));
    let rebotabanAntes = 0;
    let rebotanAhora = 0;
    let deBaja = 0;
    let mismoDia = 0;
    const otrosProblemas: string[] = [];
    for (const d of backlog) {
      const terminada = !!d.fechaBaja && d.fechaBaja < hoy;
      // Lo que entrega la impresora de ARCA: la de baja si la relación ya tiene cese.
      const c: ConstanciaTrabajador = { tipo: terminada ? "baja" : "alta", empleadorCuit: d.empresaCuit, cuil: d.cuil, apellidoNombre: d.nombre, fechaInicio: d.fechaAlta, fechaCese: d.fechaBaja, clave: "", nroTramite: "" };
      if (c.tipo !== "alta") rebotabanAntes++;
      const ev = evaluarConstancia(c, { cuil: d.cuil, empleadorCuit: d.empresaCuit, fechaInicio: d.fechaAlta, fechaBaja: d.fechaBaja });
      if (ev.problemas.some((p) => /no de Alta/.test(p))) rebotanAhora++;
      else if (ev.problemas.length) otrosProblemas.push(`${d.nombre} (${d.fechaAlta}): ${ev.problemas.join(" ")}`);
      if (ev.deBaja) deBaja++;
      if (ev.mismoDia) mismoDia++;
    }
    console.log(`\n── Backlog: ${backlog.length} esperan su constancia`);
    console.log(`   Con la regla vieja rebotaban «Es una constancia de «baja», no de Alta»: ${rebotabanAntes}`);
    console.log(`   Con la regla nueva rebotan así: ${rebotanAhora}  ← criterio 1`);
    console.log(`   Se aceptan como constancia de la relación terminada: ${deBaja} (alta y baja el mismo día: ${mismoDia})`);
    if (otrosProblemas.length) console.log(`   Con otro problema (a revisar):\n      ${otrosProblemas.join("\n      ")}`);

    // ── 3. El cupo: la próxima corrida y cuántos días hasta vaciar la cola ──
    console.log(`\n── Cupo (tope ${MAX_POR_EMPLEADORA} por empleadora, nuevas primero)`);
    const porEmpresa = new Map<string, any[]>();
    for (const d of backlog) porEmpresa.set(d.empresaRazonSocial, [...(porEmpresa.get(d.empresaRazonSocial) || []), d]);
    for (const [empresa, items] of porEmpresa) {
      const primera = elegirParaCorrida(items, { ahora: new Date(), tope: MAX_POR_EMPLEADORA });
      console.log(`   ${empresa}: ${items.length} en cola → la próxima corrida pide ${primera.elegidas.length}; afuera ${JSON.stringify(primera.fuera)}; se vacía en ${Math.ceil(items.length / MAX_POR_EMPLEADORA)} día(s) (o en una sola con «Forzar descarga de todas»)`);
    }

    // ── 4. Dónde está cada documento ──
    const cfg = getTenantDropboxConfig(t);
    let estados: Record<string, EstadoConstancia> = Object.fromEntries(docs.map((d) => [d.clave, d.estado]));
    let motivos: Record<string, string> = {};
    if (!cfg) console.log("\n(el tenant no tiene Dropbox conectado: no se ubican documentos)");
    else {
      if (APLICAR) {
        const s = await sincronizarConstancias(t._id);
        console.log(`\n── constancias_arca: ${s.nuevas} filas nuevas, ${s.actualizadas} actualizadas`);
      }
      const conDocumento = docs.filter((d) => d.documento && ["constancia_descargada", "enviada_a_firmar", "firmada", "requiere_revision", "archivada"].includes(d.estado));
      const r = await actualizarUbicaciones(String(t._id), cfg, APLICAR ? {} : { enSeco: true, docs: conDocumento });
      console.log(`\n── Documentos: ${r.revisadas} revisados, ${r.cambiadas} cambian de estado, ${r.archivadas} ${APLICAR ? "archivados" : "se archivarían"} en «Alta temprana de Arca/Firmadas», ${r.noUbicadas} sin ubicar`);
      for (const c of r.cambios) {
        estados[c.clave] = c.a;
        if (c.a === "requiere_revision") motivos[c.clave] = c.motivo;
      }
      if (APLICAR) {
        const ahora = await ConstanciaArca.find({ tenantId: t._id }).select("clave estado motivoRevision").lean();
        estados = Object.fromEntries(ahora.map((d: any) => [d.clave, d.estado]));
        motivos = Object.fromEntries(ahora.filter((d: any) => d.estado === "requiere_revision").map((d: any) => [d.clave, d.motivoRevision || ""]));
      }
    }

    // ── 5. El resumen ──
    console.log(`\n── Resumen: cómo queda cada una (${Object.keys(estados).length})  ← criterio 5`);
    console.log(tabla(contar(Object.values(estados))));
    console.log("\n   Por grupo del Registro:");
    console.log(tabla(contar(docs.map((d) => categoriaDe(estados[d.clave], { firmada: !!d.documento?.firmadaEl || estados[d.clave] === "firmada" || estados[d.clave] === "archivada" })))));
    const enRevision = docs.filter((d) => estados[d.clave] === "requiere_revision");
    if (enRevision.length) {
      console.log(`\n   En revisión (necesitan una persona): ${enRevision.length}`);
      for (const d of enRevision) console.log(`   · ${d.nombre} · ${d.cuil} · alta ${d.fechaAlta} · ${motivos[d.clave] || d.motivoRevision || ""}`);
    }
  }
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e?.stack || e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
