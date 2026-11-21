/**
 * Additive Sync Helpers
 * =====================
 * Utilities for non-destructive synchronisation from FRAME → WeProdu.
 *
 * Core rule: a field is only written when the current WeProdu value is "empty"
 * (undefined | null | "" | [] | {} without own keys) AND the FRAME value is
 * NOT empty.  Existing values are NEVER overwritten.
 *
 * ── Future enhancement (NOT active) ──────────────────────────────────────
 * To propagate *real* changes from FRAME without clobbering WeProdu edits,
 * store a per-record snapshot of the last FRAME payload.  Then a field should
 * only be updated when:
 *   currentValue === lastSnapshot[field]   (user hasn't touched it in WP)
 * This requires a `frameSnapshot` field on each document.  Left as a comment
 * for when the business decides to enable it.
 * ─────────────────────────────────────────────────────────────────────────
 */

// ---------------------------------------------------------------------------
// isEmpty
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the value is considered "empty" for sync purposes:
 * `undefined`, `null`, `""`, an empty array, or a plain object with no own keys.
 */
export function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    Object.keys(value).length === 0
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// getNestedValue / setNestedValue
// ---------------------------------------------------------------------------

/** Safely read a dot-path value from an object (or lean Mongoose doc). */
export function getNestedValue(obj: any, path: string): unknown {
  if (!obj) return undefined;
  const parts = path.split(".");
  let current: any = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    // Mongoose docs may expose toObject(); lean docs are plain objects.
    current = typeof current.toObject === "function"
      ? current.toObject()[part]
      : current[part];
  }
  return current;
}

