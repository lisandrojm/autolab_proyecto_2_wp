/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL BANCO DE DÍAS: cuentas, saldos y movimientos
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tres routers con tres nombres distintos porque son tres cosas distintas: la DEFINICIÓN de las
 * cuentas, el SALDO (que se calcula) y los MOVIMIENTOS (que son el registro de lo que pasó).
 *
 * Ninguno lee ni escribe un campo «saldo»: el saldo sale de sumar el ledger. Ver `models/LeaveLedger.ts`.
 */
export declare const leaveAccountsRouter: import("express-serve-static-core").Router;
export declare const leaveBalancesRouter: import("express-serve-static-core").Router;
export declare const leaveLedgerRouter: import("express-serve-static-core").Router;
