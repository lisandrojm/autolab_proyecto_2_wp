/**
 * SINCRONIZAR BAJAS DE ARCA A LOS CONTRATOS (etapa 3, paso 2, 19/11/2026).
 *
 * Lleva al CONTRATO las bajas que ARCA ya tiene en el espejo de Relaciones Laborales, sólo con evidencia
 * fuerte (`utils/bajasArcaContrato.ts`: misma persona, empleadora y fecha de alta exacta). Lo usan la
 * migración (`scripts/persistirBajasArca.ts`) y el botón «Sincronizar bajas» de la pestaña Antigüedad
 * ARCA: los dos primero miran (`planDeBajasArca`) y después aplican (`aplicarBajasArca`), que vuelve a
 * calcular el plan en el server —nunca escribe lo que mande el cliente— y escribe sólo lo que sigue igual
 * que cuando se calculó (la baja vieja va en el filtro).
 *
 * Lee el ESPEJO, no ARCA: lo que ARCA cambió después de la última sincronización de relaciones no está.
 * Por eso el plan dice cuándo fue esa sincronización.
 *
 * Cada escritura pasa por el modelo, así que queda en la auditoría de contratos con quién la hizo, y el
 * contrato guarda `origenBaja: "ARCA_SYNC"` y `bajaArca` (fin, situación de baja, empleadora y la baja que
 * tenía antes). El estado del contrato se recalcula con la baja nueva.
 */
import { Types } from "mongoose";
import { type RelacionArca, type TipoCambioBaja } from "../../utils/bajasArcaContrato.js";
export interface ItemBajaArca {
    userProjectId: string;
    userId: string;
    persona: string;
    cuil: string;
    proyecto: string;
    contratoKey: string;
    posicion: number;
    contrato: string;
    alta: string;
    bajaContrato: string;
    finArca: string;
    situacionBaja: string;
    empleadora: string;
    empleadoraCuit: string;
    tipo: TipoCambioBaja;
    aplicar: boolean;
    alerta?: string;
    /**
     * El alta de este contrato se presentó desde WeProdu (Carga Masiva o Altas Masivas). Si no, alguien la cargó a
     * mano en ARCA: son las que explican el «ARCA termina después que el contrato» (ver `auditoriaArca.ts`).
     */
    altaDesdeWeprodu: boolean;
    diasAntesDelFin?: number;
    /** Los tramos de ARCA mirados (por tramos, granularidad, revisión manual). */
    tramos?: {
        inicio: string;
        fin: string;
        situacionBaja: string;
    }[];
    /** El valor crudo de la baja, para escribir sólo si sigue igual. */
    bajaCruda: unknown;
    altaCruda: unknown;
}
export interface PlanBajasArca {
    hoy: string;
    /** Última sincronización de Relaciones Laborales (lo que este plan da por sabido de ARCA). */
    espejoAl: string | null;
    items: ItemBajaArca[];
    resumen: Record<TipoCambioBaja, number>;
}
/** Lo que hace falta para comparar contratos con el espejo de ARCA: lo comparten el plan de bajas y la auditoría (etapa 5). */
export interface ContextoArca {
    hoy: string;
    espejoAl: string | null;
    /** Las personas con CUIT válido, por id. */
    porUsuario: Map<string, any>;
    /** Sus vínculos (proyección mínima de contratos). */
    ups: any[];
    /** Empleadoras por id: CUIT y razón social. */
    empresa: Map<string, {
        cuit: string;
        nombre: string;
    }>;
    relsPorCuil: Map<string, RelacionArca[]>;
    /**
     * ¿Es un contrato de Servicios? Servicios no tiene relación en ARCA: no se empareja con ninguna, aunque comparta
     * la fecha de alta y la empleadora con otro contrato de la persona (`sinRelacionEnArca`, la misma regla del panel).
     */
    esServicios: (contrato: any) => boolean;
}
export declare function cargarContextoArca(tenantId: Types.ObjectId | string, opciones?: {
    userIds?: string[];
}): Promise<ContextoArca>;
export declare function planDeBajasArca(tenantId: Types.ObjectId | string, opciones?: {
    userIds?: string[];
    contexto?: ContextoArca;
}): Promise<PlanBajasArca>;
/**
 * Escribe las bajas del plan que se aplican. `claves`: sólo esos contratos (por `contratoKey`); sin
 * `claves`, todos los aplicables. Devuelve qué se escribió y qué no (porque cambió en el medio).
 * `plan`: uno recién calculado EN EL SERVER (el cron), para no calcularlo dos veces; nunca del cliente.
 */
export declare function aplicarBajasArca(tenantId: Types.ObjectId | string, opciones?: {
    claves?: string[];
    userIds?: string[];
    plan?: PlanBajasArca;
}): Promise<{
    escritos: ItemBajaArca[];
    cambiaron: ItemBajaArca[];
    plan: PlanBajasArca;
}>;
