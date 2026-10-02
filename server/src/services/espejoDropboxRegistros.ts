import { Tenant } from "../models/Tenant.js";
import { getTenantDropboxConfig, listFolder, uploadFile } from "./dropboxService.js";

/**
 * COPIA EN DROPBOX DE LO QUE ARCA CONTESTÓ EN CADA REGISTRO (link de registro público).
 *
 * Cada consulta de «Validar CUIT» del formulario y cada registro terminado dejan un `.json` en
 * `/WEPRODU/Registros/AAAA-MM/`. Es la evidencia de qué dijo el organismo en ese momento: si después
 * hay que explicar un nombre sellado, un «CUIT ya registrado» o un CUIT inactivo, está la respuesta tal
 * cual vino, no lo que se dedujo de ella.
 *
 * SIN `/FZERO S.R.L` ADELANTE: es el nombre del espacio de equipo en la web, no un path de la API (ver
 * `espejoDropboxParitaria.ts`). Para el token, `/WEPRODU` cuelga de la raíz.
 *
 * NUNCA FRENA EL REGISTRO: se sube en segundo plano y un error de Dropbox solo se loguea. Del otro
 * lado hay una persona sola completando un formulario; no puede quedar esperando a Dropbox.
 *
 * NO SE GUARDA LA CONTRASEÑA ni el token del link: solo lo que respondió ARCA y quién lo pidió.
 */
export const BASE_REGISTROS = "/WEPRODU/Registros";

const base = (): string => {
  const p = String(process.env.DROPBOX_REGISTROS_PATH || BASE_REGISTROS).trim();
  return (p.startsWith("/") ? p : `/${p}`).replace(/\/+$/, "");
};

/** Por tenant: si su Dropbox tiene `/WEPRODU`. Se verifica una vez por proceso (ver `baseAlcanzable`). */
const alcanzable = new Map<string, Promise<boolean>>();

/*
  Se verifica el PRIMER tramo antes de subir. Con un token de app con carpeta propia, subir a una ruta
  inexistente NO falla: Dropbox crea el árbol adentro de la carpeta de la app y los archivos quedan
  donde nadie los mira. Que falte `Registros` es normal (se crea al subir); que falte `/WEPRODU`, no.
*/
const verificarBase = (tenantId: string, cfg: NonNullable<ReturnType<typeof getTenantDropboxConfig>>): Promise<boolean> => {
  let p = alcanzable.get(tenantId);
  if (!p) {
    const ancla = "/" + base().split("/").filter(Boolean)[0];
    p = listFolder(tenantId, cfg, ancla).then(
      () => true,
      (e: any) => {
        console.warn(`[REGISTROS→DROPBOX] «${ancla}» no está en el Dropbox del tenant ${tenantId}: no se sube nada.`, e?.response?.data?.error_summary || e?.message || e);
        alcanzable.delete(tenantId); // se reintenta en la próxima: puede haber sido un corte de red
        return false;
      },
    );
    alcanzable.set(tenantId, p);
  }
  return p;
};

const dos = (n: number) => String(n).padStart(2, "0");

/** Fecha y hora de Argentina, para que el nombre del archivo coincida con lo que ve la gente. */
const ahoraArgentina = () => {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return {
    mes: `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}`,
    sello: `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}_${dos(d.getUTCHours())}-${dos(d.getUTCMinutes())}-${dos(d.getUTCSeconds())}`,
  };
};

/** `validar-cuit` (cada consulta del botón) o `registro` (el registro terminado). */
export type TipoEvidenciaRegistro = "validar-cuit" | "registro";

/**
 * Sube la evidencia en segundo plano. No devuelve nada que haya que esperar y no tira nunca.
 */
export function guardarRespuestaDeRegistro(o: { tenantId: string; tipo: TipoEvidenciaRegistro; cuit?: string; linkId?: string; contenido: Record<string, unknown> }): void {
  void (async () => {
    try {
      const tenant: any = await (Tenant as any).findById(o.tenantId).select("integrations.dropbox").lean();
      const cfg = getTenantDropboxConfig(tenant);
      if (!cfg) return; // sin Dropbox conectado no hay dónde guardar: no es un error del registro
      if (!(await verificarBase(o.tenantId, cfg))) return;
      const { mes, sello } = ahoraArgentina();
      const cuit = String(o.cuit || "").replace(/\D/g, "") || "sin-cuit";
      const ruta = `${base()}/${mes}/${sello}_${cuit}_${o.tipo}.json`;
      const json = JSON.stringify({ tipo: o.tipo, momento: new Date().toISOString(), cuit: o.cuit || null, linkId: o.linkId || null, ...o.contenido }, null, 2);
      await uploadFile(o.tenantId, cfg, ruta, Buffer.from(json, "utf8"));
    } catch (e: any) {
      console.warn(`[REGISTROS→DROPBOX] No se pudo guardar ${o.tipo} de ${o.cuit || "?"}:`, e?.response?.data?.error_summary || e?.message || e);
    }
  })();
}
