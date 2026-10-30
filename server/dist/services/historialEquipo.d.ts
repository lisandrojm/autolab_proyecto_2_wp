export interface CambioDelEquipo {
    userId: any;
    campo: "areas" | "rol";
    antes: any;
    despues: any;
}
/** Las filas de `teamConfig` que cambiaron de área/turno entre `antes` y `despues` (por miembro). */
export declare function cambiosDeAreas(antes: any[] | null | undefined, despues: any[] | null | undefined): CambioDelEquipo[];
/** Copia simple de `teamConfig` para comparar después de modificarlo en el lugar. */
export declare const fotoDeAreas: (config: any[] | null | undefined) => {
    userId: string;
    areaShiftAssignments: any;
}[];
export declare function registrarCambiosDelEquipo(p: {
    tenantId?: any;
    projectId: any;
    porUserId?: string;
    origen: string;
    payload?: any;
    cambios: CambioDelEquipo[];
}): Promise<void>;
