/**
 * LA FILA DE DESCARGAS ENCADENADAS A LAS PRESENTACIONES (11/11/2026). Sin base, sin ARCA: lo que toca
 * el mundo entra por `DepsColaEncadenada`, así se prueba en memoria (`colaEncadenada.test.ts`). El
 * cableado real está en `descargaEncadenada.ts`.
 *
 * POR QUÉ. Las altas se presentan a las 00:05 y las constancias se bajaban en otra corrida, a las
 * 15:00: para entonces la jornada ya terminó y ARCA emite la constancia como «baja». Ahora, apenas una
 * corrida de altas termina, las que ARCA aceptó se encolan acá y se bajan enseguida, con la relación
 * todavía activa. El cron diario queda como barrido de lo que no salió.
 *
 * LAS REGLAS:
 *   · NUNCA DOS CORRIDAS DE ARCA A LA VEZ. La descarga espera a que el candado esté libre (`libre`), y
 *     si otra corrida se lo gana en el medio, vuelve a esperar. Una por vez, en el orden en que llegaron.
 *   · LAS PRESENTACIONES VAN PRIMERO. Mientras haya una fila de presentaciones en marcha (varias
 *     empleadoras, las atrasadas después de las del día), la descarga espera: presentar no se deshace y
 *     tiene hora; bajar sólo lee. Ver `conPresentacionesEnFila`.
 *   · SIN TOPE DIARIO: el lote es la tanda que se acaba de presentar.
 *   · NADA DOS VECES: lo que ya está en la fila no se vuelve a encolar, y al arrancar la descarga se
 *     vuelve a mirar `constancias_arca` (lo que ya tiene constancia no se pide).
 *   · SI NO PUEDE (el candado no se libera, ARCA falla), los ítems quedan como estaban y los levanta el
 *     barrido diario. La encadenada es una mejora, no el único camino.
 */
export interface TandaPresentada {
    tenantId: string;
    tenantObjectId: unknown;
    empresaId: string;
    empresaRazonSocial: string;
    /** Exactamente las altas que ARCA aceptó en esa corrida. */
    items: Array<{
        userProjectId: string;
        contractIndex: number;
    }>;
    /** Cuándo terminó la presentación: «encadenada a la presentación de las HH:MM». */
    terminadaEl: Date;
    /** La corrida de altas (`arca_altas_logs`), si se sabe. */
    logId?: string | null;
    /** La presentó la automática (no una persona). */
    automatica: boolean;
    usuarioId?: string | null;
}
export interface TandaEnFila extends TandaPresentada {
    encoladaEl: Date;
    estado: "en_fila" | "bajando";
}
export type ResultadoEncadenada = 
/** Arrancó y terminó: cuántas se pidieron (cuántas salieron bien lo dice el registro de la corrida). */
{
    resultado: "bajada";
    pedidas: number;
}
/** No había nada que pedir: ya tenían su constancia, o esperan su reintento. */
 | {
    resultado: "nada";
    detalle: string;
}
/** ARCA no se liberó a tiempo: quedan para el barrido. */
 | {
    resultado: "sin_turno";
    detalle: string;
} | {
    resultado: "error";
    detalle: string;
};
export interface DepsColaEncadenada {
    /** El interruptor «Bajar constancias al presentar» del tenant. */
    activa: (tenantId: string) => Promise<boolean>;
    /** Se puede tomar ARCA ahora: nadie tiene el candado y no hay presentaciones en fila. */
    libre: (tenantId: string) => boolean;
    /** Arranca la descarga de esa tanda (toma el candado). Si otra corrida lo tomó justo antes, tira un error que `esOcupado` reconoce. */
    arrancar: (t: TandaPresentada) => Promise<{
        total: number;
    }>;
    esOcupado: (e: unknown) => boolean;
    /** La descarga que arrancó sigue corriendo. */
    corriendo: (tenantId: string) => boolean;
    esperar: (ms: number) => Promise<void>;
    /** Al vaciarse la fila (p. ej. ubicar los documentos recién bajados). */
    alVaciarse?: (tenantId: string) => Promise<void>;
    alTerminar?: (t: TandaPresentada, r: ResultadoEncadenada) => void;
    ahora?: () => number;
    /** Cuánto se espera a que ARCA quede libre, y a que la descarga termine. */
    plazoLibreMs?: number;
    plazoFinMs?: number;
    pasoMs?: number;
}
export declare function crearColaEncadenada(dep: DepsColaEncadenada): {
    /**
     * Encola la descarga de las altas recién presentadas de una tanda y vuelve enseguida. `apagada`: el
     * tenant no baja al presentar (las levanta el barrido). `vacia`: nada nuevo que encolar.
     */
    encolar(t: TandaPresentada): Promise<"encolada" | "apagada" | "vacia">;
    /** Lo que espera o se está bajando ahora, para la pantalla. */
    enFila: (tenantId: string) => TandaEnFila[];
    vacia: (tenantId: string) => boolean;
};
/** Las altas que ARCA aceptó en una corrida por tandas: sólo ésas tienen constancia que bajar. Puro. */
export declare function presentadasDeLaCorrida(resultados: Array<{
    item: {
        userProjectId: string;
        contractIndex: number;
    };
    estado: string;
}>): Array<{
    userProjectId: string;
    contractIndex: number;
}>;
export declare const hayPresentacionesEnFila: (tenantId: string) => boolean;
export declare function conPresentacionesEnFila<T>(tenantId: string, hacer: () => Promise<T>): Promise<T>;
