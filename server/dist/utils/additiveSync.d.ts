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
/**
 * Returns `true` when the value is considered "empty" for sync purposes:
 * `undefined`, `null`, `""`, an empty array, or a plain object with no own keys.
 */
export declare function isEmpty(value: unknown): boolean;
/** Safely read a dot-path value from an object (or lean Mongoose doc). */
export declare function getNestedValue(obj: any, path: string): unknown;
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
export declare function buildAdditiveSet(frameData: Record<string, any>, existingDoc: Record<string, any> | null | undefined, whitelist: readonly string[]): Record<string, any>;
/**
 * Composite key for matching contracts across FRAME and WeProdu.
 *
 * Format: `{proyecto_id}|{empleado_id}|{fecha_alta_contrato}|{tipo_contrato_id}|{categoria_sat_id}`
 *
 * ~1.7 % collision rate is expected in current data.  Collisions are logged as
 * warnings but never block the batch.
 */
export declare function buildContractKey(contract: Record<string, any>): string;
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
export declare function findNewContracts(frameContracts: Record<string, any>[], existingContracts: Record<string, any>[]): FindNewContractsResult;
/**
 * Fields that FRAME is allowed to fill on a User document.
 * NEVER touch: password, roles, clientIds, projectIds, tenantId,
 *              extraVacationDays, carryOverVacationDays, lastLoginAt,
 *              isSystem, __v.
 */
export declare const USER_FRAME_WHITELIST: readonly string[];
/**
 * Fields that FRAME is allowed to fill on a Project document.
 * NEVER touch: vacationConfig, teamConfig, activityLogConfig, areas,
 *              areasConfig, coordinatorAssignments, turnos, workSchedule,
 *              favorite, objectives, assignedUsers, targetAudience, clientId.
 */
export declare const PROJECT_FRAME_WHITELIST: readonly string[];
/**
 * Flat fields that FRAME is allowed to fill on a UserProject document.
 * `contracts` is handled separately via append-only logic.
 * NEVER touch: projectId, userId.
 */
export declare const USERPROJECT_FRAME_WHITELIST: readonly string[];
