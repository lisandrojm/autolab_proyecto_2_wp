/**
 * Aplicar lo que ARCA devolvió para una tanda de CUIL. La regla del trámite, en un solo lugar.
 *
 * Vive acá y no adentro de una ruta porque ahora tiene DOS entradas: el panel de pegado (una persona
 * mira la previsualización y confirma) y el script que opera ARCA por CDP y escribe por API. Las dos
 * tienen que aplicar exactamente el mismo criterio — qué se acepta, qué se rechaza y qué no se pisa —
 * y la forma de garantizarlo es que sea el mismo código, no dos que se parezcan. Duplicarlo era
 * garantizar que divergieran: el día que una valide algo que la otra no, el dato queda mal en la base
 * y nadie se entera hasta la rectificativa.
 *
 * QUÉ VALIDA, en este orden:
 *
 *   1. una sola empleadora por lote — "está registrada ante ARCA" es una regla por CUIT;
 *   2. el mismo CUIL no puede venir con dos RNOS distintos (dos corridas encimadas);
 *   3. el RNOS existe en el catálogo de Obras Sociales;
 *   4. la empleadora lo tiene registrado ante el organismo;
 *   5. el contrato no está ya constatado (ver `forzar`).
 *
 * Las filas que no pasan NO frenan a las demás: se informan y se sigue. Cortar la tanda entera por
 * una fila obliga a rehacer una consulta a ARCA que ya se hizo.
 *
 * ES IDEMPOTENTE. Lo ya constatado en ARCA queda bloqueado y no se pisa, así que correr el mismo lote
 * dos veces no cambia nada la segunda: la primera aplica, la segunda devuelve todo en `yaBloqueados`.
 */
export interface FilaLoteOS {
    cuil?: string;
    rnos?: string;
}
export interface OpcionesLoteOS {
    tenantObjectId: unknown;
    empresaId: string;
    filas: FilaLoteOS[];
    /** Calcula exactamente lo mismo y NO escribe. Es la previsualización del panel y el `--dry-run`. */
    previsualizar?: boolean;
    /**
     * Pisar lo ya constatado. Apagado por defecto y a propósito: lo que ARCA selló no se cambia por una
     * corrida repetida, solo por una decisión explícita de alguien.
     */
    forzar?: boolean;
    /** Por dónde entró: queda guardado en cada contrato para poder reconstruir después qué pasó. */
    origen?: "panel" | "script";
    usuarioId?: unknown;
}
export interface ResultadoLoteOS {
    aplicados: number;
    contratosAlcanzados: number;
    sinContrato: string[];
    rnosDesconocido: Array<{
        cuil: string;
        rnos: string;
    }>;
    noRegistrada: Array<{
        cuil: string;
        rnos: string;
        nombre: string;
    }>;
    yaBloqueados: string[];
    noFigura: number;
    previsualizacion: boolean;
}
/** Error de entrada: el lote no se aplica y hay que decir por qué. */
export declare class LoteObrasSocialesError extends Error {
    status: number;
    constructor(message: string, status?: number);
}
/**
 * ¿Este contrato ya tiene la obra social sellada por ARCA?
 *
 * ES LA REGLA DE IDEMPOTENCIA, y está acá afuera por dos motivos: la usan los dos caminos —aplicar y
 * listar pendientes— y tienen que coincidir exactamente. Si "pendiente" y "no se pisa" no fueran la
 * misma condición, el script pediría gente que después el POST rechaza, o peor: pisaría algo que la
 * grilla ya daba por resuelto.
 *
 * `obraSocialNoFigura` cuenta como constatada a propósito: "ARCA no tiene ninguna" es una RESPUESTA
 * —rige la del convenio— y volver a preguntarla es trabajo repetido, no un pendiente.
 */
export declare function yaConstatadaEnArca(contrato: any): boolean;
/**
 * Qué hacer con el RNOS que devolvió ARCA para una persona.
 *
 * La red que antes vivía en el navegador —la previsualización del panel— y que al escribir por API se
 * saltearía. Reponerla acá la vuelve inevitable: los dos caminos pasan por esta función.
 *
 *  - `''`               ARCA no devolvió ninguna. Es válido: se registra y rige la del convenio.
 *  - fuera del catálogo el código no existe entre las obras sociales conocidas. Se rechaza.
 *  - no registrada      existe, pero la empleadora no la tiene declarada ante ARCA: el organismo
 *                       rechazaría el alta. Se rechaza acá y no allá.
 */
export type ClasificacionRnos = {
    estado: "sin_obra_social";
} | {
    estado: "ok";
    os: any;
} | {
    estado: "rnos_desconocido";
} | {
    estado: "no_registrada";
    os: any;
};
export declare function clasificarRnos(rnos: string, porRnos: Map<string, any>, registradas: Set<string>): ClasificacionRnos;
export declare function aplicarLoteObrasSociales(opts: OpcionesLoteOS): Promise<ResultadoLoteOS>;
/**
 * Los CUIL que le faltan constatar a una empleadora.
 *
 * Mismo criterio que la grilla usa para su "N sin validar": el contrato es de esa empleadora, la
 * persona tiene un CUIL de 11 dígitos, y la obra social todavía no quedó sellada por ARCA. Se calcula
 * del lado del server para que el script no tenga que replicar la regla — replicarla es cómo se
 * termina validando gente que ya estaba, o salteando gente que faltaba.
 */
export declare function pendientesObraSocial(tenantObjectId: unknown, empresaId: string): Promise<Array<{
    contratoId: string;
    cuil: string;
    nombre: string;
}>>;
