/**
 * Resolución de la empresa de membrete para PDF de Pedidos/Vacaciones.
 *
 * Estos PDF no están atados a un proyecto: la empresa se toma del ÚLTIMO CONTRATO ACTIVO del
 * usuario (ese contrato pertenece a un proyecto). Prioridad:
 *   1) empresaId explícito (si se elige al descargar y pertenece al proyecto del contrato)
 *   2) la empresa guardada en el contrato (empresaContratoId)
 *   3) la primera empresa del proyecto (contratoEmpresas)
 * Si el contrato no tiene empresa y el proyecto tiene varias, el front pregunta cuál usar.
 */
export interface EmpresaOption {
    id: string;
    label: string;
}
export interface ContractEmpresaResolution {
    /** Company elegida para el membrete (o null si no se pudo resolver). */
    empresa: any | null;
    /** empresaContratoId guardado en el contrato (si tiene). */
    contractEmpresaId: string;
    /** Empresas del proyecto (contratoEmpresas) con su razón social. */
    projectEmpresas: EmpresaOption[];
    /** Proyecto del último contrato activo. */
    projectId: string;
}
/**
 * Encuentra el último contrato activo del usuario (más reciente por fecha de alta; si ninguno
 * está vigente, toma el último contrato existente) y resuelve la empresa de membrete.
 */
export declare function resolveContractEmpresa(userId: string, empresaIdOverride?: string): Promise<ContractEmpresaResolution>;
