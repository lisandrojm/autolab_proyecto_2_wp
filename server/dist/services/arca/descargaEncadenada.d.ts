import { type TandaPresentada } from "./colaEncadenada.js";
/** «Bajar constancias al presentar»: prendido salvo que el tenant lo haya apagado. */
export declare const bajaAlPresentar: (descargaConstancias: {
    alPresentar?: boolean;
} | null | undefined) => boolean;
/** Encola la descarga de las altas recién presentadas. Nunca tira: si no se puede, las levanta el barrido. */
export declare function encadenarDescarga(t: TandaPresentada): Promise<void>;
/** Lo que espera o se baja ahora, para «A.R.C.A Descargas Automáticas». */
export declare const encadenadasEnFila: (tenantId: string) => import("./colaEncadenada.js").TandaEnFila[];
