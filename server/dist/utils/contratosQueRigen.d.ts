import { Types } from "mongoose";
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
/**
 * EL CONTRATO QUE RIGE DE CADA PERSONA, MIRANDO TODOS SUS PROYECTOS.
 *
 * La variante de arriba responde «en este proyecto»; ésta responde «hoy, en cualquier lado», que es
 * lo que pregunta el buscador de personas de la solicitud de contratación: al lado de cada nombre
 * dice si tiene contrato vigente y desde cuándo, sin importar de qué proyecto salga.
 *
 * Devuelve SÓLO las dos fechas porque es lo único que esa fila muestra. Antes el front recibía las
 * fechas de TODOS los contratos de TODAS las personas para calcular esto en el teléfono: 4592
 * contratos y 638 KB por página de 1000 personas, casi 11 segundos contra Atlas.
 *
 * Misma regla que `getContratoActivo`: entre los vigentes manda el de tiempo indeterminado; si no,
 * el más reciente por alta y, a igualdad, por carga; sin vigentes, el más reciente de todos.
 */
export declare function contratosQueRigenDeLasPersonas(userIds: (string | Types.ObjectId)[], hoy: string, 
/**
 * Campos del contrato elegido que además hacen falta (`nombre_contrato`, `tipo_contrato`…).
 *
 * Las fechas van siempre: son las que deciden cuál rige y las que dicen si está vigente. Lo demás
 * se pide explícito y no «todo el contrato», para que esto no engorde cada vez que alguien le
 * agrega un campo al contrato.
 */
camposExtra?: string[]): Promise<Map<string, any | null>>;
