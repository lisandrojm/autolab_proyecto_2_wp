import { Types } from "mongoose";
import { type CandidatoAlta } from "./presentacionAutomatica.js";
/**
 * ADOPTAR LAS ALTAS HECHAS A MANO EN ARCA (pedido del 04/11/2026).
 *
 * Cuando ARCA rechaza o retiene un alta, a veces el operador la fuerza a mano en el sitio de ARCA y la
 * plataforma no se enteraba: el contrato seguía «Pedido de ARCA», en la cola de Altas Automáticas
 * (donde iba a rebotar o duplicarse), sin constancia ni documentación.
 *
 * Esto cruza las altas PENDIENTES (`candidatosDeAlta`) con las Relaciones Laborales SINCRONIZADAS de
 * la misma persona y empleadora y aplica `decidirAltaExterna`:
 *   · idéntica → se marca presentada (`altaArcaPresentada.via = "externa"`), sale de la cola y avanza
 *     de estado como cualquier alta presentada (`avanzarPresentada`). La constancia la baja la descarga
 *     diaria de siempre: toma toda alta presentada sin constancia (decisión del usuario, 04/11/2026), la
 *     nombra con la nomenclatura «Altas de ARCA» y sigue a Documentos y a la firma. Si alguien ya la
 *     subió por la plataforma (`altaConstancia.validadaEl`), no se baja de nuevo.
 *   · parecida pero no idéntica → revisión manual, con lo esperado y lo encontrado lado a lado.
 *   · al coordinador del proyecto le llega una novedad por cada alta adoptada.
 *
 * Sin abrir ARCA: sólo la base. Por eso corre sin tope y en varios momentos —al terminar la
 * sincronización, antes de cada corrida automática y antes de una Presentación Masiva— sin costo.
 *
 * IDEMPOTENTE: marcar presentada está condicionado a que el contrato siga sin presentar (el aplicador
 * de `verificacionAltas.ts`), y una revisión manual que ya dice lo mismo no se reescribe ni se audita.
 * Auditado en `ArcaVerificacionAlta` (`origen: "sync"`, `detectadaPor`) y en la pestaña Presentadas
 * (un `ArcaAltasLog` de tipo `externa`).
 */
export type DetectadaPor = "sincronizacion" | "corrida_diaria" | "presentacion_masiva" | "manual";
export interface ResultadoAdopcion {
    userProjectId: string;
    contractIndex: number;
    nombre: string;
    cuil: string;
    empresa: string;
    alta: string;
    baja: string;
    decision: "adoptar" | "revision_manual";
    /** `marcada_presentada`, `revision_manual`, `sin_cambios`, `ya_resuelta`, `contrato_cambio`, `en_seco`. */
    accion: string;
    motivo: string;
}
export declare function adoptarAltasExternas(o: {
    tenantObjectId: Types.ObjectId;
    detectadaPor: DetectadaPor;
    usuarioId?: string | null;
    /** Sólo mira qué pasaría: no escribe nada (el «Probar en seco» de la Presentación Masiva). */
    enSeco?: boolean;
    /** Sólo estos contratos (los de un lote). Sin esto, todas las altas pendientes del tenant. */
    soloContratos?: Array<{
        userProjectId: string;
        contractIndex: number;
    }>;
    /** Sólo las altas de esta empleadora (la Presentación Masiva es de una). */
    empresaId?: string;
    /** Si ya se tienen a mano (la corrida automática los acaba de calcular). */
    candidatos?: CandidatoAlta[];
}): Promise<ResultadoAdopcion[]>;
