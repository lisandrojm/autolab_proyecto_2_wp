/**
 * QUÉ VALORACIÓN LE CORRESPONDE A UN MARGEN.
 *
 * Es la regla que convierte el margen del proyecto —en PORCENTAJE— en un nivel comercial (Plata,
 * Oro…), y de ahí sale qué categorías se le van a ofrecer al armar un contrato.
 *
 * EL MARGEN Y NO EL PRESUPUESTO: un proyecto grande con margen flaco no puede pagar las categorías
 * caras, y uno chico con buen margen sí. El volumen no dice nada sobre lo que se puede pagar.
 *
 * Vive en una función pura y sola porque el día que alguien discuta por qué un proyecto quedó en
 * Plata, la respuesta tiene que estar en un lugar que se pueda leer y testear, no repartida en un
 * handler.
 *
 * ── DÓNDE VIVE Y POR QUÉ ACÁ ──
 *
 * El plan pedía «una sola implementación consumida por server y front». En este repo eso HOY no se
 * puede: no hay workspaces ni paquete compartido, y el server no importa nada del frontend. El
 * precedente real del repo es peor — `utils/permisosMobile.ts` existe DOS veces, una en cada lado,
 * con un comentario que pide mantenerlas iguales a mano.
 *
 * Así que la implementación es UNA y vive del lado del server, que es donde la regla se puede hacer
 * cumplir. El frontend no la duplica: muestra la valoración que el server ya resolvió. El costo es
 * que no hay vista previa mientras se tipea el margen — el nivel se ve al guardar — y es un precio
 * barato al lado de dos copias que se van a desincronizar.
 */
/** Lo mínimo que hace falta de una valoración para resolver. Evita atar esto al documento de Mongoose. */
export interface ValoracionParaResolver {
    _id: unknown;
    orden?: number | null;
    margenDesde?: number | null;
    margenHasta?: number | null;
    esDefault?: boolean;
    activo?: boolean;
}
/**
 * La valoración que corresponde, o `null` si no hay ninguna aplicable.
 *
 * El orden de decisión:
 *
 *   1. Entre las ACTIVAS, ordenadas por `orden`, la primera cuyo rango contenga el margen.
 *   2. Si ninguna lo contiene —o no hay margen cargado—, la marcada como `esDefault`.
 *   3. Si tampoco hay default, `null`: el proyecto queda sin valorar y el filtro de contratación no
 *      se aplica. Inventar una sería peor: recortaría las categorías con un criterio que nadie puso.
 *
 * EL RANGO ES SEMIABIERTO `[desde, hasta)`. Con el tope cerrado habría que decidir de qué lado cae
 * el número exacto, y ese es justamente el redondo que alguien va a cargar: «hasta 20» y «desde 20»
 * conviven, y un margen de 20 % cae en la segunda.
 *
 * `null` en un extremo es ABIERTO (sin mínimo / sin techo), distinto de 0, que es un margen válido:
 * trabajar sin ganancia.
 */
export declare function resolverValoracion<T extends ValoracionParaResolver>(margen: number | null | undefined, valoraciones: T[]): T | null;
