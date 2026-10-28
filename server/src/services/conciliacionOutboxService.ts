import path from "node:path";
import { Types } from "mongoose";
import { createFolder, getTenantDropboxConfig, listFolder, moveEntry } from "./dropboxService.js";
import { resolverCarpetaPorProposito } from "../utils/estadoCarpetas.js";
import { DropboxSignEnvio } from "../models/DropboxSignEnvio.js";
import { Tenant } from "../models/Tenant.js";
import { codigosDe, describirConciliacion, PlanConciliacion, planConciliacionOutbox } from "../utils/conciliacionOutbox.js";

/**
 * LA EJECUCIÓN de la conciliación Outbox ↔ Pendbox/Firmados (la decisión es `utils/conciliacionOutbox.ts`).
 *
 * Lista las tres carpetas, arma el plan y, si no es en seco, MUEVE cada duplicado a `CARPETA_YA_ENVIADOS`
 * (hermana del Outbox: fuera de «Para Firmar» y de la cola del bot, que listan el Outbox sin subcarpetas)
 * y cierra su registro de la cola de envío: deja de figurar en cola o como trabado. Nunca borra. Si un
 * movimiento falla, el archivo se queda en Outbox y se reintenta en la próxima pasada.
 *
 * La llaman el escaneo de carpetas (`estadoDropboxCronService.scanTenant`) y el script
 * `scripts/conciliarOutbox.ts`. El escaneo la corre EN SECO hasta que una pasada real del script la
 * confirme (`integrations.dropbox.conciliacionOutboxConfirmadaAt`): primero se revisa la lista.
 */

type TenantDropboxConfig = NonNullable<ReturnType<typeof getTenantDropboxConfig>>;

export const CARPETA_YA_ENVIADOS = "Outbox_ya_enviados";

export interface ResultadoConciliacion {
  plan: PlanConciliacion;
  movidos: number;
  registrosCerrados: number;
  destino: string | null;
  fallas: Array<{ archivo: string; error: string }>;
  salteada?: "sin_carpetas";
}

const soloArchivos = (xs: { tag: string; name: string; path: string }[]) => xs.filter((e) => e.tag === "file").map((e) => ({ name: e.name, path: e.path }));

/** Los códigos que ya están en Pendbox y en Firmados: dos listados. La red de la corrida de envío. */
export async function codigosYaEnviados(tenantId: string, cfg: TenantDropboxConfig): Promise<{ pendbox: Map<string, string>; firmados: Map<string, string> } | null> {
  const [pendbox, firmados] = await Promise.all([resolverCarpetaPorProposito("pendbox"), resolverCarpetaPorProposito("firmados")]);
  if (!pendbox && !firmados) return null;
  const [p, f] = await Promise.all([pendbox ? listFolder(tenantId, cfg, pendbox, true) : null, firmados ? listFolder(tenantId, cfg, firmados, true) : null]);
  return { pendbox: codigosDe(soloArchivos(p?.entries || [])), firmados: codigosDe(soloArchivos(f?.entries || [])) };
}

export async function conciliarOutbox(tenantId: string, cfg: TenantDropboxConfig, opts: { enSeco: boolean; log?: (linea: string) => void }): Promise<ResultadoConciliacion> {
  const log = opts.log || (() => {});
  const [outbox, pendbox, firmados] = await Promise.all([resolverCarpetaPorProposito("outbox"), resolverCarpetaPorProposito("pendbox"), resolverCarpetaPorProposito("firmados")]);
  const vacio: ResultadoConciliacion = { plan: { mover: [], quedan: [] }, movidos: 0, registrosCerrados: 0, destino: null, fallas: [] };
  if (!outbox || (!pendbox && !firmados)) return { ...vacio, salteada: "sin_carpetas" };

  const [o, p, f] = await Promise.all([listFolder(tenantId, cfg, outbox, true), pendbox ? listFolder(tenantId, cfg, pendbox, true) : null, firmados ? listFolder(tenantId, cfg, firmados, true) : null]);
  const plan = planConciliacionOutbox(soloArchivos(o.entries || []), soloArchivos(p?.entries || []), soloArchivos(f?.entries || []));
  const destino = `${path.posix.dirname(outbox.replace(/\/$/, ""))}/${CARPETA_YA_ENVIADOS}`.replace(/^\/\//, "/");
  for (const l of describirConciliacion(plan, opts.enSeco)) log(l);
  const r: ResultadoConciliacion = { ...vacio, plan, destino };
  if (opts.enSeco || plan.mover.length === 0) return r;

  // La carpeta destino: si ya existe, Dropbox contesta conflicto y se sigue.
  await createFolder(tenantId, cfg, destino).catch(() => {});
  for (const m of plan.mover) {
    try {
      await moveEntry(tenantId, cfg, m.archivo.path, `${destino}/${m.archivo.name}`);
      r.movidos++;
    } catch (e: any) {
      r.fallas.push({ archivo: m.archivo.name, error: String(e?.message || e) });
      continue;
    }
    // Su registro de la cola (en cola, trabado, con error) pasa a enviado: se envió, por fuera del bot.
    const u = await DropboxSignEnvio.updateOne(
      { tenantId: new Types.ObjectId(tenantId), codigo: m.codigo, estado: { $ne: "enviado" } },
      { $set: { estado: "enviado", detalle: `Ya estaba ${m.estado === "firmado" ? "en Firmados (firmado)" : "en Pendbox (esperando firma)"}: «${m.prueba}». La copia del Outbox se movió a ${CARPETA_YA_ENVIADOS}.` } },
    ).catch(() => null);
    if (u?.modifiedCount) r.registrosCerrados++;
  }
  return r;
}

/** ¿Ya hubo una pasada real confirmada a mano? Hasta entonces el escaneo la corre en seco. */
export async function conciliacionConfirmada(tenantId: string): Promise<boolean> {
  const t: any = await Tenant.findById(tenantId).select("integrations.dropbox.conciliacionOutboxConfirmadaAt").lean();
  return !!t?.integrations?.dropbox?.conciliacionOutboxConfirmadaAt;
}

