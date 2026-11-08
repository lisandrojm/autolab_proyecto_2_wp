import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { Info } from "../models/Info.js";
import { Contrato } from "../models/Contrato.js";
import { DocumentoGenerado } from "../models/DocumentoGenerado.js";
import { buscarArchivos, getTenantDropboxConfig } from "../services/dropboxService.js";
import { estadoDestinoPorProposito } from "../services/estadoTransicionAutomaticaService.js";
import { decidirReparacion, sigueElCircuito } from "../utils/circuitoContrato.js";
import { fechaISO } from "../utils/contratoVigencia.js";

/**
 * LOS CONTRATOS QUE SALTEARON GENERAR DOCUMENTOS VUELVEN AHÍ (07/11/2026). EN SECO POR DEFECTO.
 *
 * Busca los contratos de WeProdu (Solicitudes / «Agregar miembro») cuyo tipo genera contrato o release y
 * que están MÁS ALLÁ de Generar Documentos (Firma pendiente, Firma enviada, Disponible) sin su contrato
 * ni su release en Dropbox: los movió la constancia de ARCA, un recibo de sueldo registrado como
 * contrato (20–24/10), o lo generado se borró del Outbox. Ver `utils/circuitoContrato.ts`.
 *
 * Con `--aplicar`, cada uno vuelve al estado de Generar Documentos: se limpian los datos de firma que
 * apuntaban a lo que ya no está (si no, Generar Documentos dice «ya enviado» y no deja generar), y lo
 * anterior queda guardado en `contracts.$.circuitoReparado`. No borra archivos de Dropbox ni del storage.
 *
 * Uso (desde server/):
 *   npx dotenv -e .env.production -- tsx src/scripts/circuitoVolverAGenerar.ts            → en seco
 *   npx dotenv -e .env.production -- tsx src/scripts/circuitoVolverAGenerar.ts --aplicar  → escribe
 *   … --desde=2026-09-01   → sólo contratos con alta desde esa fecha (por defecto, 01/09/2026: los de antes
 *                            son empleados anteriores al circuito; se listan aparte, para mirarlos a mano)
 *   (TENANT_SLUG=<slug> para uno solo)
 */

const APLICAR = process.argv.includes("--aplicar");
const DESDE = (process.argv.find((a) => a.startsWith("--desde=")) || "--desde=2026-09-01").slice(8);
const CAMPOS_FIRMA = ["firmaContratoUrl", "firmaContratoNombre", "firmaReleases", "firmaEmpresaContratoId", "firmaEmpresaReleaseId", "firmaGeneradoAt", "firmaReleasesGeneradoAt", "firmaEnviadaAt"] as const;
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

