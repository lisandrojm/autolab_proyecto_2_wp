/**
 * `camposExtra`: campos del contrato que además hacen falta. La tabla de Gestionar Equipo pide una
 * docena —tipo, reemplazo, horario, jornadas, empresas— porque los muestra en sus columnas. Se piden
 * explícitos y no «todo el contrato» para que el peso de esto no crezca cada vez que alguien agrega
 * un campo al contrato.
 *
 * `_indice` es la posición en el array del UserProject —la que esperan editar y descargar— y `_total`
 * cuántos contratos tiene la persona en ese proyecto, que es lo que muestra la columna CONTRATOS.
 */
export declare function contratosQueRigenDelProyecto(projectId: string, hoy: string, camposExtra?: string[]): Promise<Map<string, any>>;
