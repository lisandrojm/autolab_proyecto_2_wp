/*
  IMPORTAR EL CATÁLOGO DE CENTROS DE COSTO DESDE EL JSON DE Tango.

  Acá vive lo que se puede razonar sin base de datos: validar el archivo y decidir cómo se remapean
  los proyectos. Está separado de la ruta a propósito —son las dos cosas que NO pueden estar mal— para
  poder probarlas con casos en vez de con un import de verdad contra 806 registros.

  DOS REGLAS QUE EXPLICAN EL DISEÑO:

  1. SE VALIDA TODO EL ARCHIVO ANTES DE ESCRIBIR UNA SOLA FILA. El modo «reemplazar» borra el catálogo
     entero: descubrir en el ítem 700 que falta un código dejaría la plataforma sin centros de costo y
     con la mitad cargada. Por eso `validarPayload` junta TODOS los errores con su índice y la ruta no
     toca nada si hay uno.

  2. EL REMAPEO SE HACE POR CÓDIGO, no por id. Los ids viejos del catálogo (1–46) también existen como
     `idAuxiliar` nuevos apuntando a otros centros: el id 1 era «682» y en Tango el 1 es «99». Remapear
     por id sería cambiarle el centro a 44 proyectos sin que nadie lo note. El código («682») es lo que
     significa lo mismo antes y después, así que es lo único que se puede cruzar.
*/

export interface ItemCentroCosto {
  idAuxiliar: number;
  codAuxiliar: string;
  descAuxiliar: string;
  habilitado: "S" | "N";
}

export type ModoImport = "reemplazar" | "actualizar";

export interface PayloadImport {
  tipo?: string;
  modo?: string;
  total?: number;
  items?: unknown;
  /** Si además hay que corregir a qué centro apuntan los proyectos. Sólo tiene sentido al reemplazar. */
  remapearProyectos?: boolean;
}

export interface ResultadoValidacion {
  ok: boolean;
  modo: ModoImport;
  items: ItemCentroCosto[];
  /** Un error por problema, con el índice del ítem (base 0) para poder encontrarlo en el archivo. */
  errores: string[];
}

const esEnteroPositivo = (v: unknown): boolean => typeof v === "number" && Number.isInteger(v) && v > 0;

/**
 * Valida el archivo entero: los cuatro campos de cada ítem, sus tipos, y que no haya `idAuxiliar` ni
 * `codAuxiliar` repetidos. Devuelve los ítems ya normalizados (trim) cuando no hay errores.
 *
 * Los duplicados se informan con los DOS índices —«ya está en el ítem 12»—: con uno solo hay que
 * recorrer el archivo a mano para encontrar al otro.
 */
export function validarPayload(payload: PayloadImport): ResultadoValidacion {
  const errores: string[] = [];
  const modoCrudo = String(payload?.modo ?? "reemplazar").trim().toLowerCase();
  const modo: ModoImport = modoCrudo === "actualizar" ? "actualizar" : "reemplazar";
  if (modoCrudo !== "reemplazar" && modoCrudo !== "actualizar") {
    errores.push(`modo: "${payload?.modo}" no es válido. Usá "reemplazar" o "actualizar".`);
  }

  const crudos = payload?.items;
  if (!Array.isArray(crudos)) {
    return { ok: false, modo, items: [], errores: [...errores, "items: falta la lista de centros de costo (items[])."] };
  }
  if (crudos.length === 0) {
    return { ok: false, modo, items: [], errores: [...errores, "items: el archivo no trae ningún centro de costo."] };
  }

  const items: ItemCentroCosto[] = [];
  const porId = new Map<number, number>();
  const porCod = new Map<string, number>();

  crudos.forEach((crudo: any, i: number) => {
    const donde = `items[${i}]`;
    if (!crudo || typeof crudo !== "object") {
      errores.push(`${donde}: no es un objeto.`);
      return;
    }
    const idAuxiliar = crudo.idAuxiliar;
    const codAuxiliar = typeof crudo.codAuxiliar === "string" ? crudo.codAuxiliar.trim() : crudo.codAuxiliar;
    const descAuxiliar = typeof crudo.descAuxiliar === "string" ? crudo.descAuxiliar.trim() : crudo.descAuxiliar;
    const habilitado = typeof crudo.habilitado === "string" ? crudo.habilitado.trim().toUpperCase() : crudo.habilitado;

    let valido = true;
    if (!esEnteroPositivo(idAuxiliar)) {
      errores.push(`${donde}: idAuxiliar tiene que ser un entero mayor a 0 (llegó ${JSON.stringify(crudo.idAuxiliar)}).`);
      valido = false;
    }
    if (typeof codAuxiliar !== "string" || codAuxiliar === "") {
      errores.push(`${donde}: falta codAuxiliar (es el número del centro, y es lo que se muestra).`);
      valido = false;
    }
    if (typeof descAuxiliar !== "string" || descAuxiliar === "") {
      errores.push(`${donde}: falta descAuxiliar.`);
      valido = false;
    }
    if (habilitado !== "S" && habilitado !== "N") {
      errores.push(`${donde}: habilitado tiene que ser "S" o "N" (llegó ${JSON.stringify(crudo.habilitado)}).`);
      valido = false;
    }
    if (!valido) return;

    const yaId = porId.get(idAuxiliar as number);
    if (yaId !== undefined) {
      errores.push(`${donde}: idAuxiliar ${idAuxiliar} repetido (ya está en items[${yaId}]).`);
      return;
    }
    const yaCod = porCod.get(codAuxiliar as string);
    if (yaCod !== undefined) {
      errores.push(`${donde}: codAuxiliar "${codAuxiliar}" repetido (ya está en items[${yaCod}]).`);
      return;
    }
    porId.set(idAuxiliar as number, i);
    porCod.set(codAuxiliar as string, i);
    items.push({ idAuxiliar: idAuxiliar as number, codAuxiliar: codAuxiliar as string, descAuxiliar: descAuxiliar as string, habilitado: habilitado as "S" | "N" });
  });

  // `total`, si viene, es una verificación de que llegó el archivo completo, no un dato que se usa.
  if (typeof payload?.total === "number" && payload.total !== crudos.length) {
    errores.push(`total: el archivo dice ${payload.total} centros y trae ${crudos.length}.`);
  }

  return { ok: errores.length === 0, modo, items, errores };
}

