import { Types } from "mongoose";
export interface ComplianceParams {
    from: string;
    to: string;
    projectId?: string;
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
    missingDates: string[];
}
export interface CoordinatorCompliance {
    userId: string;
    name: string;
    expectedCount: number;
    submittedCount: number;
    missingCount: number;
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
    status: "complete" | "partial" | "missing" | "none";
    expected: number;
    submitted: number;
    missing: number;
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
