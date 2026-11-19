export interface ContextoAuditoria {
    origen: "app" | "script" | "sistema";
    por?: {
        userId?: string;
        email?: string;
    };
    /** La ruta («POST /api/projects/…/assign-member»), el script o el cron. */
    detalle?: string;
    /** El motivo declarado del cambio, si lo hay (scripts, anulaciones). */
    motivo?: string;
}
export declare const contextoActual: () => ContextoAuditoria | null;
/** Corre `fn` con este contexto (lo que no se diga se hereda del actual). */
export declare function enContexto<T>(ctx: Partial<ContextoAuditoria>, fn: () => T): T;
/** Para un script: todo lo que siga en este flujo queda a su nombre. */
export declare function contextoDeScript(nombre: string, extra?: {
    motivo?: string;
    por?: {
        userId?: string;
        email?: string;
    };
}): void;
