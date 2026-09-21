import { Types } from "mongoose";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS FILTROS DEL REPORTE DE NOVEDADES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Vigencia, tipo, estado impositivo y reemplazo dependen del CONTRATO QUE RIGE, y elegir ese
 * contrato es una regla con desempates que no se puede escribir como query de Mongo. Se resuelve
 * acá y viajan unos pocos KB, en vez de los contratos de las 1.577 personas del tenant.
 *
 * ── Lo que hay que tener presente, porque es de donde salieron todos los bugs ──
 *
 * LA UNIDAD DE ESTE REPORTE ES LA FILA, NO LA PERSONA. Cada fila es una persona EN UN PROYECTO, y
 * su contrato es el que rige EN ESE PROYECTO DENTRO DEL PERÍODO. La misma persona puede tener dos
 * filas: vigente en un proyecto y no vigente en el otro.
 *
 * La primera versión de esto contestaba una lista de personas, con el contrato que rige HOY entre
 * TODOS sus proyectos. Elegía otro contrato que el que muestra la fila, así que:
 *
 *   · con «Vigentes» puesto quedaban filas NO VIGENTE — la persona tenía un contrato vigente en
 *     otro proyecto y eso la dejaba pasar entera, con todas sus filas;
 *   · el desplegable «Tipo de contrato» salía vacío o incompleto: listaba los tipos de la gente que
 *     aparece en los PARTES (91 personas) mientras la tabla dibuja a todo el que tiene contrato en
 *     el período (189 filas), así que había filas cuyo tipo no se podía elegir.
 *
 * Por eso esto devuelve CLAVES DE FILA (`userId::PROYECTONORMALIZADO`) y las opciones salen de esas
 * mismas filas: lo que se puede elegir es exactamente lo que está en la tabla.
 *
 * ── El mismo criterio que la tabla, campo por campo ──
 *
 * El contrato de la fila se elige con la regla de `getContratoActivo` del front: entre los vigentes
 * manda el de tiempo indeterminado, después el más reciente por alta y, a igualdad, por carga; sin
 * vigentes, el más reciente de todos. Si se toca allá, hay que tocar acá.
 *
 * Los proyectos se agrupan por NOMBRE NORMALIZADO y no por id, igual que la tabla: hay vínculos
 * distintos con el mismo proyecto escrito de otra forma, y la tabla los junta en una fila.
 *
 * LA EXCEPCIÓN, a propósito: el área y el turno salen del PARTE, no de la configuración del
 * proyecto. Acá se mira dónde trabajó esa persona esos días, que es la pregunta de una novedad;
 * en Gestionar Equipo se mira dónde está asignada, que es la de un equipo.
 */
export interface FiltrosDeNovedades {
    desde: string;
    hasta: string;
    estadoUsuario?: "active" | "inactive" | "";
    vigencia?: "vigente" | "novigente" | "";
    tipoContrato?: string;
    estadoContrato?: string;
    /** "areaId::shiftId", o "__none__" para los renglones sin área ni turno. */
    areaTurno?: string;
    reemplazo?: "con" | "sin" | "";
    /** Nombre del rol de plataforma, tal como se muestra. */
    rol?: string;
    /**
     * El interruptor «Mostrar solo los que tienen contrato activo» de la tabla.
     *
     * Prendido (el valor por omisión, y como se abre el modal) la fila mira sólo los contratos que
     * pisan el período; apagado mira todos los de la persona en ese proyecto. Tiene que venir de
     * afuera porque cambia QUÉ CONTRATO rige, y con él la vigencia, el tipo y el estado.
     */
    soloContratoActivo?: boolean;
}
export interface OpcionesDeFiltro {
    roles: string[];
    tipos: string[];
    estados: string[];
    areasTurnos: {
        value: string;
        label: string;
    }[];
}
/** Lo que cada fila necesita del contrato y el padrón no manda. */
export interface EconomiaDeLaFila {
    sueldoJornada: number;
    sueldoMano: number;
}
export declare function resolverFiltrosDeNovedades(tenantId: Types.ObjectId, filtros: FiltrosDeNovedades): Promise<{
    claves: string[];
    opciones: OpcionesDeFiltro;
    total: number;
    economia: Record<string, EconomiaDeLaFila>;
}>;
/** La clave de fila que espera `claves`, para que el front la arme igual. */
export declare const claveDeFila: (userId: string, nombreProyecto: string) => string;
