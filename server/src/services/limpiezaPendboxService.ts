import { deleteEntry, getTenantDropboxConfig, listFolder, moveEntry } from "./dropboxService.js";
import { resolverCarpetaPorProposito } from "../utils/estadoCarpetas.js";
import { PlanLimpieza, describirPlan, planLimpiezaPendbox } from "../utils/limpiezaPendbox.js";

/**
 * LA EJECUCIÓN de la limpieza de Pendbox (la decisión es `utils/limpiezaPendbox.ts`).
 *
 * Lista Requested signatures («Firmados») y, sólo si hay algo que emparejar, Pendbox —que puede tener
 * cientos de archivos— una sola vez. Arma el plan y, si no es en seco, lo aplica: renombra el firmado
 * (moveEntry) y recién si eso terminó bien borra el original (deleteEntry). Si algo falla, el
 * original se queda y se vuelve a intentar en la próxima pasada.
 *
 * La llaman el escaneo de carpetas (`estadoDropboxCronService.scanTenant`, cada pasada) y el script
 * `scripts/limpiarPendbox.ts` (a mano, con DRY_RUN).
 */

/** El tipo no está exportado por dropboxService: se toma del getter. */
type TenantDropboxConfig = NonNullable<ReturnType<typeof getTenantDropboxConfig>>;

export interface ResultadoLimpieza {
  plan: PlanLimpieza;
  renombrados: number;
  borrados: number;
  fallas: Array<{ firmado: string; paso: "renombrar" | "borrar"; error: string }>;
  /** Faltaba una carpeta o Firmados estaba vacía: no se listó Pendbox. */
  salteada?: "sin_carpetas" | "firmados_vacia";
}

export async function limpiarPendbox(tenantId: string, cfg: TenantDropboxConfig, opts: { enSeco: boolean; log?: (linea: string) => void }): Promise<ResultadoLimpieza> {
  const log = opts.log || (() => {});
  const vacio: ResultadoLimpieza = { plan: { acciones: [], omitidos: [] }, renombrados: 0, borrados: 0, fallas: [] };
  const [pendbox, firmados] = await Promise.all([resolverCarpetaPorProposito("pendbox"), resolverCarpetaPorProposito("firmados")]);
  if (!pendbox || !firmados) return { ...vacio, salteada: "sin_carpetas" };

  const soloArchivos = (xs: { tag: string; name: string; path: string }[]) => xs.filter((e) => e.tag === "file").map((e) => ({ name: e.name, path: e.path }));
  const enFirmados = soloArchivos((await listFolder(tenantId, cfg, firmados, true)).entries || []);
  if (enFirmados.length === 0) return { ...vacio, salteada: "firmados_vacia" };
  const enPendbox = soloArchivos((await listFolder(tenantId, cfg, pendbox, true)).entries || []);

  const plan = planLimpiezaPendbox(enFirmados, enPendbox);
  for (const l of describirPlan(plan)) log(l);
  const r: ResultadoLimpieza = { plan, renombrados: 0, borrados: 0, fallas: [] };
  if (opts.enSeco) return r;

  const carpetaFirmados = firmados.replace(/\/$/, "");
  for (const a of plan.acciones) {
    if (a.renombrarA) {
      try {
        await moveEntry(tenantId, cfg, a.firmado.path, `${carpetaFirmados}/${a.renombrarA}`);
        r.renombrados++;
      } catch (e: any) {
        // Sin el firmado con código no se borra nada: el original se queda hasta la próxima pasada.
        r.fallas.push({ firmado: a.firmado.name, paso: "renombrar", error: String(e?.message || e) });
        continue;
      }
    }
    try {
      await deleteEntry(tenantId, cfg, a.original.path);
      r.borrados++;
    } catch (e: any) {
      r.fallas.push({ firmado: a.firmado.name, paso: "borrar", error: String(e?.message || e) });
    }
  }
  return r;
}