async function main() {
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  const generar: any = await estadoDestinoPorProposito("alta_temprana");
  const ordenGenerar = generar?.data?.ordenDependencia;
  if (!generar || typeof ordenGenerar !== "number") throw new Error("No hay un estado con la carpeta «Alta temprana de Arca» (Generar Documentos) configurada.");
  const despues: any[] = await Info.find({ type: "estado-empleado", "data.ordenDependencia": { $gt: ordenGenerar }, "data.esSolicitud": { $ne: true } }).select("name data.id").lean();
  const idsDespues = despues.map((e) => e.data?.id).filter((x) => typeof x === "number");
  const nombreEstado = new Map(despues.map((e) => [e.data.id, e.name]));
  const tipos = new Map((await Contrato.find({}).select("name data.requiereFirma data.requiereFirmaRelease").lean()).map((t: any) => [String(t._id), t]));
  const generaDocumentos = (c: any) => {
    const t: any = tipos.get(String(c.contrato_id || ""));
    return !t || t.data?.requiereFirma !== false || t.data?.requiereFirmaRelease !== false;
  };
  console.log(`Generar Documentos = «${generar.name}» (orden ${ordenGenerar}). Más allá: ${despues.map((e) => e.name).join(", ")}. ${APLICAR ? "APLICANDO." : "En seco."}\n`);

  const tenants: any[] = await Tenant.find(process.env.TENANT_SLUG ? { slug: process.env.TENANT_SLUG } : {}).lean();
  const resumen: Record<string, number> = {};
  for (const tenant of tenants) {
    const cfg = getTenantDropboxConfig(tenant);
    const proyectos = await Project.find({ tenantId: tenant._id }).select("_id").lean();
    const ups: any[] = await UserProject.find({ projectId: { $in: proyectos.map((p: any) => p._id) }, "contracts.estado_id": { $in: idsDespues } })
      .select("userId contracts.estado_id contracts.nombre_estado_empleado contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.fecha_carga contracts.contrato_id contracts.nombre_contrato contracts.solicitudId contracts.origen " + CAMPOS_FIRMA.map((c) => `contracts.${c}`).join(" "))
      .lean();
    const candidatos: Array<{ up: any; idx: number; c: any }> = [];
    for (const up of ups) (up.contracts || []).forEach((c: any, idx: number) => idsDespues.includes(c.estado_id) && sigueElCircuito(c) && generaDocumentos(c) && candidatos.push({ up, idx, c }));
    if (candidatos.length === 0) continue;
    if (!cfg) {
      console.log(`Tenant ${tenant.slug || tenant._id}: ${candidatos.length} candidato(s) pero Dropbox no está conectado — no se puede saber si su contrato existe. Se omite.`);
      continue;
    }
    const usuarios: any[] = await User.find({ _id: { $in: [...new Set(candidatos.map((x) => String(x.up.userId)))] } }).select("firstName lastName metadata.cuit").lean();
    const persona = new Map(usuarios.map((u) => [String(u._id), u]));
    const docs: any[] = await DocumentoGenerado.find({ tenantId: tenant._id, userProjectId: { $in: [...new Set(candidatos.map((x) => x.up._id))] } }).select("codigo tipo clase archivo userProjectId contrato").lean();
    // Dropbox busca por palabra entera: el código y el CUIL (una búsqueda por persona, no por archivo).
    const enDropbox = new Map<string, boolean>();
    const porCuil = new Map<string, string[]>();
    const tenantId = String(tenant._id);
    for (const { up, idx, c } of candidatos) {
      const u = persona.get(String(up.userId));
      const cuil = digitos(u?.metadata?.cuit);
      const alta = fechaISO(c.fecha_alta_contrato);
      const baja = fechaISO(c.fecha_baja_contrato);
      const suyos = docs.filter((d) => String(d.userProjectId) === String(up._id) && (d.contrato?.alta === alta && (d.contrato?.baja || "") === (baja || "") ? true : d.contrato?.indice === idx && !d.contrato?.alta));
      for (const d of suyos) {
        if (enDropbox.has(d.codigo)) continue;
        const hallados = await buscarArchivos(tenantId, cfg, d.codigo, { max: 10 }).catch(() => []);
        enDropbox.set(d.codigo, hallados.some((h) => h.tag === "file" && h.name.includes(d.codigo)));
      }
      if (cuil.length === 11 && !porCuil.has(cuil)) porCuil.set(cuil, (await buscarArchivos(tenantId, cfg, cuil, { max: 200 }).catch(() => [])).filter((h) => h.tag === "file").map((h) => h.name));
      const fechaNombre = `D-${alta.replace(/-/g, "")}`;
      const sinCodigo = (porCuil.get(cuil) || []).filter((n) => n.includes(fechaNombre) && !/ID-\d{6,}/.test(n));
      const r = decidirReparacion({ documentos: suyos.map((d) => ({ codigo: d.codigo, tipo: d.tipo, clase: d.clase, archivo: d.archivo || "", enDropbox: !!enDropbox.get(d.codigo) })), sinCodigo });
      const estado = nombreEstado.get(c.estado_id) || c.nombre_estado_empleado;
      const clave = `${estado} → ${r.volver ? "vuelve a Generar Documentos" : "se queda"}`;
      resumen[clave] = (resumen[clave] || 0) + 1;
      if (!r.volver) continue;
      if (alta < DESDE) {
        resumen[`${estado} → antes del corte (${DESDE}), revisar a mano`] = (resumen[`${estado} → antes del corte (${DESDE}), revisar a mano`] || 0) + 1;
        resumen[clave]--;
        console.log(`(antes del corte, no se toca) ${`${u?.firstName || ""} ${u?.lastName || ""}`.trim()} · ${cuil} · ${alta} · ${c.nombre_contrato || "—"} · ${estado} — ${r.motivo}`);
        continue;
      }
      console.log(`${`${u?.firstName || ""} ${u?.lastName || ""}`.trim()} · ${cuil} · ${alta} → ${baja || "—"} · ${c.nombre_contrato || "—"} · ${estado}\n   ${r.motivo}`);
      if (!APLICAR) continue;
      const k = `contracts.${idx}`;
      const firmaAnterior = Object.fromEntries(CAMPOS_FIRMA.filter((f) => c[f] != null && !(Array.isArray(c[f]) && c[f].length === 0)).map((f) => [f, c[f]]));
      const w = await UserProject.updateOne(
        { _id: up._id, [`${k}.estado_id`]: c.estado_id, [`${k}.fecha_alta_contrato`]: c.fecha_alta_contrato },
        {
          $set: { [`${k}.estado_id`]: generar.data.id, [`${k}.nombre_estado_empleado`]: generar.name, [`${k}.circuitoReparado`]: { el: new Date(), estadoAnterior: { id: c.estado_id ?? null, nombre: estado }, firmaAnterior, motivo: r.motivo } },
          $unset: Object.fromEntries(CAMPOS_FIRMA.map((f) => [`${k}.${f}`, ""])),
        },
      );
      console.log(`   ${w.modifiedCount ? `→ pasó a «${generar.name}»` : "→ NO se tocó: el contrato cambió mientras tanto"}`);
    }
  }
  console.log(`\nResumen:\n${Object.entries(resumen).sort().map(([k, v]) => `${String(v).padStart(5)}  ${k}`).join("\n")}`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
