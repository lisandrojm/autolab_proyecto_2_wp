import { Info } from "../models/Info.js";

/**
 * Helpers para resolver, a partir de la config de "transición automática por carpeta de Dropbox" de
 * los Estados (Info type="estado-empleado"), qué carpeta/estado corresponde a un propósito dado — sin
 * hardcodear nombres de estado ni de carpeta, matcheando por texto (igual criterio que ya usa
 * `resolverCarpetaConstanciaCuit` en routes/afip.ts). El campo `detalle` es una nota libre casi nunca
 * completada — por eso también se matchea contra el ÚLTIMO tramo del path de la carpeta (el nombre
 * que realmente se ve en "Carpetas vigiladas", `nombreCarpeta()` en EscaneoDropboxConfigPage.tsx).
 */

interface CarpetaConfigurada {
  dropboxCarpeta?: string;
  detalle?: string;
}

function nombreDeCarpeta(path?: string): string {
  return (path || "").split("/").filter(Boolean).pop() || "";
}

function matchTodos(texto: string, patrones: RegExp[]): boolean {
  return patrones.every((p) => p.test(texto));
}

function textoDeCarpeta(c: CarpetaConfigurada): string {
  return `${c.detalle || ""} ${nombreDeCarpeta(c.dropboxCarpeta)}`;
}

async function estadosConTransicion(): Promise<{ name: string; carpetas: CarpetaConfigurada[] }[]> {
  const estados = await Info.find({ type: "estado-empleado", "data.transicionAutomatica.carpetas.0": { $exists: true } })
    .select("name data.transicionAutomatica")
    .lean();
  return (estados as any[]).map((e) => ({ name: e.name, carpetas: (e?.data?.transicionAutomatica?.carpetas || []) as CarpetaConfigurada[] }));
}

/** Path de la PRIMERA carpeta (de cualquier estado) cuyo nombre o nota matcheen TODOS los patrones. */
export async function resolverCarpetaPorPatron(patrones: RegExp[]): Promise<string | null> {
  for (const estado of await estadosConTransicion()) {
    const match = estado.carpetas.find((c) => matchTodos(textoDeCarpeta(c), patrones));
    if (match?.dropboxCarpeta) return match.dropboxCarpeta;
  }
  return null;
}

/** Nombre del ESTADO cuya transición automática incluye alguna carpeta que matchee TODOS los
 *  patrones de al menos uno de los grupos dados (cada grupo = un trámite de origen distinto). */
export async function resolverEstadoPorCarpetas(gruposDePatrones: RegExp[][]): Promise<string | null> {
  for (const estado of await estadosConTransicion()) {
    const algunaMatchea = estado.carpetas.some((c) => {
      const texto = textoDeCarpeta(c);
      return gruposDePatrones.some((patrones) => matchTodos(texto, patrones));
    });
    if (algunaMatchea) return estado.name;
  }
  return null;
}
