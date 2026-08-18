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

// ---------------------------------------------------------------------------
// findNewContracts
// ---------------------------------------------------------------------------

export interface FindNewContractsResult {
  /** Contracts from FRAME that do NOT exist yet in WeProdu. */
  newContracts: Record<string, any>[];
  /** Human-readable warnings for contract-key collisions. */
  collisionWarnings: string[];
}

/**
 * Compare FRAME contracts against existing WeProdu contracts and return only
 * the ones that are genuinely new (append-only).
 *
 * Rules:
 * - A contract is "new" when its composite key doesn't appear in `existingContracts`.
 * - If a key appears more than once in `existingContracts` (collision), we log a
 *   warning and treat the whole set as already present (prefer not touching).
 * - If a FRAME contract's key collides with itself (duplicate in incoming batch),
 *   we still only push one copy.
 */
export function findNewContracts(
  frameContracts: Record<string, any>[],
  existingContracts: Record<string, any>[],
): FindNewContractsResult {
  const collisionWarnings: string[] = [];

  // Index existing contracts by key, tracking counts for collision detection.
  const existingKeyCount = new Map<string, number>();
  for (const c of existingContracts) {
    const key = buildContractKey(c);
    existingKeyCount.set(key, (existingKeyCount.get(key) || 0) + 1);
  }

  // Report collisions (same key appears >1 time in existing).
  for (const [key, count] of existingKeyCount.entries()) {
    if (count > 1) {
      collisionWarnings.push(
        `[ADDITIVE SYNC] Contract key collision in existing contracts (count=${count}): ${key}`,
      );
    }
  }

  // Determine which FRAME contracts are new (key not present in existing).
  // Use a Set to avoid pushing duplicates when FRAME itself has repeated keys.
  const newContracts: Record<string, any>[] = [];
  const seenFrameKeys = new Set<string>();

  for (const fc of frameContracts) {
    const key = buildContractKey(fc);

    // Already present in WeProdu → skip entirely (never modify).
    if (existingKeyCount.has(key)) continue;

    // Duplicate within the FRAME batch itself → skip the second copy.
    if (seenFrameKeys.has(key)) continue;
    seenFrameKeys.add(key);

    newContracts.push(fc);
  }

  return { newContracts, collisionWarnings };
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
  "metadata.telefono2",
  "metadata.visa",
  "metadata.activo",
  "metadata.tipoEntidadFinanciera",
  "metadata.solicitaCreacionCuenta",
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
