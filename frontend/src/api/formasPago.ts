import { createSimpleCatalogApi, SimpleCatalogItem } from "./simpleCatalog";
import type { FormaPagoLike } from "@compartido/formasPago";

/** El ABM de Configuración → Formas de pago (`server/src/routes/formasPago.ts`). */
export const formasPagoAPI = createSimpleCatalogApi("/formas-de-pago");

/** Una forma de pago tal como la devuelve el listado (ya en el orden de los selectores). */
export type FormaPagoItem = SimpleCatalogItem & FormaPagoLike;
