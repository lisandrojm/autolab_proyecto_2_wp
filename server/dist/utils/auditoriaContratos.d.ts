/**
 * AUDITORÍA DE CONTRATOS, LA PARTE PURA (etapa 3, 19/11/2026): qué cambió entre dos versiones de
 * `contracts[]` y qué campos toca un update. Sin base de datos, para poder probarlo.
 *
 * Todo se compara POR `contratoKey`, nunca por posición (decisión del usuario, 18/11): un contrato que
 * cambia de lugar no «cambia», y uno que desaparece de su lugar se ve como quitado aunque otro ocupe la
 * posición. Los que no tienen clave (no debería quedar ninguno después del backfill) se aparean por
 * posición y quedan marcados así.
 */
export type TipoEvento = "creado" | "modificado" | "anulado" | "quitado";
export interface CambioDeCampo {
    campo: string;
    antes: unknown;
    despues: unknown;
}
export interface EventoContrato {
    contratoKey: string | null;
    posicion: number;
    tipo: TipoEvento;
    cambios: CambioDeCampo[];
    resumen: {
        nombre_contrato?: string;
        fecha_alta_contrato?: string;
        fecha_baja_contrato?: string;
    };
    motivo?: string;
    nota?: string;
}
/** Valor comparable y guardable: fechas a ISO, ObjectId a texto, vacíos (null, undefined, "", []) a null. */
export declare function normalizar(v: any): unknown;
export declare const resumenDe: (c: any) => {
    nombre_contrato: any;
    fecha_alta_contrato: string;
    fecha_baja_contrato: string;
};
/**
 * Los cambios campo por campo entre dos versiones del mismo contrato. Con `campos`, sólo esos (cuando
 * se leyó una proyección: lo que no se leyó no se puede comparar).
 */
export declare function cambiosEntre(antes: any, despues: any, campos?: string[]): CambioDeCampo[];
/**
 * Los eventos entre dos versiones de `contracts[]`. `antes` null = no se sabe cómo estaba (se avisa en
 * `nota`); `despues` null = el vínculo se borró (todo quitado).
 */
export declare function diferenciasDeContratos(antes: any[] | null | undefined, despues: any[] | null | undefined, opciones?: {
    campos?: string[];
    motivoQuitado?: string;
}): EventoContrato[];
export interface CamposTocados {
    /** El update toca `contracts`. */
    toca: boolean;
    /** Reemplaza contratos enteros (o el array): hay que leer todo para comparar. */
    todo: boolean;
    /** Si no es todo: los campos de primer nivel del contrato que toca. */
    campos: string[];
}
/** Qué toca de `contracts` un update de Mongo (operadores, reemplazo o pipeline). */
export declare function camposTocados(update: any, esReemplazo?: boolean): CamposTocados;
/** Lo que hay que leer para comparar: siempre la clave, el estado y el resumen; además lo tocado. */
export declare function proyeccionPara(t: CamposTocados): Record<string, 1>;
