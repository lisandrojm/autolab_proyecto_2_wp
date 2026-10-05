declare const router: import("express-serve-static-core").Router;
export interface DocPdfResult {
    buffer: Buffer;
    filename: string;
    empresaIdUsado: string;
}
/**
 * Arma el PDF del Contrato con las variables reemplazadas por los datos de la persona/contrato y de
 * la empresa elegida (contratoEmpresas del proyecto) — la misma lógica que usaba `/download-filled`
 * directo en el handler, ahora reutilizable desde otros routers (p. ej. "Generar" de Firma Digital)
 * sin pasar por un round-trip HTTP.
 */
export declare function generarContratoPdf(opts: {
    tenantId: string;
    templateId: string;
    userId: string;
    projectId: string;
    contractIndex: number;
    empresaId?: string;
    extra?: string;
}): Promise<DocPdfResult>;
export { router as contratoFrameRoutes };
