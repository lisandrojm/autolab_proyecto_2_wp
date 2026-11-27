/**
 * ═══════════════════════════════════════════════════════════════════════
 * LA CONSULTA AL PADRÓN DE ARCA DE LOS CONTRATOS DE CONSTANCIA DE CUIT (Trámite impositivo › Constancia de CUIT)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Un solo click consulta el CUIT de cada contrato (deduplicado por persona), guarda el resultado en el
 * contrato, archiva el JSON en la carpeta «Constancia de cuit» de Dropbox cuando ARCA dice «activo»
 * —es lo que da por terminado el trámite— y pasa el contrato al estado siguiente («Envío de
 * documentación») en el momento, sin esperar al escaneo de carpetas.
 *
 * Vivía adentro de `routes/afip.ts` (POST /afip/consulta-padron/bulk). Pasó a servicio el 27/11/2026
 * para que la VALIDACIÓN AUTOMÁTICA (`services/automatizacionesContratacion`) haga exactamente lo mismo
 * que el botón «Validar Masivo»: la ruta valida el pedido y llama acá; el reloj llama acá directo.
 */
import { Types } from "mongoose";
export interface TargetPadron {
    projectId: string;
    userId: string;
    contractIndex: number;
}
/** Un error que es de la configuración o del pedido, no del server: la ruta lo devuelve con su status. */
export declare class ErrorConsultaPadron extends Error {
    status: number;
    constructor(status: number, mensaje: string);
}
export interface ResultadoPorCuit {
    cuit: string;
    estado?: string;
    encontrado?: boolean;
    denominacion?: string;
    error?: string;
    contratosActualizados: number;
    dropboxSubido?: boolean;
    dropboxError?: string;
    cuitRepresentada?: string;
    ambiente?: string;
    raw?: any;
    faultCode?: string;
    faultString?: string;
    /** Presente SOLO si el nombre guardado no coincidía con el de ARCA y se reemplazó. */
    renombrado?: {
        antes: string;
        ahora: string;
    };
    /** El estado al que pasó el contrato al quedar archivada la constancia («Envío de documentación»). */
    estadoNuevo?: string;
    /** El contrato no fue a Generar Documentos sino a Contratos, porque su tipo no manda nada a firmar. */
    directoAContratos?: boolean;
    /** El contrato ya estaba más adelante en el circuito (validado desde Contratos): su estado no cambia. */
    estadoSinCambio?: boolean;
}
export interface ResultadoConsultaPadronBulk {
    resultados: ResultadoPorCuit[];
    consultados: number;
    sinCuit: number;
    contratosActualizados: number;
    avanzados: number;
}
/** La carpeta «Constancia de cuit» de Dropbox (misma resolución que la ruta: por propósito). */
export declare function resolverCarpetaConstanciaCuit(): Promise<string | null>;
export declare function consultarPadronDeContratos(tenantObjectId: Types.ObjectId, targets: TargetPadron[]): Promise<ResultadoConsultaPadronBulk>;
/**
 * Para un contrato que YA tiene el CUIT validado y la constancia archivada pero sigue en Constancia de
 * CUIT (validado antes de que el archivado avanzara el estado, o el escaneo todavía no pasó): lo pasa al
 * estado siguiente ahora. No consulta a ARCA ni vuelve a subir nada.
 */
export declare function avanzarConstanciasArchivadas(tenantObjectId: Types.ObjectId, targets: TargetPadron[]): Promise<{
    resultados: Array<TargetPadron & {
        ok: boolean;
        aplicada?: boolean;
        estado?: string;
        motivo?: string;
    }>;
    avanzados: number;
}>;
