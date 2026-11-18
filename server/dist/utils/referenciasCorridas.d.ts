export type CampoDeHuella = "logId" | "alta" | "baja" | "empresaId";
export interface HuellaDeReferencia {
    alta?: string | null;
    baja?: string | null;
    empresaId?: unknown;
    logId?: unknown;
}
export interface Clasificacion {
    tipo: "consistente" | "lapida" | "sin_huella" | "corrida" | "fuera";
    /** Qué se comparó (vacío = nada comparable). */
    evidencia: CampoDeHuella[];
    /** `fuerte`: logId, o alta + empleadora. `debil`: cualquier otra cosa. */
    fuerza: "fuerte" | "debil" | "ninguna";
    /** Por qué no coincide (corrida / fuera). */
    motivo?: string;
    /** Posiciones que coinciden con la huella (corrida / fuera). Sin lápidas. */
    candidatos?: number[];
}
/** La huella que se puede usar en ESTE vínculo: el `logId` sólo si algún contrato lo tiene. */
export declare function huellaUtil(lista: any[], h: HuellaDeReferencia): HuellaDeReferencia;
export declare function fuerzaDe(campos: CampoDeHuella[]): Clasificacion["fuerza"];
/** La huella completa contra un contrato: la de `identidadContrato` más el log. */
export declare function noCoincide(c: any, h: HuellaDeReferencia): string | null;
export declare function clasificarReferencia(lista: any[], ref: {
    indice: number | null | undefined;
    huella: HuellaDeReferencia;
}): Clasificacion;
