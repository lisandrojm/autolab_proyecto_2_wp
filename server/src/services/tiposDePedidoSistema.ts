import { CATEGORIA_CAMBIO_TURNO, reglasCambioTurnoDe } from "../compartido/cambioDeTurno.js";

/*
  PROTECCIONES DE LOS TIPOS DE PEDIDO DE SISTEMA (26/11/2026). Puras, para poder probarlas sin levantar
  Express: las rutas de `routes/orderConfig.ts` las llaman y devuelven el status que indican.

  Qué se protege (mismo criterio que los turnos de sistema, ver documentation/entidades_sistema_por_defecto.md):
    · no se BORRA un tipo de sistema (403);
    · no se le cambia el TIPO DE DATO ni la clave (403): nombre, información, firma, plantilla, estado,
      orden y las reglas sí;
    · desde la API no se CREA un tipo de sistema ni uno con tipo de dato «cambio_turno» (403): los crea el
      server, uno por tenant (`orderConfigInitService`).
*/

export interface Rechazo {
  status: number;
  error: string;
}

interface TipoGuardado {
  isSystem?: boolean;
  categoryType?: string;
  systemKey?: string;
  config?: any;
}

/** POST: nadie crea un tipo de sistema a mano, ni usa el tipo de dato reservado. */
export function rechazoAlCrear(data: { categoryType?: string; isSystem?: unknown; systemKey?: unknown }): Rechazo | null {
  if (data.isSystem || data.systemKey) return { status: 403, error: "Los tipos de pedido de sistema los crea la plataforma: no se pueden crear a mano." };
  if (data.categoryType === CATEGORIA_CAMBIO_TURNO) return { status: 403, error: "«Cambio de turno» es un tipo de sistema: ya existe uno por organización y no se puede crear otro." };
  return null;
}

/** PUT: en un tipo de sistema, el tipo de dato y la clave quedan como están. */
export function rechazoAlEditar(tipo: TipoGuardado, data: { categoryType?: string; isSystem?: unknown; systemKey?: unknown }): Rechazo | null {
  if (!tipo.isSystem) {
    // Un tipo común tampoco puede volverse de sistema ni tomar el tipo de dato reservado.
    if (data.isSystem || data.systemKey) return { status: 403, error: "Un tipo de pedido no se puede marcar como de sistema a mano." };
    if (data.categoryType === CATEGORIA_CAMBIO_TURNO) return { status: 403, error: "«Cambio de turno» es un tipo de dato reservado para el tipo de sistema." };
    return null;
  }
  if (data.categoryType !== undefined && data.categoryType !== tipo.categoryType) return { status: 403, error: "El tipo de dato de un tipo de pedido de sistema no se puede cambiar." };
  if (data.systemKey !== undefined && data.systemKey !== tipo.systemKey) return { status: 403, error: "La clave de un tipo de pedido de sistema no se puede cambiar." };
  if (data.isSystem !== undefined && !data.isSystem) return { status: 403, error: "Un tipo de pedido de sistema no se puede destildar." };
  return null;
}

/** DELETE: nunca. */
export function rechazoAlBorrar(tipo: TipoGuardado): Rechazo | null {
  if (tipo.isSystem) return { status: 403, error: "No se puede eliminar un tipo de pedido generado por el sistema." };
  return null;
}

/**
 * Lo que se GUARDA de un PUT sobre un tipo de sistema: lo editable, nada más. `isSystem` y `systemKey` no
 * viajan nunca; para «Cambio de turno» la config son sólo sus reglas, normalizadas (sin subtipos ni reset).
 */
export function datosEditablesDeSistema(tipo: TipoGuardado, data: Record<string, any>): Record<string, any> {
  const { isSystem: _i, systemKey: _k, categoryType: _c, ...resto } = data;
  if (tipo.categoryType === CATEGORIA_CAMBIO_TURNO && resto.config !== undefined) {
    resto.config = { reglasCambioTurno: reglasCambioTurnoDe(resto.config) };
  }
  return resto;
}
