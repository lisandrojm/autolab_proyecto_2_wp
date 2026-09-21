import { Types } from "mongoose";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS MISMOS FILTROS DE GESTIONAR EQUIPO, PERO SOBRE UN PERÍODO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gestionar Equipo filtra en el SERVER (ver `resolveProjectTeamFilterIds` en `routes/users.ts`),
 * porque vigencia, tipo, estado impositivo y reemplazo dependen del contrato que rige y eso no se
 * puede escribir como query de Mongo. El modal de Reportes de Novedades necesitaba lo mismo, y
 * hacerlo en el navegador exigía bajarse los contratos de las 1.577 personas del tenant.
 *
 * Por eso esto devuelve DOS COSAS Y NADA MÁS:
 *
 *   · `userIds`: quiénes pasan los filtros. El modal se queda con esas filas.
 *   · `opciones`: qué poner en cada desplegable, sacado de la gente del período y no del sistema
 *     entero — igual que el resto de los filtros del modal.
 *
 * Son unos pocos KB contra los 2,7 MB del directorio, y el criterio no puede divergir del de
 * Gestionar Equipo porque las dos puntas usan las mismas funciones: `getContratoActivo` para elegir
 * el contrato y `claveEstado` para comparar estados.
 *
 * LA DIFERENCIA CON GESTIONAR EQUIPO, a propósito: el área y el turno salen del PARTE, no de la
 * configuración del proyecto. Acá se está mirando dónde trabajó esa persona esos días, que es la
 * pregunta de una novedad; allá se mira dónde está asignada, que es la de un equipo.
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
export declare function resolverFiltrosDeNovedades(tenantId: Types.ObjectId, filtros: FiltrosDeNovedades): Promise<{
    userIds: string[];
    opciones: OpcionesDeFiltro;
    total: number;
}>;