/** Un centro del catálogo ANTERIOR, como se necesita para remapear: su id y su código. */
export interface CentroViejo {
  idViejo: number;
  codigo: string;
}

export interface FilaRemapeo {
  idViejo: number;
  codigo: string;
  idAuxiliarNuevo: number | null;
}

/**
 * La tabla `idViejo → codigo → idAuxiliarNuevo`, cruzando por código.
 *
 * Se deriva del catálogo que está en la base en vez de leerse de un archivo fijo: el archivo se
 * escribió mirando una foto de la base, y si alguien dio de alta o corrigió un centro después, la foto
 * miente justo en el único momento en que se usa. Los códigos se comparan sin distinguir mayúsculas ni
 * espacios («SinAsignar» / «sinasignar»), que es la clase de diferencia que tiene un catálogo cargado
 * a mano contra uno exportado.
 *
 * `idAuxiliarNuevo: null` = ese centro no existe en Tango. No se remapea y se informa: adivinarle un
 * centro a un proyecto es peor que dejarlo como está y que alguien lo resuelva.
 */
export function construirRemapeo(viejos: CentroViejo[], items: ItemCentroCosto[]): FilaRemapeo[] {
  const clave = (c: string) => String(c ?? "").trim().toLowerCase();
  const nuevoPorCodigo = new Map<string, number>();
  items.forEach((i) => nuevoPorCodigo.set(clave(i.codAuxiliar), i.idAuxiliar));

  return viejos
    .filter((v) => Number.isFinite(v.idViejo) && v.idViejo > 0)
    .map((v) => ({ idViejo: v.idViejo, codigo: v.codigo, idAuxiliarNuevo: nuevoPorCodigo.get(clave(v.codigo)) ?? null }))
    .sort((a, b) => a.idViejo - b.idViejo);
}

/** Un proyecto, con lo mínimo para decidir si hay que tocarlo. */
export interface ProyectoARemapear {
  _id: unknown;
  nombre?: string;
  centroCostoId?: number | null;
  /** Marca de que este proyecto ya se migró: ver `decidirRemapeo`. */
  centroCostoOrigen?: string | null;
}

export interface CambioProyecto {
  projectId: string;
  nombre: string;
  antes: number;
  despues: number;
  codigo: string;
}

export interface DecisionRemapeo {
  cambios: CambioProyecto[];
  /** Los que se dejan como están, con el motivo. */
  omitidos: Array<{ projectId: string; nombre: string; centroCostoId: number; motivo: string }>;
}

/**
 * QUÉ PROYECTOS SE TOCAN Y A QUÉ VALOR.
 *
 * LA IDEMPOTENCIA ES LO CRÍTICO ACÁ, y no es un detalle teórico: los ids viejos 1–46 también son
 * `idAuxiliar` válidos del catálogo nuevo. Correr la migración dos veces sobre el mismo proyecto lo
 * remaparía de nuevo —del 863 al que le toque— y lo dejaría en un centro que nadie eligió, sin forma
 * de darse cuenta. Por eso el proyecto ya migrado queda marcado (`metadata.centroCostoOrigen` =
 * "frame") y acá se lo saltea por esa marca, no por el valor.
 *
 * Tampoco se toca:
 *   · `centroCostoId` 0, null o vacío: «sin centro» no es un centro que haya que traducir.
 *   · el que no tiene equivalente en Tango (`idAuxiliarNuevo: null`): se informa para que se resuelva.
 *   · el que ya apunta al valor nuevo: no hay nada que escribir.
 */
export function decidirRemapeo(proyectos: ProyectoARemapear[], remapeo: FilaRemapeo[]): DecisionRemapeo {
  const porIdViejo = new Map<number, FilaRemapeo>();
  remapeo.forEach((r) => porIdViejo.set(r.idViejo, r));

  const cambios: CambioProyecto[] = [];
  const omitidos: DecisionRemapeo["omitidos"] = [];

  proyectos.forEach((p) => {
    const projectId = String(p._id);
    const nombre = p.nombre || "(sin nombre)";
    const antes = Number(p.centroCostoId);
    if (!Number.isFinite(antes) || antes <= 0) return; // sin centro: no hay nada que remapear

    if (p.centroCostoOrigen === "tango") {
      omitidos.push({ projectId, nombre, centroCostoId: antes, motivo: "ya migrado (centroCostoOrigen = tango)" });
      return;
    }
    const fila = porIdViejo.get(antes);
    if (!fila) {
      omitidos.push({ projectId, nombre, centroCostoId: antes, motivo: "su centro de costo no está en el catálogo anterior" });
      return;
    }
    if (fila.idAuxiliarNuevo === null) {
      omitidos.push({ projectId, nombre, centroCostoId: antes, motivo: `el código "${fila.codigo}" no existe en Tango` });
      return;
    }
    if (fila.idAuxiliarNuevo === antes) {
      omitidos.push({ projectId, nombre, centroCostoId: antes, motivo: "ya apunta al id de Tango" });
      return;
    }
    cambios.push({ projectId, nombre, antes, despues: fila.idAuxiliarNuevo, codigo: fila.codigo });
  });

  return { cambios, omitidos };
}
