import { Types } from "mongoose";
/**
 * «CONTRATO CUSTOM» Y «RELEASE CUSTOM» SON DEL SISTEMA (pedido del 16/10/2026): los crea el server y
 * no se pueden eliminar. Antes los creaba un script a mano (`scripts/crearPlantillasCustom.ts`), así
 * que un tenant nuevo no los tenía.
 *
 * Son cuatro registros, marcados con `delSistema`:
 *  - el tipo de contrato y su plantilla (globales: no tienen `tenantId`; uno solo para todos),
 *  - el tipo de release y el release (uno por tenant).
 *
 * Idempotente. Lo que ya existe se reconoce por la marca o, la primera vez, por el nombre y lo custom
 * (los que creó el script), y se marca sin duplicarlo. No toca lo que el usuario cambió (membrete,
 * activo, estados): sólo crea lo que falta, pone la marca y mantiene la plantilla como custom.
 *
 * Corre al arrancar el server para todos los tenants y, por las dudas, en los GET de las cuatro
 * pantallas para el tenant que mira (una vez por proceso y tenant).
 */
export declare const NOMBRE_CONTRATO_CUSTOM = "Contrato custom";
export declare const NOMBRE_RELEASE_CUSTOM = "Release custom";
/** Para un tenant: los globales y los suyos. Una vez por proceso (si falla, se reintenta la próxima). */
export declare function asegurarPlantillasCustom(tenantId: Types.ObjectId | string): Promise<void>;
/** Al arrancar: todos los tenants de clientes (el del sistema no tiene contratos). */
export declare function asegurarPlantillasCustomEnTodos(): Promise<void>;
/** Para los GET: que nunca rompan la pantalla si esto falla. */
export declare function asegurarPlantillasCustomSinRomper(tenantId: Types.ObjectId | string | undefined): Promise<void>;
export declare const MENSAJE_DEL_SISTEMA = "Es del sistema (Contrato custom / Release custom): no se puede eliminar.";
