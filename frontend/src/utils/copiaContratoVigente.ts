/**
 * AGREGAR A UN PROYECTO CON EL CONTRATO VIGENTE QUE LA PERSONA YA TIENE EN OTRO.
 *
 * Un contrato vive dentro del vínculo persona-proyecto (`users_&_projects`), así que «sumarlo con su
 * contrato vigente» es crear en este proyecto una copia de ese contrato: mismo tipo, mismas fechas,
 * mismo rol, misma categoría, mismos sueldos, misma empleadora. Lo que NO se copia es lo que pertenece
 * al otro proyecto o a un documento puntual: área y turno (son de cada proyecto; se asignan después
 * desde la tabla de equipo), los documentos generados y firmados, el texto custom, la solicitud de
 * origen, y la valoración (la recalcula el server con la regla de este proyecto).
 *
 * Sí se copia lo que es de la RELACIÓN LABORAL y no del proyecto —el alta presentada en ARCA, la
 * constancia, la obra social constatada—: es el mismo contrato con la misma empleadora, y copiarlo sin
 * eso lo haría aparecer como «sin presentar» y volvería a validarle la obra social.
 */
export const NO_SE_COPIAN = [
  // del otro proyecto
  "proyecto_id",
  "nombre_proyecto",
  "areaId",
  "shiftId",
  "nombre_area",
  "nombre_turno",
  "areaShiftAssignments",
  "fecha_carga",
  "solicitudId",
  "origen",
  // de un documento puntual
  "firmaContratoUrl",
  "firmaContratoNombre",
  "firmaReleases",
  "firmaEmpresaContratoId",
  "firmaEmpresaReleaseId",
  "firmaGeneradoAt",
  "firmaReleasesGeneradoAt",
  "firmaEnviadaAt",
  "contenidoCustomContrato",
  "contenidoCustomReleases",
  "contenidoCustomEditadoPor",
  "contenidoCustomEditadoEl",
  "altaDocumentoUrl",
  "altaDocumentoNombre",
  "altaEnviadaAFirmarEl",
  // la decide este proyecto
  "valoracion_id",
  "valoracion_regla_id",
  "nombre_valoracion",
  "valoracionOverride",
  "calificacion",
  "_id",
] as const;

/** La copia que se manda a `assign-member`: el contrato sin lo que es del otro proyecto, y sin área ni turno. */
export function copiaParaOtroProyecto<T extends Record<string, unknown>>(contrato: T): Record<string, unknown> {
  const copia: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(contrato)) {
    if ((NO_SE_COPIAN as readonly string[]).includes(k)) continue;
    copia[k] = v;
  }
  copia.areaId = "";
  copia.shiftId = "";
  copia.areaShiftAssignments = [];
  return copia;
}
