import { type IEmbeddedOverlap } from "../../models/VacationConfig.js";
/**
 * LAS REGLAS DE SOLAPAMIENTO DE VACACIONES (Vacaciones → Reglas → Solapamiento), EN UN SOLO LUGAR.
 *
 * Una regla dice «en este ámbito (área / proyecto / rol empresa; lo que quede en “Cualquiera” se
 * evalúa por cada ámbito de la persona) no puede haber más de N personas de vacaciones a la vez».
 * Esto estaba escrito dos veces en `routes/vacations.ts` —en `GET /availability` (qué fechas se le
 * bloquean a la persona en la app) y en `POST /` (si el pedido viola una regla)— y se separaron con el
 * tiempo. Acá queda UNA lectura de las reglas y UNA forma de armar el ámbito; lo que sigue distinto, a
 * propósito, es cómo cuenta cada uso:
 *   · `fechasBloqueadas` cuenta vacaciones por día (como el GET de siempre).
 *   · `violaSolapamiento` cuenta personas distintas en todo el rango pedido (como el POST de siempre).
 * El plan de vacaciones por proyecto usa la segunda, con `vacacionesVirtuales`: sus bloques todavía no
 * son `Vacation` y tienen que contarse igual para que dos editores del mismo rol no salgan juntos.
 *
 * Qué se mira de la persona (igual que antes): el área es la de su ficha (`UserProfile.department`,
 * por nombre de Área), los proyectos son `User.projectIds`, y el rol empresa es el de sus vínculos
 * (`metadata.projects[].rol_frame_id` contra `RoleFrame.externalId` / `data.rol.id`). El `clientId` de
 * la regla no se evalúa (nunca se evaluó).
 */
export interface PerfilSolapamiento {
    userId: string;
    /** El usuario con `metadata.projects` poblado: de ahí salen los roles y los horarios de sus contratos. */
    user: any;
    userAreaId: string | null;
    projectIds: any[];
}
/** La persona tal como la miran las reglas. `null` si no existe. */
export declare function perfilDeSolapamiento(tenantId: any, userId: string): Promise<PerfilSolapamiento | null>;
/**
 * Las reglas activas que le aplican a la persona, quedándose sólo con las MÁS ESPECÍFICAS («Specific
 * overrides General»): cada criterio fijado en la regla suma un punto, y sólo cuentan las de puntaje
 * máximo. Vacío si no hay configuración o ninguna le aplica.
 */
export declare function reglasAplicables(tenantId: any, perfil: PerfilSolapamiento): Promise<IEmbeddedOverlap[]>;
/**
 * ¿Comparten franja horaria? Se miran los contratos no vencidos de cada una (en ese proyecto, si se
 * pasa) y se comparan sus `hora_inicio`/`hora_fin`; 00:00 de fin es 24:00 y un turno nocturno cruza
 * la medianoche. Si alguna no tiene horario cargado se asume que sí se pisan: es lo seguro.
 */
export declare function hayChoqueDeHorario(meta1: any, meta2: any, contextPId?: string): boolean;
/** Los ámbitos (proyecto × área) contra los que se evalúa una regla para esta persona: lo fijado en la regla, o cada uno de los suyos. */
export declare function ambitosDe(rule: IEmbeddedOverlap, perfil: PerfilSolapamiento): Array<{
    pId?: any;
    aId?: any;
}>;
/** Las OTRAS personas activas del ámbito (con el rol de la regla, si lo fija), con `metadata.projects` poblado para el horario. */
export declare function personasDelAmbito(tenantId: any, perfil: PerfilSolapamiento, rule: IEmbeddedOverlap, ambito: {
    pId?: any;
    aId?: any;
}): Promise<any[]>;
/**
 * Qué fechas tiene bloqueadas la persona por las reglas (lo que la app pinta como ocupado): de este
 * mes a 18 meses adelante, un día se bloquea si en algún ámbito la cantidad de vacaciones (no
 * rechazadas ni canceladas, de personas que comparten horario) llega al máximo de la regla.
 * `status` dice si lo que bloquea es sólo pendiente o ya aprobado.
 */
export declare function fechasBloqueadas(tenantId: any, userId: string): Promise<Array<{
    date: string;
    status: string;
}>>;
/** Una vacación que todavía no existe en la base pero tiene que contar (los bloques de un plan). */
export interface VacacionVirtual {
    userId: string;
    startDate: Date;
    endDate: Date;
}
export interface Violacion {
    viola: boolean;
    /** Mensaje listo para mostrar, como lo daba el POST. */
    mensaje?: string;
    regla?: IEmbeddedOverlap;
    personas?: number;
}
/**
 * ¿Un pedido de `start` a `end` viola alguna regla? En cada ámbito se cuentan las personas DISTINTAS
 * que comparten horario y ya tienen vacaciones que se pisan con el rango; si llegan al máximo, viola.
 * `vacacionesVirtuales` se suman a las de la base (y `ignorarVacationIds` se descuentan, p. ej. la
 * propia al editar).
 */
export declare function violaSolapamiento(tenantId: any, userId: string, start: Date, end: Date, extra?: {
    vacacionesVirtuales?: VacacionVirtual[];
    ignorarVacationIds?: string[];
}): Promise<Violacion>;
