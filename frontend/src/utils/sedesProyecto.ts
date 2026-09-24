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
