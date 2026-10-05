import { Types } from "mongoose";
export interface ComplianceParams {
    from: string;
    to: string;
    projectId?: string;
    /** Acota a estos proyectos (los que supervisa quien pregunta). `projectId`, si viene, gana. */
    projectIds?: string[];
    coordinatorId?: string;
    areaId?: string;
    shiftId?: string;
}
/**
 * Cumplimiento de un coordinador en UN proyecto. Nota de modelado: las novedades reales
 * se cargan **una por (coordinador, proyecto, día)** (el `areaId`/`shiftId` del registro
 * suele venir NULL y cubre todos los turnos que coordina ese día). Por eso el cumplimiento
 * se calcula por día de proyecto, no por (área, turno). `areas`/`turnos` son informativos.
 */
export interface ProjectCompliance {
    projectId: string;
    projectName: string;
    areas: string[];
    turnos: string[];
    /** Turnos con sus días (0=Dom..6=Sáb) para saber cuáles corren en cada fecha faltante. */
    turnosInfo: {
        name: string;
        days: number[];
    }[];
    expectedDates: string[];
    submittedDates: string[];
    /** Todas las esperadas sin enviar (incluye las que todavía se pueden cargar). */
    missingDates: string[];
    /** Subconjunto de missingDates que AÚN se puede cargar (dentro de "Días Permitidos"). */
    pendingDates: string[];
    /** Nº de novedad (reportNumber) por fecha enviada, ej. { "2026-07-01": "DEM-REG-000353" }. */
    reportsByDate: Record<string, string>;
}
export interface CoordinatorCompliance {
    userId: string;
    name: string;
    expectedCount: number;
    submittedCount: number;
    /** Todas las faltantes (pendientes + vencidas). */
    missingCount: number;
    /** Faltantes que todavía puede cargar (a tiempo). */
    pendingCount: number;
    /** Faltantes cuyo plazo ya venció → es lo que lo marca como atrasado (rojo). */
    expiredCount: number;
    missingDates: string[];
    projects: ProjectCompliance[];
}
export interface MissingCell {
    userId: string;
    name: string;
    projectId: string;
    projectName: string;
    /** Áreas/turnos que coordina (informativo), ej. "Técnica · Mañana, Tarde". */
    label: string;
}
export interface CalendarDayCompliance {
    date: string;
    /** "pending" = falta pero todavía se puede cargar (azul); "missing" = vencida (rojo). */
    status: "complete" | "partial" | "pending" | "missing" | "none";
    expected: number;
    submitted: number;
    missing: number;
    /** Cuántas de las faltantes todavía se pueden cargar. */
    pending: number;
    missingCells: MissingCell[];
}
export interface ComplianceResponse {
    from: string;
    to: string;
    generatedAt: string;
    totals: {
        expected: number;
        submitted: number;
        missing: number;
        compliancePct: number;
        coordinatorsBehind: number;
    };
    coordinators: CoordinatorCompliance[];
    calendar: CalendarDayCompliance[];
}
export declare function computeCompliance(tenantId: Types.ObjectId, params: ComplianceParams): Promise<ComplianceResponse>;
