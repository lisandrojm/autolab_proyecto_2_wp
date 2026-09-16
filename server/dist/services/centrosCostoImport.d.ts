export interface ItemCentroCosto {
    idAuxiliar: number;
    codAuxiliar: string;
    descAuxiliar: string;
    habilitado: "S" | "N";
}
export type ModoImport = "reemplazar" | "actualizar";
export interface PayloadImport {
    tipo?: string;
    modo?: string;
    total?: number;
    items?: unknown;
    /** Si además hay que corregir a qué centro apuntan los proyectos. Sólo tiene sentido al reemplazar. */
    remapearProyectos?: boolean;
}
export interface ResultadoValidacion {
    ok: boolean;
    modo: ModoImport;
    items: ItemCentroCosto[];
    /** Un error por problema, con el índice del ítem (base 0) para poder encontrarlo en el archivo. */
    errores: string[];
}
/**
 * Valida el archivo entero: los cuatro campos de cada ítem, sus tipos, y que no haya `idAuxiliar` ni
 * `codAuxiliar` repetidos. Devuelve los ítems ya normalizados (trim) cuando no hay errores.
 *
 * Los duplicados se informan con los DOS índices —«ya está en el ítem 12»—: con uno solo hay que
 * recorrer el archivo a mano para encontrar al otro.
 */
export declare function validarPayload(payload: PayloadImport): ResultadoValidacion;
/** Un centro del catálogo ANTERIOR, como se necesita para remapear: su id y su código. */
export interface CentroViejo {
    idViejo: number;
    codigo: string;
}
export interface FilaRemapeo {
    idViejo: number;
    codigo: string;
    idAuxiliarNuevo: number | null;
}
/**
 * La tabla `idViejo → codigo → idAuxiliarNuevo`, cruzando por código.
 *
 * Se deriva del catálogo que está en la base en vez de leerse de un archivo fijo: el archivo se
 * escribió mirando una foto de la base, y si alguien dio de alta o corrigió un centro después, la foto
 * miente justo en el único momento en que se usa. Los códigos se comparan sin distinguir mayúsculas ni
 * espacios («SinAsignar» / «sinasignar»), que es la clase de diferencia que tiene un catálogo cargado
 * a mano contra uno exportado.
 *
 * `idAuxiliarNuevo: null` = ese centro no existe en Tango. No se remapea y se informa: adivinarle un
 * centro a un proyecto es peor que dejarlo como está y que alguien lo resuelva.
 */
export declare function construirRemapeo(viejos: CentroViejo[], items: ItemCentroCosto[]): FilaRemapeo[];
/** Un proyecto, con lo mínimo para decidir si hay que tocarlo. */
export interface ProyectoARemapear {
    _id: unknown;
    nombre?: string;
    centroCostoId?: number | null;
    /** Marca de que este proyecto ya se migró: ver `decidirRemapeo`. */
    centroCostoOrigen?: string | null;
}
export interface CambioProyecto {
    projectId: string;
    nombre: string;
    antes: number;
    despues: number;
    codigo: string;
}
export interface DecisionRemapeo {
    cambios: CambioProyecto[];
    /** Los que se dejan como están, con el motivo. */
    omitidos: Array<{
        projectId: string;
        nombre: string;
        centroCostoId: number;
        motivo: string;
    }>;
}
/**
 * QUÉ PROYECTOS SE TOCAN Y A QUÉ VALOR.
 *
 * LA IDEMPOTENCIA ES LO CRÍTICO ACÁ, y no es un detalle teórico: los ids viejos 1–46 también son
 * `idAuxiliar` válidos del catálogo nuevo. Correr la migración dos veces sobre el mismo proyecto lo
 * remaparía de nuevo —del 863 al que le toque— y lo dejaría en un centro que nadie eligió, sin forma
 * de darse cuenta. Por eso el proyecto ya migrado queda marcado (`metadata.centroCostoOrigen` =
 * "frame") y acá se lo saltea por esa marca, no por el valor.
 *
 * Tampoco se toca:
 *   · `centroCostoId` 0, null o vacío: «sin centro» no es un centro que haya que traducir.
 *   · el que no tiene equivalente en Tango (`idAuxiliarNuevo: null`): se informa para que se resuelva.
 *   · el que ya apunta al valor nuevo: no hay nada que escribir.
 */
export declare function decidirRemapeo(proyectos: ProyectoARemapear[], remapeo: FilaRemapeo[]): DecisionRemapeo;
