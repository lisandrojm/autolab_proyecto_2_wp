import mongoose from "mongoose";
import { FrameRolFrame } from "../utils/roleFrameSync.js";
export declare class ExternalApiService {
    private api;
    private token;
    constructor();
    login(): Promise<void>;
    getEmployees(): Promise<any[]>;
    getEmployeeProjects(employeeId: number): Promise<any[]>;
    /** Lista global de proyectos de FRAME (GET /proyecto). Trae cliente/responsable/fechas. */
    getAllProjects(): Promise<any[]>;
    /**
     * Crea en WeProdu los Project de FRAME que todavía no existen (match por externalId).
     * ADITIVO y seguro: no toca proyectos existentes. Solo crea si el cliente de FRAME mapea a
     * un Client de WeProdu (por Client.externalId) y hay responsable. Colisiones de nombre+cliente
     * (índice único) se saltean vía error 11000. Mismo shape que la creación manual (routes/projects.ts).
     * Devuelve cuántos creó y registra los nombres en `addedProjectsMap` para el reporte.
     */
    private createMissingProjects;
    /**
     * roles_frame asignados directamente al empleado (relación empleado_rol_frame).
     * Es el mismo dato que muestra la web de FRAME en la ficha de la persona,
     * independiente de los contratos/proyectos.
     */
    getEmployeeRolesFrame(employeeId: number): Promise<FrameRolFrame[]>;
    checkImportUsers(sinceDays: number): Promise<{
        count: number;
        employees: Array<{
            name: string;
            email: string;
            fechaAlta?: string;
        }>;
    }>;
    /**
     * Synchronise users (and optionally their projects/contracts) from FRAME
     * into WeProdu.
     *
     * ── ADDITIVE / NON-DESTRUCTIVE MODE ──────────────────────────────────
     * • New records   → INSERT as before.
     * • Existing recs → only fill fields that are currently empty in WeProdu
     *                    (null / undefined / "" / [] / {}).  Fields that already
     *                    have a value are NEVER overwritten.
     * • Contracts     → APPEND-ONLY.  Existing contracts are immutable from
     *                    FRAME's perspective.
     *
     * Matching keys (unchanged):
     *   users         → metadata.id  (FRAME employee id)
     *   projects      → externalId
     *   userProjects  → { externalProjectId, externalEmployeeId }
     *
     * Decision: if FRAME CHANGES a field that WeProdu already has, the change
     * is NOT applied.  A future "snapshot diff" mechanism can be enabled to
     * propagate real FRAME changes selectively — see additiveSync.ts header.
     * ─────────────────────────────────────────────────────────────────────
     */
    importUsers(tenantId: string, executedBy: mongoose.Types.ObjectId | "system", syncProjects?: boolean, sinceDays?: number): Promise<{
        created: number;
        updated: number;
        skipped: number;
        errors: number;
    }>;
}
