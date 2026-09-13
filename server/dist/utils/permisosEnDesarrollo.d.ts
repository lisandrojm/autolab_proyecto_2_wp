/** La lista actual. Sin documento todavía, ninguno está en desarrollo. */
export declare function permisosEnDesarrollo(): Promise<string[]>;
/** Reemplaza la lista entera y devuelve la que quedó guardada. */
export declare function guardarPermisosEnDesarrollo(permisos: string[]): Promise<string[]>;
