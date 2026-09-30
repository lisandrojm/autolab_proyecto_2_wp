/**
 * Las sedes de un proyecto: `metadata.sedeIds` (varias; la primera es la principal) o, en los proyectos
 * de antes, la única `metadata.sedeId`. Mismo criterio que `sedesDelProyecto` en el server.
 */
export const sedesDelForm = (meta: any): number[] => {
  const varias: number[] = Array.isArray(meta?.sedeIds) ? meta.sedeIds.map(Number).filter((n: number) => Number.isFinite(n) && n > 0) : [];
  if (varias.length > 0) return [...new Set(varias)];
  return Number(meta?.sedeId) > 0 ? [Number(meta.sedeId)] : [];
};

/** Los nombres de las sedes que resolvió el server (`metadataResolutions.sedes`, o la única de antes). */
export const nombresDeSedes = (project: any): string[] => {
  const r = project?.metadataResolutions;
  const lista: any[] = Array.isArray(r?.sedes) && r.sedes.length > 0 ? r.sedes : r?.sede ? [r.sede] : [];
  return lista.map((s) => s?.name || s?.data?.nombre).filter(Boolean);
};

/**
 * Las favoritas de las empresas elegidas (`sedeFavoritaId`), en el orden de las empresas. Es la sede
 * que cada empresa quiere preseleccionada en el proyecto.
 */
export const favoritasDeEmpresas = (empresaIds: string[], companies: Array<{ _id: string; sedeFavoritaId?: number | null }>): number[] => {
  const out: number[] = [];
  for (const id of empresaIds) {
    const fav = Number(companies.find((c) => String(c._id) === String(id))?.sedeFavoritaId);
    if (fav > 0 && !out.includes(fav)) out.push(fav);
  }
  return out;
};

/**
 * EN QUÉ ORDEN QUEDAN LAS SEDES DE UN PROYECTO, sin importar en qué orden se eligieron.
 *
 * Primero la favorita de la Empresa del Contrato —la empresa la eligió por encima del orden
 * general—, y el resto según el orden general de Sedes (`data.orden`, lo fija el ABM). La primera es
 * la principal: la que precarga el alta de contratos.
 */
export const ordenarSedes = (ids: number[], catalogo: Array<{ name?: string; data?: any }>, favoritas: number[] = []): number[] => {
  const info = new Map(catalogo.map((s) => [Number(s?.data?.id), s]));
  const orden = (id: number) => {
    const o = Number(info.get(id)?.data?.orden);
    return Number.isFinite(o) ? o : Number.MAX_SAFE_INTEGER;
  };
  const fav = (id: number) => {
    const i = favoritas.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...new Set(ids)].sort((a, b) => fav(a) - fav(b) || orden(a) - orden(b) || String(info.get(a)?.name || "").localeCompare(String(info.get(b)?.name || ""), "es"));
};

/**
 * Las sedes del formulario después de un cambio (de sedes o de Empresa del Contrato): ordenadas, y
 * con la favorita de la empresa PRESELECCIONADA si todavía no había ninguna sede elegida.
 *
 * Solo con el campo vacío: si alguien ya eligió sedes a mano, cambiar de empresa no le agrega una
 * por detrás.
 */
export const sedesParaElForm = (
  sedeIds: number[],
  empresaIds: string[],
  companies: Array<{ _id: string; sedeFavoritaId?: number | null }>,
  catalogo: Array<{ name?: string; data?: any }>,
): { sedeIds: number[]; sedeId: number | undefined } => {
  const favoritas = favoritasDeEmpresas(empresaIds, companies);
  const base = sedeIds.length > 0 ? sedeIds : favoritas.slice(0, 1);
  const ordenadas = ordenarSedes(base, catalogo, favoritas);
  return { sedeIds: ordenadas, sedeId: ordenadas[0] };
};
