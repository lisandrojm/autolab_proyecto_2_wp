/** Lo que hace falta de una plantilla para reconocerla. */
export interface PlantillaReconocible {
    name?: string;
    data?: {
        id?: number | string | null;
        nombre?: string;
    } | null;
}
/**
 * Busca la plantilla de contrato (ContratoFrame) que corresponde al contrato.
 *
 * 1. Nombre exacto (la clave confiable: el wizard guarda el nombre exacto de la contratos-frame).
 * 2. ID Externo, solo con ids válidos (> 0). El 0 es un sentinel de "sin id" y matchearía cualquier
 *    contratos-frame con data.id 0 → descargaría un contrato equivocado.
 * 3. Fallback difuso por prefijo con límite de palabra, para nombres importados con un sufijo extra
 *    en cualquiera de los dos lados (p. ej. "Jornada 2030 SRL" → Plantilla "Jornada", o "Eventual
 *    Crew Reelshort" → Plantilla "Eventual Crew Reelshort - STMP - MSLIHB"). Solo matchea si hay UN
 *    candidato, o si todos los candidatos están anidados unos en otros (ahí gana el más específico,
 *    el de nombre más largo). Si hay candidatos genuinamente ambiguos (no anidados entre sí), no
 *    matchea nada: mejor mostrar "Contrato inexistente" que generar el PDF equivocado.
 */
export declare function plantillaDelContrato<T extends PlantillaReconocible>(contract: {
    nombre_contrato?: string | null;
    tipo_contrato_id?: unknown;
}, contratoFrames: T[]): T | null;
