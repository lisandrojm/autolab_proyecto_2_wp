import { Types } from "mongoose";
/**
 * LA PLANTILLA PDF «Solicitud de cambio de turno», como las demás plantillas por defecto de pedidos
 * (`scripts/seedOnStart.ts`, que la incluye en su lista). Se siembra acá también porque el seed sólo corre
 * con SEED_ON_START y el tipo de sistema tiene que nacer con su plantilla asignada. Las variables
 * `turnoActual`, `turnoSolicitado`, `proyecto`, `area`, `vigencia` y `motivo` las arma
 * `utils/pdfVariableReplacer.ts` a partir de `metadata.cambioTurno` y `dynamicValue`.
 */
export declare const PLANTILLA_CAMBIO_TURNO_POR_DEFECTO: {
    code: "cambioTurno";
    name: string;
    content: string;
    variablesHint: string;
    isActive: boolean;
};
export declare function ensureDefaultOrderConfigs(tenantId: Types.ObjectId | string): Promise<void>;
/** Recorre todos los tenants. Se llama al arrancar (`server.ts`), junto a roles y turnos. */
export declare function ensureAllTenantsHaveDefaultOrderConfigs(): Promise<void>;
