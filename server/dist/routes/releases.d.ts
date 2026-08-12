declare const router: import("express-serve-static-core").Router;
export interface ReleasePdfResult {
    buffer: Buffer;
    filename: string;
    empresaIdUsado: string;
}
/**
 * Arma el PDF del Release con las variables reemplazadas por los datos de la persona/contrato y de
 * la empresa elegida (releaseEmpresas del proyecto) — misma lógica que usaba `/download-filled`
 * directo en el handler, reutilizable desde otros routers (p. ej. "Generar" de Firma Digital) sin
 * pasar por un round-trip HTTP.
 */
export declare function generarReleasePdf(opts: {
    tenantId: string;
    releaseId: string;
    userId: string;
    projectId: string;
    contractIndex: number;
    empresaId?: string;
}): Promise<ReleasePdfResult>;
export { router as ReleaseRoutes };
