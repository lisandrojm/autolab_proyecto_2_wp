import { Types } from "mongoose";
/**
 * ABM de formas de pago (Configuración → Formas de pago).
 *
 * Mismo factory que Entidades Financieras, con las reglas propias en middlewares montados ANTES de
 * delegar (como Valoraciones): largo y forma de nombre/código/descripción, código autogenerado desde el
 * nombre si viene vacío, y nombre/código únicos (409). El borrado lo frena el gancho `antesDeBorrar`
 * cuando hay contratos o tipos de contrato que la usan.
 */
declare const router: import("express-serve-static-core").Router;
/** Contratos de miembros y tipos de contrato que usan la forma: lo que impide borrarla. */
export declare function usoDeFormaPago(id: Types.ObjectId | string): Promise<{
    contratos: number;
    tipos: number;
}>;
export { router as formaPagoRoutes };
