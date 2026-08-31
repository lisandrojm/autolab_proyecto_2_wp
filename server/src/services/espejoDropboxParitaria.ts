import { Tenant } from "../models/Tenant.js";
import { getTenantDropboxConfig, listFolder, uploadFile } from "./dropboxService.js";
import { sanearNombre } from "./archivoParitariaService.js";

/**
 * ESPEJO EN DROPBOX: una copia con nombre legible de cada PDF de paritaria.
 *
 * DROPBOX ES ESPEJO, NO ALMACÉN. La app sigue leyendo el archivo del disco del server y ningún
 * endpoint lee de acá. Si Dropbox falla, cambia de token o alguien reordena la carpeta a mano, la app
 * no se entera y no se rompe: servir un PDF sigue siendo abrir un archivo local, que no falla nunca.
 * Agregarle red, rate limits y un modo de falla nuevo a un camino que ya funciona sería cambiar un
 * problema chico —que la evidencia viva en un solo disco— por uno grande.
 *
 * DOS ESQUEMAS DE NOMBRE PARA DOS CONSUMIDORES. En disco el archivo se llama por su hash, que es
 * correcto para la app —identidad, deduplicación, detección de reemplazos— e inútil para una persona
 * que abre una carpeta. Acá se llama por lo que dice. Por eso la publicación guarda las dos
 * referencias, y la de Dropbox es solo un puntero de conveniencia que puede quedar viejo.
 */

/**
 * Dónde vive el espejo. CONFIGURACIÓN, no literal en el código.
 *
 * Hoy cuelga de FZERO porque WeProdu corre para las empresas del usuario. Pero una paritaria no es un
 * documento de FZERO: es del convenio, y le sirve igual a cualquier tenant. El día que entre una
 * productora ajena esta carpeta se muda, y con la ruta en configuración mudarla es cambiar una
 * variable y correr el script — con la ruta escrita en el código, es una migración.
 *
 * QUEDA FUERA DE `ARCA/` A PROPÓSITO: ese árbol tiene «Alta temprana» y «Constancia de CUIT», que son
 * datos personales de trabajadores. Una paritaria es un documento público del gremio. Mezclarlas
 * obliga a fijar los permisos de la carpeta por lo más sensible que contiene, y entonces quien
 * necesita mirar una escala termina con acceso a constancias de CUIT.
 */
/*
  `/WEPRODU/Paritarias`, AL LADO DE `/WEPRODU/ARCA` Y NO ADENTRO.

  Ese árbol tiene «Alta temprana de Arca», «Constancia de cuit» y «Sin cuit»: datos personales de
  trabajadores. Una paritaria es un documento público del gremio. Compartir el token no cambia nada
  —es el mismo—; lo que se separa son las carpetas y sus permisos, para que quien necesita mirar una
  escala no termine con acceso a constancias de CUIT.

  NO LLEVA `/FZERO S.R.L` ADELANTE, y esto ya costó un diagnóstico equivocado: «FZERO S.R.L» es el
  nombre del espacio de equipo que muestra la interfaz web en la URL, no un path de la API. Para el
  token, la raíz del espacio ya ES eso, y `/WEPRODU` cuelga directo de ahí. Pedir «/FZERO S.R.L» da
  `path/not_found`, que es exactamente lo que parecía «esta app no ve este Dropbox».
*/
export const BASE_POR_DEFECTO = "/WEPRODU/Paritarias";

export const basePariarias = (): string => {
  const p = String(process.env.DROPBOX_PARITARIAS_PATH || BASE_POR_DEFECTO).trim();
  return (p.startsWith("/") ? p : `/${p}`).replace(/\/+$/, "");
};

/** Slug del tenant cuya conexión de Dropbox se usa. Sin esto, el único conectado. */
const TENANT_CONFIGURADO = process.env.DROPBOX_PARITARIAS_TENANT || "";

export interface ConexionEspejo {
  tenantId: string;
  cfg: NonNullable<ReturnType<typeof getTenantDropboxConfig>>;
}

