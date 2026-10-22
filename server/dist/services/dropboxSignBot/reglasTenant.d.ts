import { type ReglaColocacion } from "../../compartido/reglasColocacionFirma.js";
export interface ReglasDelTenant {
    reglas: ReglaColocacion[];
    /** Hay una copia editada guardada (si no, rige el catálogo de fábrica). */
    personalizadas: boolean;
    actualizadasAt: Date | null;
}
export declare function reglasDelTenant(tenantId: string): Promise<ReglasDelTenant>;
/** Guarda la lista entera (validada). Con `null` se vuelve al catálogo de fábrica. */
export declare function guardarReglasDelTenant(tenantId: string, entrada: unknown | null): Promise<ReglasDelTenant>;
