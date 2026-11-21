export interface BajaSoloEnMemoria {
    /** «falta escribirla (…)» o «no se escribe: <tipo>». */
    categoria: string;
    descripcion: string;
    contratoKey: string;
}
export declare function bajasSoloEnMemoria(hoy?: string): Promise<BajaSoloEnMemoria[]>;
/** Imprime la sección D agrupada y devuelve cuántas quedan SIN decidir. */
export declare function imprimirSeccionD(lista: BajaSoloEnMemoria[], detalle?: boolean): number;