/**
 * La conexión de Dropbox a usar: EXACTAMENTE LA MISMA QUE SIRVE `/WEPRODU/ARCA`.
 *
 * HAY DOS INTEGRACIONES QUE SE LLAMAN «DROPBOX» Y NO SON LO MISMO:
 *
 *   `integrations.dropbox`      · la conexión de ARCHIVOS (OAuth con refresh token). Es la que lista
 *                                 y sirve la pestaña Documentos, la que tiene `/WEPRODU/ARCA`, y la
 *                                 única que este espejo usa.
 *   `integrations.dropboxSign`  · una casilla IMAP para leer los avisos de Dropbox Sign. No toca
 *                                 archivos ni tiene token de Dropbox: no es candidata a nada de acá.
 *
 * El `rootPath` de la primera —hoy `/HelloSign`— es SOLO la carpeta donde abre el explorador de
 * Documentos. No limita el token: la raíz real del espacio tiene `WEPRODU`, `HelloSign` y las
 * carpetas de proyecto como hermanas. Confundir ese `rootPath` con el alcance del token fue lo que
 * hizo concluir que la app no veía este Dropbox.
 *
 * Si hay más de un tenant conectado hay que elegir explícitamente: subir la evidencia a la cuenta
 * equivocada porque el script agarró la primera que encontró es peor que no subirla.
 */
export const conexionEspejo = async (): Promise<{ conexion: ConexionEspejo | null; motivo: string }> => {
  const filtro = TENANT_CONFIGURADO ? { slug: TENANT_CONFIGURADO } : {};
  const tenants: any[] = await (Tenant as any).find(filtro).select("slug integrations.dropbox").lean();
  const conectados = tenants.map((t) => ({ t, cfg: getTenantDropboxConfig(t) })).filter((x) => x.cfg);
  if (conectados.length === 0) return { conexion: null, motivo: TENANT_CONFIGURADO ? `El tenant «${TENANT_CONFIGURADO}» no tiene Dropbox conectado.` : "Ningún tenant tiene Dropbox conectado." };
  if (conectados.length > 1) return { conexion: null, motivo: `Hay ${conectados.length} tenants con Dropbox conectado: elegí uno con DROPBOX_PARITARIAS_TENANT.` };
  return { conexion: { tenantId: String(conectados[0].t._id), cfg: conectados[0].cfg! }, motivo: "" };
};

/**
 * Que la cuenta conectada sea la que tiene esta carpeta, ANTES de subir nada.
 *
 * El chequeo existe por un modo de falla concreto y silencioso: si el token es de una app con carpeta
 * propia (el caso de la integración de Dropbox Sign, cuya raíz son `Outbox`, `Pendbox` y compañía),
 * subir a `/FZERO S.R.L/WEPRODU/Paritarias` NO falla — Dropbox crea ese árbol ADENTRO de la carpeta
 * de la app. Quedarían 33 PDF en un lugar que nadie va a mirar, con la corrida diciendo «ok».
 *
 * Se verifica el PRIMER tramo de la ruta y no la ruta entera: que falte `Paritarias` es normal la
 * primera vez y se crea sola al subir; que falte `FZERO S.R.L` en la raíz significa que estamos
 * mirando otro Dropbox, y ahí no hay nada que crear.
 */
