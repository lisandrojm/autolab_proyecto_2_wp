/**
 * «LIMPIAR BORRADORES» (26/10/2026). Cada documento que el wizard de Dropbox Sign carga y no envía
 * (corrida en seco, campo sin verificar, límite) deja un borrador: eran ~194. Borrar es PERMANENTE, así
 * que va en dos pasos y el segundo exige el primero:
 *
 *  1. REVISAR (en seco): filtra «Estado → Borrador», recorre las páginas y lista los candidatos —título
 *     COMPLETO leído del DOM, exactamente igual al nombre de un archivo del bot (`DropboxSignEnvio`)— y
 *     los salteados con el motivo. No aprieta nada destructivo.
 *  2. LIMPIAR: sólo los títulos de la última revisión (≤ 1 h), con el número confirmado en el panel
 *     igual al de candidatos. El motor verifica fila, menú y modal antes de cada «Eliminar» y corta ante
 *     cualquier diferencia (`limpiarBorradores` en `frontend/tools/envio-dropbox-sign.mjs`).
 *
 * Usa el candado del bot: no corre con una tanda de envío ni con el login asistido abierto. Cada pasada
 * queda en los logs de corridas (`resultado: revision_borradores | limpieza_borradores`).
 */
export interface ResultadoBorradores {
    tipo: "revision" | "limpieza";
    corriendo: boolean;
    arrancadaEl: Date;
    terminadaEl: Date | null;
    total: number | null;
    candidatos: Array<{
        titulo: string;
        archivo: string;
    }>;
    salteados: Array<{
        texto: string;
        motivo: string;
    }>;
    borrados: Array<{
        titulo: string;
        archivo: string;
    }>;
    cortada: string | null;
    error: string | null;
    eventos: Array<{
        at: Date;
        texto: string;
    }>;
}
export declare const estadoBorradores: (tenantId: string) => {
    ultimo: ResultadoBorradores;
    revision: ResultadoBorradores;
    vigenciaMin: number;
};
/** Paso 1: la revisión en seco. */
export declare function revisarBorradoresDelBot(tenantId: string): ResultadoBorradores;
/** Paso 2: borrar los candidatos de la última revisión. `confirmados` tiene que ser su número exacto. */
export declare function limpiarBorradoresDelBot(tenantId: string, confirmados: number): ResultadoBorradores;
/**
 * AL TERMINAR UNA CORRIDA (con la sesión todavía abierta): descarta los borradores que dejaron SUS
 * documentos no enviados, uno por documento. Sólo si una limpieza manual ya funcionó en este tenant
 * (`limpiezaBorradoresVerificadaAt`); si no, se informa y quedan para «Limpiar borradores».
 */
export declare function descartarBorradoresDeLaCorrida(tenantId: string, page: any, motor: any, archivos: string[], onProgreso: (t: string) => void): Promise<void>;
