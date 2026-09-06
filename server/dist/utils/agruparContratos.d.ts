/** Un contrato señalado desde el cliente, por proyecto + persona + contrato. */
export interface ContratoPedido {
    projectId: string;
    userId: string;
    contratoId: string;
}
export interface AgrupadoPorDocumento {
    /** clave `projectId|userId` → los contratos de ESE documento */
    porDocumento: Map<string, ContratoPedido[]>;
    /** Los que vinieron incompletos y no se pueden ni buscar. */
    invalidos: ContratoPedido[];
}
/**
 * Agrupa los contratos por el DOCUMENTO en el que viven, que es `UserProject`.
 *
 * NO ES UNA OPTIMIZACIÓN: es lo que evita que una operación masiva se pierda cambios en silencio.
 *
 * Varios contratos de la misma persona en el mismo proyecto están en el MISMO documento de Mongo,
 * dentro del array `contracts`. Si se procesara contrato por contrato —leer el documento, tocar un
 * contrato, guardar— cada `save()` escribiría el documento ENTERO tal como se lo leyó, y el último
 * pisaría a los anteriores. De tres contratos de una persona se borraría uno solo, y los otros dos
 * volverían intactos sin ningún error: la pantalla diría «3 quitados» y la base tendría 1.
 *
 * Agrupando, el documento se lee una vez, se tocan todos sus contratos y se guarda una vez.
 */
export declare function agruparContratosPorDocumento(pedidos: unknown): AgrupadoPorDocumento;
/** Vuelve de la clave a sus dos partes. Se separa para que el formato viva en un solo lugar. */
export declare function partirClaveDocumento(clave: string): {
    projectId: string;
    userId: string;
};
