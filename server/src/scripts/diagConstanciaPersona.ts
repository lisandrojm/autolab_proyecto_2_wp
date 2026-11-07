import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { DocumentoGenerado } from "../models/DocumentoGenerado.js";
import { ArcaAltasLog } from "../models/ArcaAltasLog.js";
import { buscarArchivos, getTenantDropboxConfig, listFolder } from "../services/dropboxService.js";
import { resolverCarpetaPorProposito } from "../utils/estadoCarpetas.js";

/**
 * DÓNDE ESTÁ LA CONSTANCIA DE ARCA DE UNA PERSONA. Solo lee (base y Dropbox).
 *
 * Imprime los contratos con alta presentada (marca de ARCA, constancia validada, nombre con que se
 * subió), los documentos con código de esa persona, las filas del registro de altas, y busca en las
 * carpetas de Dropbox del circuito (Outbox, Pendbox, firmados, Alta temprana y sus subcarpetas)
 * cualquier archivo con su CUIL, su apellido o alguno de sus códigos.
 *
 * Uso (desde server/):
 *   npx dotenv -e .env.production -- tsx src/scripts/diagConstanciaPersona.ts 20327243994 [2026-10-24]
 */

const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

async function main() {
  const cuil = digitos(process.argv[2]);
  const alta = String(process.argv[3] || "");
  if (cuil.length !== 11) throw new Error("Uso: diagConstanciaPersona.ts <CUIL> [YYYY-MM-DD]");
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  const conGuiones = `${cuil.slice(0, 2)}-${cuil.slice(2, 10)}-${cuil.slice(10)}`;
  const users: any[] = await User.find({ "metadata.cuit": { $in: [cuil, conGuiones] } }).select("firstName lastName tenantId metadata.cuit email").lean();
  if (users.length === 0) throw new Error("No hay ninguna persona con ese CUIL.");
  for (const u of users) {
    console.log(`\n=== ${u.firstName} ${u.lastName} · ${u.metadata?.cuit} · user ${u._id} · tenant ${u.tenantId}`);
    const ups: any[] = await UserProject.find({ userId: u._id }).select("projectId contracts").lean();
    const codigos = new Set<string>();
    for (const up of ups) {
      (up.contracts || []).forEach((c: any, i: number) => {
        const f = String(c.fecha_alta_contrato || "").slice(0, 10);
        if (alta && f !== alta) return;
        if (!c.altaArcaPresentada && !c.altaConstancia) return;
        console.log(`\n-- up ${up._id} · contrato #${i} · ${c.nombre_contrato} · ${f} → ${String(c.fecha_baja_contrato || "").slice(0, 10)} · estado ${c.nombre_estado_empleado}`);
        console.log("   altaArcaPresentada:", JSON.stringify({ ...c.altaArcaPresentada, registro: undefined }));
        console.log("   altaConstancia:", JSON.stringify(c.altaConstancia || null));
        console.log("   altaEnviadaAFirmarEl:", c.altaEnviadaAFirmarEl || null, "· altaDocumentoUrl:", c.altaDocumentoUrl || null);
        console.log("   firmaContratoNombre:", c.firmaContratoNombre || null, "· firmaEnviadoAt:", c.firmaEnviadoAt || null);
        const cod = /ID-\d{6,}/.exec(String(c.altaConstancia?.enviadaComo || ""))?.[0];
        if (cod) codigos.add(cod);
      });
    }
    const docs: any[] = await DocumentoGenerado.find({ tenantId: u.tenantId, userId: u._id }).select("codigo tipo archivo contrato createdAt").sort({ numero: 1 }).lean();
    console.log(`\n-- documentos con código (${docs.length}):`);
    for (const d of docs) {
      console.log(`   ${d.codigo} · ${d.tipo} · alta ${d.contrato?.alta} · ${new Date(d.createdAt).toISOString()} · ${d.archivo}`);
      codigos.add(d.codigo);
    }
    const logs: any[] = await ArcaAltasLog.find({ tenantId: u.tenantId, "contratos.cuil": { $in: [cuil, conGuiones] } }).select("tipo createdAt automatica enSeco resultado contratos.cuil contratos.resultado contratos.motivo contratos.tanda").sort({ createdAt: 1 }).lean();
    console.log(`\n-- registro de altas (${logs.length} corridas):`);
    for (const l of logs) {
      for (const c of (l.contratos || []).filter((x: any) => digitos(x.cuil) === cuil)) console.log(`   ${new Date(l.createdAt).toISOString()} · ${l.tipo}${l.automatica ? " (auto)" : ""}${l.enSeco ? " [seco]" : ""} · ${c.resultado}${c.tanda ? ` · tanda ${c.tanda}` : ""}${c.motivo ? ` · ${c.motivo}` : ""}`);
    }

    const tenant: any = await Tenant.findById(u.tenantId).lean();
    const cfg = getTenantDropboxConfig(tenant);
    if (!cfg) {
      console.log("\n(el tenant no tiene Dropbox conectado)");
      continue;
    }
    const apellido = String(u.lastName || "").trim().split(/\s+/)[0]?.toUpperCase() || "";
    const coincide = (n: string) => {
      const N = n.toUpperCase();
      return N.includes(cuil) || [...codigos].some((c) => N.includes(c)) || (apellido.length >= 4 && N.includes(apellido));
    };
    const carpetas = new Set<string>();
    for (const p of ["outbox", "pendbox", "firmados", "alta_temprana", "declinados"] as const) {
      const c = await resolverCarpetaPorProposito(p as any).catch(() => null);
      console.log(`\ncarpeta «${p}»: ${c || "(no configurada)"}`);
      if (c) carpetas.add(c);
    }
    // Las carpetas del circuito y, un nivel abajo, sus subcarpetas («No firmar», etc.).
    const vistas = new Set<string>();
    const recorrer = async (path: string, nivel: number) => {
      if (vistas.has(path.toLowerCase())) return;
      vistas.add(path.toLowerCase());
      let entradas: any[] = [];
      try {
        entradas = (await listFolder(String(tenant._id), cfg, path, true)).entries || [];
      } catch (e: any) {
        console.log(`   ${path}: no se pudo listar (${e?.message || e})`);
        return;
      }
      const archivos = entradas.filter((e) => e.tag === "file");
      const hallados = archivos.filter((e) => coincide(e.name));
      console.log(`   ${path}: ${archivos.length} archivo(s)${hallados.length ? `, ${hallados.length} de la persona:` : ""}`);
      for (const h of hallados) console.log(`      → ${h.name}`);
      if (nivel < 1) for (const d of entradas.filter((e) => e.tag === "folder")) await recorrer(d.path, nivel + 1);
    };
    console.log("\n-- Dropbox, búsqueda en toda la cuenta (activos y borrados):");
    for (const q of [...codigos, cuil]) {
      for (const borrados of [false, true]) {
        const r = await buscarArchivos(String(tenant._id), cfg, q, { borrados }).catch((e: any) => {
          console.log(`   «${q}»${borrados ? " (borrados)" : ""}: la búsqueda falló (${e?.response?.data?.error_summary || e?.message || e})`);
          return null;
        });
        if (r) console.log(`   «${q}»${borrados ? " (borrados)" : ""}: ${r.length === 0 ? "nada" : r.map((x) => x.path).join("\n      ")}`);
      }
    }
    // Lo que la casilla de Dropbox Sign registró de esos códigos (avisos de envío y de firmado).
    const hist: any[] = tenant?.integrations?.dropboxSign?.lastCheckHistorial || [];
    const lineas = hist.flatMap((h: any) => (h?.logs || []).map((l: any) => ({ cuando: h.fecha || h.at || h.cuando, ...l }))).filter((l: any) => [...codigos, cuil].some((q) => JSON.stringify(l).includes(q)));
    console.log(`\n-- historial de la casilla (${hist.length} lecturas guardadas): ${lineas.length} línea(s) de la persona`);
    for (const l of lineas) console.log(`   ${l.cuando || ""} · ${l.resultado} · ${l.detalle || ""} · ${l.archivo || l.asunto || ""}`);

    console.log("\n-- Dropbox, carpetas del circuito:");
    for (const c of carpetas) await recorrer(c, 0);
    // Y las hermanas de esas carpetas (la raíz de HelloSign suele tener Received, Declined, etc.).
    for (const c of carpetas) {
      const padre = c.replace(/\/[^/]+\/?$/, "");
      if (!padre) continue;
      const hermanas = ((await listFolder(String(tenant._id), cfg, padre, true).catch(() => ({ entries: [] as any[] }))).entries || []).filter((e: any) => e.tag === "folder");
      for (const h of hermanas) await recorrer(h.path, 1);
    }
  }
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e?.message || e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
