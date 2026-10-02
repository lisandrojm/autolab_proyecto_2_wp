import { FilaPuesto } from "../../compartido/puestosDesempenados.js";
/**
 * EL CATÁLOGO DE PUESTOS DESEMPEÑADOS: de dónde se importa y quién lo usa.
 *
 * La tabla oficial es la de la lupa «Puesto Desemp.» de Registrar Nuevas Altas (`window.l_PD`). No
 * hay endpoint de ARCA: se toma del ESPEJO (`arca_catalogo`, tabla PUESTO_DESEMPENADO), que llenan
 * la semilla del CSV del repo y «Leer de ARCA» (Configuración → ARCA → Catálogo de ARCA). Además se
 * puede subir el archivo de la tabla.
 */
/** Dónde se usa un código. `null` = en ningún lado: se puede borrar. */
export declare function usosDelPuesto(codigo: string): Promise<string | null>;
/** ¿El código existe y está activo en el catálogo? Lo usan los ABM que lo asignan. */
export declare function puestoActivo(codigo: string): Promise<boolean>;
/** Aplica la importación (upsert por código) y devuelve el resumen. */
export declare function importarPuestos(filas: FilaPuesto[]): Promise<{
    nuevos: number;
    actualizados: number;
    sinCambios: number;
    manualesRespetados: number;
    descartadas: number;
    detalle: {
        nuevos: FilaPuesto[];
        actualizados: (FilaPuesto & {
            descripcionAnterior: string;
        })[];
        manualesRespetados: (FilaPuesto & {
            descripcionManual: string;
        })[];
    };
}>;
/** La tabla oficial desde el espejo de ARCA (solo vigentes). */
export declare function filasDesdeEspejo(): Promise<FilaPuesto[]>;
/**
 * Un archivo de la tabla: el CSV oficial (con su encabezado `tabla,…`, se toman las filas
 * PUESTO_DESEMPENADO) o una planilla (Excel/CSV) con una columna de código y otra de descripción.
 */
export declare function filasDesdeArchivo(buffer: Buffer, nombre: string): FilaPuesto[];
