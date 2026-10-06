import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { DocumentoGenerado, proximoNumeroDeDocumento, formatoCodigo } from "../models/DocumentoGenerado.js";
import { getTenantDropboxConfig, listFolder, moveEntry } from "../services/dropboxService.js";
import { resolverCarpetaPorProposito } from "../utils/estadoCarpetas.js";
import { leerAnclas } from "../utils/anclasNombre.js";
import { largoEnBytes, MAX_NOMBRE } from "../utils/nomenclatura.js";
import { fechaISO } from "../utils/contratoVigencia.js";

/**
 * Le pone su código único («ID-000123») a los documentos que YA están en Outbox.
 *
 * Los documentos generados desde ahora salen con código; los que estaban esperando para enviarse a
 * firmar no lo tienen. Esto los RENOMBRA —no los regenera: el PDF queda idéntico al que se revisó—,
 * registra cada código en `documentos_generados` con su contrato, y actualiza el nombre guardado en el
 * contrato, que es el que se usa al reenviar y al reconocer el alta (`esElAltaEnviada`).
 *
 * CÓMO SE SABE DE QUIÉN ES CADA ARCHIVO: por el nombre EXACTO que quedó guardado en el contrato al
 * generarlo —`firmaContratoNombre`, `firmaReleases[].nombre` o `altaConstancia.enviadaComo`—. No se
 * deduce por persona y período: un archivo que no coincide con ninguno se deja como está y se informa
 * (subido a mano, o de antes de que se guardara el nombre). Ésos, si hacen falta con código, se
 * eliminan y se vuelven a generar desde la plataforma.
 *
 * Solo renombra archivos de OUTBOX: lo que está ahí todavía no se mandó a firmar, así que el título de
 * la solicitud que arme Dropbox Sign ya va a salir con el código.
 *
 * Uso (desde server/):
 *   TENANT_SLUG=demo-tenant npm run outbox:codigos:dry   → lista qué haría, no toca nada
 *   TENANT_SLUG=demo-tenant npm run outbox:codigos       → aplica (con respaldo en respaldos/)
 */

const DRY_RUN = process.env.DRY_RUN === "true";

type Campo = "contrato" | "release" | "alta";
interface Plan {
  archivo: { name: string; path: string };
  up: any;
  idx: number;
  campo: Campo;
  /** Para un release: su posición en `firmaReleases`. */
  releaseIdx?: number;
  tipo: string;
}

const sinExtension = (n: string) => String(n || "").replace(/\.[a-z0-9]{2,4}$/i, "");
const extension = (n: string) => /\.[a-z0-9]{2,4}$/i.exec(String(n || ""))?.[0] || "";

/** Qué campo del contrato guarda ESTE nombre, si alguno. */
function campoDelArchivo(c: any, nombre: string): { campo: Campo; releaseIdx?: number } | null {
  const base = sinExtension(nombre);
  if (c.firmaContratoNombre && sinExtension(c.firmaContratoNombre) === base) return { campo: "contrato" };
  const ri = (c.firmaReleases || []).findIndex((r: any) => r?.nombre && sinExtension(r.nombre) === base);
  if (ri >= 0) return { campo: "release", releaseIdx: ri };
  if (c.altaConstancia?.enviadaComo && sinExtension(c.altaConstancia.enviadaComo) === base) return { campo: "alta" };
  return null;
}

const TIPO_DE_CAMPO: Record<Campo, string> = { contrato: "Contrato", release: "Release", alta: "AltaAFIP" };

