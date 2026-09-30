/**
 * LA VALORACIÓN QUE RIGE PARA UN ROL EMPRESA Y UN TIPO DE CONTRATO DENTRO DE UN PROYECTO.
 *
 * Un proyecto tiene UNA valoración (la del margen, o forzada) y, además, puede tener EXCEPCIONES por
 * rol empresa + tipo de contrato: «en este proyecto, al Camarógrafo con contrato Jornada, siempre
 * Oro», aunque el proyecto sea Plata. Es lo que decide qué categorías se ofrecen al contratar a
 * alguien con ese rol y ese tipo, y contra qué se revalida en el server.
 *
 * El TIPO DE CONTRATO es el `Contrato` que se elige en el alta (Jornada, Plazo fijo 5x7…), por `_id`.
 * Una excepción sin tipo (`contratoId` vacío) vale para cualquier tipo; si hay una con el tipo exacto,
 * gana esa.
 *
 * Vive en `compartido/` porque la usan el server (que la hace cumplir), el alta de miembro de la web
 * y la app móvil: tres copias de «qué nivel le toca a este rol» se separarían solas.
 */

export interface ValoracionDeRol {
  /** `RoleFrame.data.rol.id`, el mismo número que guarda el contrato en `rol_frame_id`. */
  rolFrameId: number | string;
  /** `_id` del Contrato (tipo de contrato). Vacío = cualquier tipo. */
  contratoId?: unknown;
  valoracionId: unknown;
}

export interface ProyectoConValoracion {
  valoracionId?: unknown;
  valoracionesPorRol?: ValoracionDeRol[] | null;
}

/** El id de una referencia, venga poblada (`{ _id }`), como ObjectId o como string. `""` = ninguna. */
export const idDeValoracion = (ref: unknown): string => {
  if (!ref) return "";
  if (typeof ref === "object" && ref !== null && "_id" in (ref as Record<string, unknown>)) return String((ref as { _id: unknown })._id || "");
  return String(ref);
};

/**
 * La excepción de ese rol (y ese tipo de contrato) en el proyecto, o `null` si no tiene: rige la del
 * proyecto. Primero la del tipo exacto; si no hay, una sin tipo.
 */
export const excepcionDelRol = (proyecto: ProyectoConValoracion | null | undefined, rolFrameId: unknown, contratoId?: unknown): ValoracionDeRol | null => {
  if (rolFrameId == null || rolFrameId === "") return null;
  const rol = String(rolFrameId);
  const tipo = idDeValoracion(contratoId);
  const delRol = (proyecto?.valoracionesPorRol || []).filter((x) => String(x?.rolFrameId) === rol && idDeValoracion(x?.valoracionId));
  return (tipo && delRol.find((x) => idDeValoracion(x.contratoId) === tipo)) || delRol.find((x) => !idDeValoracion(x.contratoId)) || null;
};

/**
 * El id de la valoración que rige para ese rol y tipo de contrato: la excepción si la hay, si no la
 * del proyecto. `""` = el proyecto no está valorado y no hay excepción: no se filtra nada.
 */
export const valoracionParaRol = (proyecto: ProyectoConValoracion | null | undefined, rolFrameId: unknown, contratoId?: unknown): string => {
  const excepcion = excepcionDelRol(proyecto, rolFrameId, contratoId);
  return excepcion ? idDeValoracion(excepcion.valoracionId) : idDeValoracion(proyecto?.valoracionId);
};

/**
 * Con VARIOS roles a la vez (la solicitud y las plantillas de la app admiten más de uno): si todos
 * rigen con la misma valoración, esa; si difieren, `""` — no se filtra. Es el mismo criterio que la
 * app ya aplica con varios proyectos: recortar con el criterio de uno solo sería adivinar, y el alta
 * real (un rol, un proyecto) revalida en el server.
 */
export const valoracionParaRoles = (proyecto: ProyectoConValoracion | null | undefined, rolFrameIds: unknown[], contratoId?: unknown): string => {
  if (!rolFrameIds.length) return idDeValoracion(proyecto?.valoracionId);
  const distintas = new Set(rolFrameIds.map((r) => valoracionParaRol(proyecto, r, contratoId)));
  return distintas.size === 1 ? [...distintas][0] : "";
};

/** Limpia la lista que llega del cliente: una fila por rol + tipo, sin filas incompletas. */
export const normalizarValoracionesPorRol = (lista: unknown): Array<{ rolFrameId: number; contratoId: string | null; valoracionId: string }> => {
  if (!Array.isArray(lista)) return [];
  const porClave = new Map<string, { rolFrameId: number; contratoId: string | null; valoracionId: string }>();
  for (const x of lista) {
    const rol = Number((x as ValoracionDeRol)?.rolFrameId);
    const tipo = idDeValoracion((x as ValoracionDeRol)?.contratoId) || null;
    const val = idDeValoracion((x as ValoracionDeRol)?.valoracionId);
    if (Number.isFinite(rol) && rol > 0 && val) porClave.set(`${rol}|${tipo || ""}`, { rolFrameId: rol, contratoId: tipo, valoracionId: val });
  }
  return [...porClave.values()];
};