/** Read dot-path from a plain object (no Mongoose conversion). */
function getPlain(obj: any, path: string): unknown {
  const parts = path.split(".");
  let current: any = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

// ---------------------------------------------------------------------------
// buildAdditiveSet
// ---------------------------------------------------------------------------

/**
 * Build a `$set` object containing only the whitelisted fields whose current
 * value in WeProdu is "empty" and whose FRAME value is not empty.
 *
 * For nested paths (e.g. `metadata.nombre`) the function operates key-by-key
 * so that existing sub-properties remain intact.
 *
 * @param frameData   – The mapped payload coming from FRAME.
 * @param existingDoc – The current Mongoose document (or lean object) in WeProdu.
 *                      Can also be `null`/`undefined` when the doc doesn't exist yet
 *                      (in which case every non-empty FRAME value is included).
 * @param whitelist   – Array of dot-notation paths that FRAME is allowed to fill.
 * @returns A plain object suitable for `{ $set: result }`.  If empty, the
 *          caller should skip the write entirely.
 */
export function buildAdditiveSet(
  frameData: Record<string, any>,
  existingDoc: Record<string, any> | null | undefined,
  whitelist: readonly string[],
): Record<string, any> {
  const set: Record<string, any> = {};

  // Materialise the existing doc to a plain JS object once so we don't keep
  // calling `.toObject()` repeatedly.
  const existing: any =
    existingDoc && typeof (existingDoc as any).toObject === "function"
      ? (existingDoc as any).toObject()
      : existingDoc ?? {};

  for (const path of whitelist) {
    const frameValue = getPlain(frameData, path);
    const currentValue = getPlain(existing, path);

    if (isEmpty(currentValue) && !isEmpty(frameValue)) {
      set[path] = frameValue;
    }
  }

  return set;
}

// ---------------------------------------------------------------------------
// Contract key helpers
// ---------------------------------------------------------------------------

/**
 * Composite key for matching contracts across FRAME and WeProdu.
 *
 * Format: `{proyecto_id}|{empleado_id}|{fecha_alta_contrato}|{tipo_contrato_id}|{categoria_sat_id}`
 *
 * ~1.7 % collision rate is expected in current data.  Collisions are logged as
 * warnings but never block the batch.
 */
export function buildContractKey(contract: Record<string, any>): string {
  return [
    contract.proyecto_id ?? "",
    contract.empleado_id ?? "",
    contract.fecha_alta_contrato ?? "",
    contract.tipo_contrato_id ?? "",
    contract.categoria_sat_id ?? "",
  ].join("|");
}

/*
  ¿CUÁNDO UN CONTRATO DE FRAME «YA ESTÁ» EN WEPRODU? (18/11/2026)

  La clave de arriba es demasiado específica. Medido sobre la base (`scripts/diagDuplicadosAppFrame.ts`):
  372 grupos de contratos duplicados, 267 de ellos porque la copia de FRAME traía OTRA categoría (sobre
  todo un cambio de id del catálogo en FRAME: «1: Director de Programas» ⇄ «43: Director de Programas»),
  y 29 porque la fecha venía en otro formato o el tipo con otro id (`unificarTiposDeContrato` pasó
  los ids locales a uno canónico; FRAME sigue mandando el suyo). Un contrato no deja de ser el mismo
  porque le cambien la categoría.

  Un contrato de FRAME ya está si coincide con uno existente en CUALQUIERA de dos claves:
   1. la de siempre (`buildContractKey`), tal cual: lo que antes se reconocía se sigue reconociendo
      (una lápida, por la `claveFrame` que guardó);
   2. la de IDENTIDAD: proyecto | empleado | alta normalizada | TIPO por nombre: el del catálogo si el
      nombre empieza con uno (prefijo exacto normalizado, el más largo, como `unificarTiposDeContrato`:
      «Servicios - FZERO SRL» es «Servicios»), y si no, el nombre mismo normalizado. Una lápida, por la
      `claveIdentidad` que guardó al anularse.
  NO se usa `tipo_contrato_id` sin la categoría: medido sobre la base, juntaría 117 pares de contratos
  DISTINTOS («Servicios Intercambio» y «Servicios Adicional» del mismo día tienen el mismo id —o
  ninguno— y sólo los separaba la categoría). Agregar la clave 2 sólo puede hacer que se importe MENOS.

  Si coincide pero con OTRA categoría u OTRA fecha de baja, no se crea nada y tampoco se calla: sale
  como DISCREPANCIA (la guarda y la informa el import; NUNCA se aplica). La de baja es la más valiosa:
  una baja que FRAME tiene y WeProdu no es la misma señal que la de ARCA, por otra fuente. Pisar la de WeProdu borraría una edición local; ignorarla en silencio
  dejaría una categoría vieja sin que nadie lo sepa.

  OJO PARA LO QUE VENGA: cualquier script que cambie un campo que participa de estas claves (proyecto,
  empleado, alta, tipo) hace que el import deje de reconocer el contrato y lo duplique.
*/

const normTexto = (s: unknown): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** "YYYY-MM-DD" de una fecha guardada como texto ISO, "DD/MM/YYYY" o Date. */
export function fechaClave(v: unknown): string {
  if (v instanceof Date) return isNaN(+v) ? "" : v.toISOString().slice(0, 10);
  const t = String(v ?? "").trim();
  const dmy = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : t;
}

/** El tipo del catálogo al que corresponde un nombre escrito a mano (prefijo exacto normalizado, el más largo). */
export function tipoCanonico(nombre: unknown, catalogo: string[]): string | null {
  const n = normTexto(nombre);
  if (!n) return null;
  let mejor: string | null = null;
  for (const tipo of catalogo) {
    const t = normTexto(tipo);
    if (t && (n === t || n.startsWith(t + " ")) && (!mejor || t.length > mejor.length)) mejor = t;
  }
  return mejor;
}

/**
 * Proyecto | empleado | alta normalizada | tipo por nombre (el canónico del catálogo, o el nombre
 * normalizado si no matchea ninguno). `null` sin nombre o sin alta: sin eso no hay identidad.
 */
export function claveDeIdentidad(c: Record<string, any>, catalogo: string[]): string | null {
  const tipo = tipoCanonico(c.nombre_contrato, catalogo) || normTexto(c.nombre_contrato);
  const alta = fechaClave(c.fecha_alta_contrato);
  return tipo && alta ? [c.proyecto_id ?? "", c.empleado_id ?? "", alta, tipo].join("|") : null;
}

/** Las claves con que se reconoce un contrato existente (una lápida, por las que guardó al anularse). */
export function clavesDeContratoExistente(c: Record<string, any>, catalogo: string[]): string[] {
  if (c?.estadoContrato === "ANULADO") {
    const legada = String(c?.anulacion?.claveFrame || "");
    const ident = String(c?.anulacion?.claveIdentidad || "");
    return [...(legada ? [`L:${legada}`] : []), ...(ident ? [`I:${ident}`] : [])];
  }
  const ident = claveDeIdentidad(c, catalogo);
  return [`L:${buildContractKey(c)}`, ...(ident ? [`I:${ident}`] : [])];
}

/** Lo mismo para un contrato que llega de FRAME. */
const clavesDeContratoDeFrame = (c: Record<string, any>, catalogo: string[]) => clavesDeContratoExistente({ ...c, estadoContrato: undefined }, catalogo);

// ---------------------------------------------------------------------------
// findNewContracts
// ---------------------------------------------------------------------------

/** Un contrato de FRAME que coincide con uno de WeProdu pero trae otra categoría u otra baja. */
export interface DiscrepanciaDeImport {
  /** Posición del contrato de WeProdu con el que coincidió. */
  indice: number;
  contratoKey: string | null;
  campo: "categoria_sat_id" | "fecha_baja_contrato";
  weprodu: { id: unknown; nombre: string };
  frame: { id: unknown; nombre: string };
  claveFrame: string;
}

export interface FindNewContractsResult {
  /** Contracts from FRAME that do NOT exist yet in WeProdu. */
  newContracts: Record<string, any>[];
  /** Human-readable warnings for contract-key collisions. */
  collisionWarnings: string[];
  /** FRAME trae el contrato con otra categoría u otra baja: no se crea ni se pisa, se informa. */
  discrepancias: DiscrepanciaDeImport[];
}

/**
 * Compare FRAME contracts against existing WeProdu contracts and return only
 * the ones that are genuinely new (see the block above for what «the same» means).
 *
 * - If a FRAME contract matches itself (duplicate in incoming batch), only one copy is pushed.
 * - `catalogo`: los nombres de los tipos de contrato (colección `contratos`). Sin él, sólo las claves 1 y 2.
 */
export function findNewContracts(
  frameContracts: Record<string, any>[],
  existingContracts: Record<string, any>[],
  catalogo: string[] = [],
): FindNewContractsResult {
  const collisionWarnings: string[] = [];
  const discrepancias: DiscrepanciaDeImport[] = [];

  // Cada clave → la posición del contrato existente que la tiene (la primera).
  const existentes = new Map<string, number>();
  const legadas = new Map<string, number>();
  (existingContracts || []).forEach((c, i) => {
    for (const k of clavesDeContratoExistente(c, catalogo)) {
      if (k.startsWith("L:")) legadas.set(k, (legadas.get(k) || 0) + 1);
      if (!existentes.has(k)) existentes.set(k, i);
    }
  });
  for (const [k, count] of legadas) {
    if (count > 1) collisionWarnings.push(`[ADDITIVE SYNC] Contract key collision in existing contracts (count=${count}): ${k.slice(2)}`);
  }

  const newContracts: Record<string, any>[] = [];
  const vistas = new Set<string>();

  for (const fc of frameContracts) {
    const claves = clavesDeContratoDeFrame(fc, catalogo);
    const enUnExistente = claves.find((k) => existentes.has(k));
    if (enUnExistente) {
      // Coincide: ¿trae otra categoría u otra baja? (el tipo y el formato de fecha no son discrepancias).
      const i = existentes.get(enUnExistente)!;
      const ex: any = existingContracts[i];
      if (ex?.estadoContrato !== "ANULADO") {
        const comun = { indice: i, contratoKey: ex?.contratoKey ? String(ex.contratoKey) : null, claveFrame: buildContractKey(fc) };
        if (String(ex?.categoria_sat_id ?? "") !== String(fc.categoria_sat_id ?? "")) {
          discrepancias.push({ ...comun, campo: "categoria_sat_id", weprodu: { id: ex?.categoria_sat_id ?? null, nombre: String(ex?.nombre_categoria_sat || "") }, frame: { id: fc.categoria_sat_id ?? null, nombre: String(fc.nombre_categoria_sat || "") } });
        }
        const [bajaWp, bajaFr] = [fechaClave(ex?.fecha_baja_contrato), fechaClave(fc.fecha_baja_contrato)];
        if (bajaWp !== bajaFr) {
          discrepancias.push({ ...comun, campo: "fecha_baja_contrato", weprodu: { id: bajaWp || null, nombre: bajaWp || "sin baja" }, frame: { id: bajaFr || null, nombre: bajaFr || "sin baja" } });
        }
      }
      continue;
    }
    // Duplicado dentro de lo que manda FRAME: se agrega una sola vez.
    if (claves.some((k) => vistas.has(k))) continue;
    claves.forEach((k) => vistas.add(k));
    newContracts.push(fc);
  }

  return { newContracts, collisionWarnings, discrepancias };
}

/** Lo que manda FRAME para un vínculo nuevo, sin repetidos (con el mismo criterio que `findNewContracts`). */
export function sinRepetidosDeFrame(frameContracts: Record<string, any>[], catalogo: string[] = []): Record<string, any>[] {
  return findNewContracts(frameContracts, [], catalogo).newContracts;
}

// ---------------------------------------------------------------------------
// Whitelists
// ---------------------------------------------------------------------------

/**
 * Fields that FRAME is allowed to fill on a User document.
 * NEVER touch: password, roles, clientIds, projectIds, tenantId,
 *              extraVacationDays, carryOverVacationDays, lastLoginAt,
 *              isSystem, __v.
 */
export const USER_FRAME_WHITELIST: readonly string[] = [
  "email",
  "firstName",
  "lastName",
  "name",
  "hireDate",
  // metadata sub-fields (deep merge, key-by-key)
  "metadata.id",
  "metadata.nombre",
  "metadata.apellido",
  "metadata.generoId",
  "metadata.tipoDocumentoId",
  "metadata.documento",
  "metadata.cuit",
  "metadata.estadoCivil",
  "metadata.calle",
  "metadata.altura",
  "metadata.pisoDepto",
  "metadata.codigoPostal",
  "metadata.localidad",
  "metadata.paisId",
  "metadata.nacionalidadId",
  "metadata.nivelEstudioId",
  // "metadata.osId" NO está, a propósito: la obra social vive en el contrato y se constata contra el
  // padrón de la SSS. Agregarlo acá haría que el próximo import de FRAME reviva el campo que la
  // migración `obra-social:drop-usuario` vació. Ver `services/externalApiService.ts`.
  "metadata.osPrepaga",
  "metadata.fechaNac",
  "metadata.fechaAlta",
  "metadata.telefono",
  "metadata.activo",
  "metadata.tipoEntidadFinanciera",
  "metadata.solicitaCreacionCuenta",
  "metadata.sinBancoMotivo",
  "metadata.sinBancoDetalle",
  "metadata.cuentaBancariaConfirmada",
  "metadata.cuentaBancariaConfirmadaAt",
  "metadata.solicitaCambioCuenta",
  "metadata.cambioCuentaConfirmada",
  "metadata.cambioCuentaConfirmadaAt",
  "metadata.bancoId",
  "metadata.cbu",
  "metadata.tipoDeCuentaBancaria",
  "metadata.nroDeCuentaBancaria",
  "metadata.aliasBancario",
  "metadata.email",
  "metadata.estadoId",
  "metadata.inHouse",
  "metadata.numeroLegajoTango",
  "metadata.afiliadoAlSindicato",
  "metadata.rutaImagen",
  "metadata.bancoReceptor",
  "metadata.swift",
  "metadata.informacionBancariaAdicional",
] as const;

/**
 * Fields that FRAME is allowed to fill on a Project document.
 * NEVER touch: vacationConfig, teamConfig, activityLogConfig, areas,
 *              areasConfig, coordinatorAssignments, turnos, workSchedule,
 *              favorite, objectives, assignedUsers, targetAudience, clientId.
 */
export const PROJECT_FRAME_WHITELIST: readonly string[] = [
  "name",
  "description",
  "status",
  "startDate",
  "endDate",
  "externalId",
  // metadata sub-fields
  "metadata.id",
  "metadata.nombre",
  "metadata.descripcion",
  "metadata.responsableId",
  "metadata.clienteId",
  "metadata.fechaInicio",
  "metadata.fechaFin",
  "metadata.fechaAlta",
  "metadata.sedeId",
  "metadata.activo",
  "metadata.centroCostoId",
] as const;

/**
 * Flat fields that FRAME is allowed to fill on a UserProject document.
 * `contracts` is handled separately via append-only logic.
 * NEVER touch: projectId, userId.
 */
export const USERPROJECT_FRAME_WHITELIST: readonly string[] = [
  "nombre_proyecto",
  "nombre_rol_frame",
] as const;
