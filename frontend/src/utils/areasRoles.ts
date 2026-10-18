/**
 * LOS ROLES EMPRESA DE UN ÁREA, del lado del front: cómo se leen de la respuesta del server y cómo se
 * mandan al guardar. Puro y sin imports, para poder testearlo en Node (ver `areasRoles.test.ts`).
 *
 * Nació de un bug (18/10/2026): el normalizador de áreas reconstruía cada área campo por campo y se
 * olvidó de `rolesFrame`; la pantalla mostraba 0 roles en todas, el formulario de edición se hidrataba
 * vacío y, al guardar sólo el nombre, mandaba `rolesFrame: []` y borraba las asignaciones del área.
 */

/** Los ids de rol tal como vienen del server: strings, ObjectIds serializados o documentos poblados. `undefined` si el server no mandó el campo. */
export function rolesFrameDe(raw: any): string[] | undefined {
  const lista = raw?.rolesFrame;
  if (!Array.isArray(lista)) return undefined;
  return [...new Set(lista.map((x: any) => String(x?._id ?? x?.id ?? x ?? "").trim()).filter((id: string) => /^[a-f\d]{24}$/i.test(id)))];
}

/**
 * Lo que va en el PATCH/POST del área. Al EDITAR, `rolesFrame` sólo viaja si el área venía con el campo
 * hidratado: un server viejo que no lo devuelve no puede hacer que el front le borre los roles.
 */
export function payloadDeArea<T extends { rolesFrame?: string[] }>(form: T, areaEditada: { rolesFrame?: string[] } | null): T {
  if (areaEditada && areaEditada.rolesFrame === undefined) {
    const { rolesFrame: _omitido, ...resto } = form;
    return resto as T;
  }
  return form;
}