async function main() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  const slug = process.env.TENANT_SLUG?.trim();
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  if (!slug) throw new Error("Falta TENANT_SLUG=<slug>.");
  await mongoose.connect(uri, { dbName });
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Base: ${dbName} · tenant ${slug}`);

  const tenant: any = await Tenant.findOne({ slug }).lean();
  if (!tenant) throw new Error(`No existe el tenant ${slug}.`);
  const cfg = getTenantDropboxConfig(tenant);
  if (!cfg) throw new Error("El tenant no tiene Dropbox conectado.");
  const outbox = await resolverCarpetaPorProposito("outbox");
  if (!outbox) throw new Error("No hay una carpeta con el propósito Outbox configurada.");

  const entradas: any[] = ((await listFolder(String(tenant._id), cfg, outbox, true)).entries || []) as any[];
  const archivos = entradas.filter((e) => e.tag === "file" && !/\.json$/i.test(e.name));
  const sinCodigo = archivos.filter((e) => !leerAnclas(e.name).codigo);
  console.log(`Outbox (${outbox}): ${archivos.length} archivo(s), ${sinCodigo.length} sin código.\n`);

  const planes: Plan[] = [];
  const sinContrato: string[] = [];
  const ambiguos: string[] = [];
  for (const archivo of sinCodigo) {
    // La persona acota la búsqueda (CUIL o email del nombre); el nombre exacto guardado decide.
    const a = leerAnclas(archivo.name);
    const cuit = a.cuit;
    const filtro: any = cuit ? { "metadata.cuit": { $in: [cuit, `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`] } } : a.email ? { email: new RegExp(`^${a.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } : null;
    const personas = filtro ? await User.find({ tenantId: tenant._id, ...filtro }).select("_id").lean() : [];
    const ups = personas.length > 0 ? await UserProject.find({ userId: { $in: personas.map((p: any) => p._id) } }) : [];
    const encontrados: Plan[] = [];
    for (const up of ups) {
      (up.contracts || []).forEach((c: any, idx: number) => {
        const r = campoDelArchivo(c, archivo.name);
        if (r) encontrados.push({ archivo, up, idx, campo: r.campo, releaseIdx: r.releaseIdx, tipo: TIPO_DE_CAMPO[r.campo] });
      });
    }
    if (encontrados.length === 1) planes.push(encontrados[0]);
    else if (encontrados.length === 0) sinContrato.push(archivo.name);
    else ambiguos.push(archivo.name);
  }

  for (const p of planes) console.log(`· ${p.tipo.padEnd(8)} ${p.archivo.name}`);
  if (sinContrato.length > 0) console.log(`\nSin contrato con ese nombre guardado — NO se tocan (si hace falta, regenerarlos):\n${sinContrato.map((n) => `  - ${n}`).join("\n")}`);
  if (ambiguos.length > 0) console.log(`\nEl mismo nombre está en más de un contrato — NO se tocan:\n${ambiguos.map((n) => `  - ${n}`).join("\n")}`);
  console.log(`\n${planes.length} archivo(s) ${DRY_RUN ? "se renombrarían" : "a renombrar"}.`);
  if (DRY_RUN || planes.length === 0) {
    await mongoose.disconnect();
    return;
  }

  // Respaldo ANTES de tocar nada: el nombre viejo de cada archivo y los campos del contrato.
  const dir = path.join(process.cwd(), "respaldos");
  await fs.promises.mkdir(dir, { recursive: true });
  const archivoRespaldo = path.join(dir, `codigos-outbox-${dbName}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.promises.writeFile(
    archivoRespaldo,
    JSON.stringify(
      planes.map((p) => ({ path: p.archivo.path, userProjectId: String(p.up._id), contractIndex: p.idx, campo: p.campo, releaseIdx: p.releaseIdx })),
      null,
      2,
    ),
  );
  console.log(`Respaldo: ${archivoRespaldo}\n`);

  let hechos = 0;
  for (const p of planes) {
    const numero = await proximoNumeroDeDocumento(tenant._id);
    const codigo = formatoCodigo(numero);
    const ext = extension(p.archivo.name);
    const nuevoNombre = `${sinExtension(p.archivo.name)}_${codigo}${ext}`;
    if (largoEnBytes(nuevoNombre) > MAX_NOMBRE) {
      console.log(`✖ ${p.archivo.name}: con el código no entra en ${MAX_NOMBRE} bytes — se deja como está (regenerarlo).`);
      continue;
    }
    const nuevoPath = `${p.archivo.path.slice(0, p.archivo.path.length - p.archivo.name.length)}${nuevoNombre}`;
    await moveEntry(String(tenant._id), cfg, p.archivo.path, nuevoPath);

    // El nombre guardado en el contrato, con la misma extensión que tenía guardada.
    const c: any = p.up.contracts[p.idx];
    const conCodigo = (guardado: string) => `${sinExtension(guardado)}_${codigo}${extension(guardado)}`;
    const set: Record<string, unknown> = {};
    if (p.campo === "contrato") set[`contracts.${p.idx}.firmaContratoNombre`] = conCodigo(c.firmaContratoNombre);
    if (p.campo === "release") set[`contracts.${p.idx}.firmaReleases.${p.releaseIdx}.nombre`] = conCodigo(c.firmaReleases[p.releaseIdx!].nombre);
    if (p.campo === "alta") {
      set[`contracts.${p.idx}.altaConstancia.enviadaComo`] = conCodigo(c.altaConstancia.enviadaComo);
      if (c.altaConstancia.archivadaEn) set[`contracts.${p.idx}.altaConstancia.archivadaEn`] = nuevoPath;
    }
    await UserProject.updateOne({ _id: p.up._id }, { $set: set });

    const pid = p.up.projectId;
    await DocumentoGenerado.create({
      tenantId: tenant._id,
      codigo,
      numero,
      tipo: p.tipo,
      archivo: sinExtension(nuevoNombre),
      userId: p.up.userId,
      userProjectId: p.up._id,
      projectId: pid,
      contrato: { indice: p.idx, alta: fechaISO(c.fecha_alta_contrato), baja: fechaISO(c.fecha_baja_contrato), carga: String(c.fecha_carga ?? "") },
    });
    hechos++;
    console.log(`✔ ${codigo}  ${nuevoNombre}`);
  }
  console.log(`\n${hechos} archivo(s) renombrados con su código.`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e?.message || e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
