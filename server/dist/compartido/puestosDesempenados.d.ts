/**
 * ═══════════════════════════════════════════════════════════════════════
 * CÓDIGO COMPARTIDO SERVER ↔ FRONTEND (`server/src/compartido/`)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Solo código puro: nada de Node, Mongoose ni del DOM, y sin imports (ver `jornadas.ts`).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PUESTO DESEMPEÑADO: de dónde sale y cómo se importa la tabla
 * ═══════════════════════════════════════════════════════════════════════
 *
 * El registro de 85 de Altas Masivas (pos. 29-32) exige el código de puesto desempeñado de ARCA
 * (4 dígitos). La Carga Masiva no lo usa.
 */
/** Código canónico: solo dígitos, 4 posiciones con ceros a la izquierda. "" si no hay. */
export declare const codigoPuesto: (v: unknown) => string;
export type OrigenPuesto = "funcion" | "categoria" | "convenio" | "empresa" | "global" | "ninguno";
/**
 * EL PUESTO DE UN CONTRATO, en este orden:
 *
 *   Rol Empresa del contrato → Categoría → CONVENIO de la categoría → default de la empleadora →
 *   default de la instalación
 *
 * La función va primero porque ES el puesto («Asistente de Cámara»); la categoría es el encuadre del
 * convenio y varias funciones distintas comparten la misma.
 *
 * EL CONVENIO VA ANTES QUE LA EMPLEADORA, por lo mismo que la obra social (`Convenio.obraSocialDefaultId`):
 * el puesto típico lo define el convenio —quien trabaja bajo el de televisión es personal de apoyo a
 * la producción, lo contrate la productora que lo contrate—, y el default de la empleadora queda para
 * lo que el convenio no decide (el 9999/99 «excluido de convenio», o un convenio sin default). Entra
 * SOLO cuando rol y categoría están vacíos: lo que ya resolvían esos dos no cambia.
 *
 * Lo usan el generador del registro (frontend) y el cotejo del lote (servidor): si cada uno
 * resolviera por su cuenta, podrían discrepar. Por eso es UNA función, y los dos le pasan los cinco.
 */
export declare function resolverPuesto(o: {
    rol?: unknown;
    categoria?: unknown;
    convenio?: unknown;
    empresa?: unknown;
    global?: unknown;
}): {
    codigo: string;
    origen: OrigenPuesto;
};
export interface PuestoExistente {
    codigo: string;
    descripcion: string;
    origen?: "arca" | "manual";
}
export interface FilaPuesto {
    codigo: string;
    descripcion: string;
}
export interface PlanImportacionPuestos {
    nuevos: FilaPuesto[];
    actualizados: Array<FilaPuesto & {
        descripcionAnterior: string;
    }>;
    sinCambios: string[];
    /** Códigos que la tabla trae pero que se cargaron a mano: no se pisan. */
    manualesRespetados: Array<FilaPuesto & {
        descripcionManual: string;
    }>;
    /** Filas descartadas (sin código o sin descripción) y repetidas. */
    descartadas: number;
}
/**
 * Qué hace una importación de la tabla oficial, sin escribir nada: upsert por código.
 *
 *   · código nuevo                         → se crea (origen ARCA, activo)
 *   · de ARCA con otra descripción         → se actualiza la descripción
 *   · de ARCA igual                        → sin cambios
 *   · creado A MANO                        → no se pisa (se informa)
 *   · existe y la tabla no lo trae         → no se toca (ni se borra ni se desactiva)
 *
 * Las asignaciones (rol, categoría, defaults) guardan el CÓDIGO: reimportar nunca las rompe.
 */
export declare function planDeImportacionPuestos(existentes: PuestoExistente[], filas: FilaPuesto[]): PlanImportacionPuestos;
