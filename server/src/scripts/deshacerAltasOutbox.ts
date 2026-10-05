import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import { getTenantDropboxConfig, deleteEntry } from "../services/dropboxService.js";

/**
 * Deshace la carga de constancias de alta temprana que ya se subieron al Outbox, para volver a
 * bajarlas desde ARCA con el nombre de ahora.
 *
 * Caso que lo motivó (05/10/2026): las altas de Aquino, Castro, Loizzo y Martínez (LN+, 2030 S.R.L.)
 * se subieron al Outbox sin el centro de costo adelante del nombre. Un archivo ya generado no se
 * renombra nunca (ver `nombreArchivo`), así que hay que sacarlo y volver a generarlo.
 *
 * Por cada contrato con `altaConstancia.archivadaEn` de esas personas:
 *   1. borra el archivo del Outbox de Dropbox (si ya no está, sigue);
 *   2. borra el PDF guardado en el storage local;
 *   3. saca del contrato `altaDocumentoUrl`, `altaDocumentoNombre`, `altaConstancia` y
 *      `altaEnviadaAFirmarEl`.
 *
 * Con `altaConstancia.validadaEl` vacío el contrato vuelve a la lista de «Descargar altas tempranas»
 * (`pendientesDeConstancia`), que es lo que se busca. La presentación en ARCA
 * (`altaArcaPresentada`) NO se toca: el alta está hecha y no hay que presentarla de nuevo. El estado
 * tampoco: se informa, porque no queda registrado de qué estado venía si la carga lo avanzó.
 *
 * Antes de escribir deja un respaldo de los contratos tocados en respaldos/.
 *
 * Uso (desde server/):
 *   TENANT_SLUG=demo-tenant npm run altas:deshacer-outbox:dry
 *   TENANT_SLUG=demo-tenant npm run altas:deshacer-outbox
 *   CUILS=20442166987,20412923767 …   → otras personas (por defecto, las cuatro del caso)
 */

const DRY_RUN = process.env.DRY_RUN === "true";
const CUILS = String(process.env.CUILS || "20442166987,20412923767,20253141701,20365478792")
  .split(",")
  .map((s) => s.replace(/\D/g, ""))
  .filter((s) => s.length === 11);

const CAMPOS = ["altaDocumentoUrl", "altaDocumentoNombre", "altaConstancia", "altaEnviadaAFirmarEl"];

async function main() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  const slug = process.env.TENANT_SLUG?.trim();
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  if (!slug) throw new Error("Falta TENANT_SLUG=<slug>.");
  await mongoose.connect(uri, { dbName });
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Base: ${dbName} · tenant ${slug} · CUILs ${CUILS.join(", ")}`);

  const tenant: any = await Tenant.findOne({ slug }).lean();
  if (!tenant) throw new Error(`No existe el tenant ${slug}.`);
  const cfg = getTenantDropboxConfig(tenant);
  if (!cfg) throw new Error("El tenant no tiene Dropbox conectado: no se puede borrar del Outbox.");

  const conGuiones = (c: string) => `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;
  const personas: any[] = await User.find({ tenantId: tenant._id, "metadata.cuit": { $in: CUILS.flatMap((c) => [c, conGuiones(c)]) } })
    .select("firstName lastName metadata.cuit")
    .lean();
  const encontrados = new Set(personas.map((p) => String(p.metadata?.cuit || "").replace(/\D/g, "")));
  CUILS.filter((c) => !encontrados.has(c)).forEach((c) => console.log(`! No hay ninguna persona con CUIL ${c}`));

  const objetivos: Array<{ p: any; up: any; i: number; k: any }> = [];
  for (const p of personas) {
    const ups: any[] = await UserProject.find({ userId: p._id }).lean();
    for (const up of ups) {
      (up.contracts || []).forEach((k: any, i: number) => {
        // Solo las que fueron al Outbox: las de «No firmar» no son parte del problema.
        if (!k?.altaConstancia?.archivadaEn || !k.altaConstancia.vaAFirma) return;
        objetivos.push({ p, up, i, k });
        console.log(`\n· ${p.firstName} ${p.lastName} — ${up.nombre_proyecto || up.projectId} · contrato #${i} (${k.fecha_alta_contrato} → ${k.fecha_baja_contrato}) · estado «${k.nombre_estado_empleado ?? k.estado_id}»`);
        console.log(`    Dropbox: ${k.altaConstancia.archivadaEn}`);
        console.log(`    Local:   ${k.altaDocumentoUrl || "—"}`);
      });
    }
  }
  const deshechos = objetivos.length;

  if (!DRY_RUN && objetivos.length > 0) {
    const dir = path.join(process.cwd(), "respaldos");
    await fs.promises.mkdir(dir, { recursive: true });
    const archivo = path.join(dir, `deshacer-altas-outbox-${dbName}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    const respaldo = objetivos.map(({ up, i, k }) => ({ userProjectId: String(up._id), contractIndex: i, campos: Object.fromEntries(CAMPOS.map((f) => [f, k[f]])) }));
    await fs.promises.writeFile(archivo, JSON.stringify(respaldo, null, 2));
    console.log(`\nRespaldo: ${archivo}`);
  }

  for (const { p, up, i, k } of DRY_RUN ? [] : objetivos) {
    console.log(`\n· ${p.firstName} ${p.lastName}`);
    try {
      await deleteEntry(String(tenant._id), cfg, k.altaConstancia.archivadaEn);
      console.log("    ✔ borrado de Dropbox");
    } catch (e: any) {
      const msg = JSON.stringify(e?.response?.data || e?.message || e);
      if (/not_found/.test(msg)) console.log("    = ya no estaba en Dropbox");
      else throw new Error(`No se pudo borrar de Dropbox (${msg}); se frena antes de tocar el contrato.`);
    }

    if (typeof k.altaDocumentoUrl === "string" && k.altaDocumentoUrl.startsWith("/storage/")) {
      await fs.promises.unlink(path.join(process.cwd(), k.altaDocumentoUrl.replace(/^\//, ""))).then(
        () => console.log("    ✔ borrado del storage local"),
        () => console.log("    = el PDF local no está en esta máquina (vive en el VPS); queda huérfano, no molesta"),
      );
    }

    // Por posición y con la ruta como guarda: los contratos viejos no tienen `_id`, y así no se
    // toca otro contrato si el array cambió entre la lectura y la escritura.
    const r = await UserProject.updateOne(
      { _id: up._id, [`contracts.${i}.altaConstancia.archivadaEn`]: k.altaConstancia.archivadaEn },
      { $unset: Object.fromEntries(CAMPOS.map((f) => [`contracts.${i}.${f}`, ""])) },
    );
    console.log(r.modifiedCount === 1 ? "    ✔ contrato limpio: vuelve a «Descargar altas tempranas»" : "    ✖ el contrato cambió mientras tanto: no se tocó");
  }

  console.log(`\n${deshechos} alta(s) ${DRY_RUN ? "se desharían" : "deshechas"}.`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e?.message || e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