export const baseAlcanzable = async (con: ConexionEspejo, base = basePariarias()): Promise<{ ok: boolean; motivo: string }> => {
  const ancla = "/" + base.split("/").filter(Boolean)[0];
  try {
    /*
      Se pide el ancla como PATH CONCRETO, nunca "".
      
      En `listFolder`, un path vacío sin `full` no es la raíz: es el `rootPath` del tenant. Preguntar
      por "" para «ver la raíz» devuelve el contenido de `/HelloSign` y hace parecer que el token
      está encerrado ahí. Acá siempre se pregunta por `/WEPRODU` —un path real— así que la respuesta
      es sobre la carpeta que importa y no sobre el default del explorador.
    */
    await listFolder(con.tenantId, con.cfg, ancla);
    return { ok: true, motivo: "" };
  } catch (e: any) {
    const detalle = e?.response?.data?.error_summary || e?.message || String(e);
    if (String(detalle).includes("path/not_found")) {
      return {
        ok: false,
        motivo: `«${ancla}» no existe en el Dropbox conectado: la cuenta o el alcance de la app no son los que tienen esa carpeta. No se sube nada para no crear el árbol en el lugar equivocado.`,
      };
    }
    return { ok: false, motivo: `No se pudo verificar «${ancla}»: ${detalle}` };
  }
};

/** El año de la carpeta: el del acuerdo si se detectó, si no el de la detección. */
export const anioDe = (periodo?: string | null, detectadaEl?: Date | null): string => {
  const m = /\b(20\d{2})\b/.exec(String(periodo || ""));
  if (m) return m[1];
  return String((detectadaEl ? new Date(detectadaEl) : new Date()).getFullYear());
};

/**
 * El nombre legible: `2026-04-28 · SATSAID · 131-75 + 634-11 · RE-2026-43103223.pdf`.
 *
 * Las barras de los convenios pasan a guiones porque `/` separa carpetas: «0131/75» en un nombre de
 * archivo crearía una carpeta «0131» con un archivo «75 + ...» adentro.
 *
 * El saneado es el de `archivoParitariaService`, con los espacios CONSERVADOS: en el nombre sugerido
 * de una descarga los espacios molestan, pero acá son el punto — el nombre existe para que una
 * persona lo lea en una carpeta.
 */
export const nombreLegible = (p: {
  detectadaEl?: Date | null;
  textoEnlace?: string;
  entidad: string;
  conveniosMencionados?: string[];
  periodo?: string | null;
  expediente?: string | null;
}): string => {
  const fecha = (p.detectadaEl ? new Date(p.detectadaEl) : new Date()).toISOString().slice(0, 10);
  const convenios = (p.conveniosMencionados || []).map((c) => c.replace(/\//g, "-")).join(" + ");
  // El identificador más específico que haya. El texto del enlace es el último recurso: siempre está,
  // pero es largo y repetido entre publicaciones.
  const identidad = p.expediente || p.periodo || p.textoEnlace || "";
  const partes = [fecha, p.entidad, convenios, identidad].map((x) => String(x || "").trim()).filter(Boolean);
  const crudo = partes.join(" · ");
  // 120 con la extensión adentro, igual que el nombre sugerido de la descarga.
  const limpio = sanearNombre(crudo, " ").replace(/\s+/g, " ").trim();
  return `${limpio.slice(0, 116) || "paritaria"}.pdf`;
};

export const rutaEspejo = (entidad: string, anio: string, nombre: string, base = basePariarias()): string =>
  [base, sanearNombre(entidad, " ").trim() || "sin entidad", anio, nombre].join("/");

/**
 * Sube una copia. Devuelve el estado que se guarda en la publicación.
 *
 * NO LANZA: el espejo nunca puede tumbar a quien lo llama. La detección de una paritaria nueva vale
 * mucho más que su copia de respaldo, y perder el aviso de que salió un acuerdo porque Dropbox
 * devolvió 429 sería cambiar un problema chico por uno grande. Lo que falla queda en `pendiente` y se
 * reintenta en la próxima corrida.
 */
export const subirEspejo = async (con: ConexionEspejo, path: string, bytes: Buffer): Promise<{ estado: "ok" | "pendiente" | "error"; motivo: string }> => {
  try {
    await uploadFile(con.tenantId, con.cfg, path, bytes);
    return { estado: "ok", motivo: "" };
  } catch (e: any) {
    const detalle = e?.response?.data?.error_summary || e?.message || String(e);
    return { estado: "pendiente", motivo: `No se pudo subir: ${detalle}` };
  }
};
