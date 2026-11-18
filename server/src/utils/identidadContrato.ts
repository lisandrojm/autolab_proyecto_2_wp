import { Types } from "mongoose";
import { fechaISO } from "./contratoVigencia.js";

/*
  LA IDENTIDAD DE UN CONTRATO: `contratoKey` (etapa 2, 18/11/2026).

  Los contratos son subdocumentos de `users_&_projects` sin `_id`, y se los nombraba por su POSICIÓN en
  el array. Borrar uno corre a los demás, y siete colecciones guardan esa posición. `contratoKey` es un
  ObjectId propio, SIN valor por defecto, por una razón medida: activar `_id` en el subschema hace que
  Mongoose invente un `_id` distinto en cada lectura de los contratos que todavía no lo tienen guardado.
  Un identificador que cambia entre dos lecturas es peor que no tener ninguno. Sin clave, se cae a la
  posición: lo que había antes.

  Quién pone la clave:
   - un contrato NUEVO (push, alta de vínculo, reemplazo de uno que no tenía): el modelo, al validar;
   - un contrato que REEMPLAZA a otro en la misma posición: hereda la del que estaba (ver
     `clavesAPoner`). Es lo que evita que editar un contrato lo vuelva anónimo sin que nadie se entere;
   - los contratos viejos que nadie toca: el backfill (`scripts/backfillContratoKey.ts`), con huella;
   - los `$push` por `updateOne`, que no pasan por los hooks (import de FRAME): `conClaveNueva`.
*/

export type ClaveAPoner = { tipo: "heredada" | "nueva"; clave: string } | null;

/**
 * Qué clave le corresponde a cada contrato antes de guardar. Puro.
 *
 * `originales`: la clave que tenía cada posición al cargar el documento (`undefined` = documento nuevo).
 * `actuales`: lo que hay ahora en cada posición: su clave y si es un subdocumento nuevo (reemplazo o push).
 *
 * Reglas:
 *  1. Un contrato con clave la conserva, salvo que sea NUEVO y repita una clave que ya está en otra
 *     posición (una copia del contrato dentro del mismo vínculo): ése recibe una nueva.
 *  2. Uno sin clave en la posición `i` HEREDA la que había en `i` al cargar, si el array no se achicó
 *     (`push` sólo agrega al final, así que las posiciones de antes siguen siendo las mismas) y esa clave
 *     no quedó en otra posición. Con el array más corto (se borró un contrato) no se hereda: no se puede
 *     saber qué se corrió adónde.
 *  3. Uno sin clave y nuevo recibe una nueva.
 *  4. Uno sin clave, viejo y sin tocar, queda como está: es trabajo del backfill, que escribe con huella.
 */
export function clavesAPoner(originales: (string | null)[] | undefined, actuales: { clave: string | null; nuevo: boolean }[], nuevaClave: () => string = () => new Types.ObjectId().toHexString()): ClaveAPoner[] {
  const out: ClaveAPoner[] = actuales.map(() => null);
  // Las de los contratos que no se tocaron mandan: ésas no se cambian nunca.
  const usadas = new Set<string>(actuales.filter((c) => c.clave && !c.nuevo).map((c) => c.clave!));
  // Un contrato nuevo que trae clave la conserva si nadie más la tiene (p. ej. `{ ...contrato.toObject(), x }`).
  const conservan = new Set<number>();
  actuales.forEach((c, i) => {
    if (c.clave && c.nuevo && !usadas.has(c.clave)) {
      usadas.add(c.clave);
      conservan.add(i);
    }
  });
  const puedeHeredar = !!originales && actuales.length >= originales.length;
  actuales.forEach((c, i) => {
    if (c.clave && (!c.nuevo || conservan.has(i))) return;
    const original = puedeHeredar ? originales![i] : null;
    if (!c.clave && original && !usadas.has(original)) {
      usadas.add(original);
      out[i] = { tipo: "heredada", clave: original };
      return;
    }
    if (c.nuevo || c.clave) {
      const clave = nuevaClave();
      usadas.add(clave);
      out[i] = { tipo: "nueva", clave };
    }
  });
  return out;
}

/** Contratos que entran por `updateOne` + `$push` (no pasan por los hooks del modelo): cada uno con su clave. */
export function conClaveNueva<T extends Record<string, any>>(contratos: T[]): (T & { contratoKey: Types.ObjectId })[] {
  return contratos.map((c) => ({ ...c, contratoKey: new Types.ObjectId() }));
}

/**
 * La posición de un contrato a partir de lo que mandó el cliente: su `contratoKey` (o el `_id` de
 * subdocumento, que ningún contrato tiene: el subschema es `_id: false`), o la posición misma. -1 si no
 * está. Durante la transición los endpoints aceptan las dos cosas.
 *
 * Por qué importa: la posición cambia sola. Alguien abre el contrato en la posición 2, se va a constatar
 * la obra social en la SSS (captcha, tarda) y mientras tanto se elimina el de la posición 0. Al volver,
 * el 2 ya es otro contrato y el dato se escribe en el alta equivocada, sin error. Con la clave, no.
 *
 * Devuelve la posición, porque el resto del código escribe con `up.contracts[idx] = ...`.
 */
export function resolverIndiceContrato(up: { contracts?: any[] }, param: string): number {
  const contratos = up.contracts || [];
  const texto = String(param ?? "");
  let idx: number;
  if (/^[a-f\d]{24}$/i.test(texto)) {
    const porClave = contratos.findIndex((c: any) => String(c?.contratoKey || "") === texto);
    idx = porClave >= 0 ? porClave : contratos.findIndex((c: any) => String(c?._id || "") === texto);
  } else {
    const n = Number(texto);
    idx = Number.isInteger(n) && n >= 0 && n < contratos.length ? n : -1;
  }
  // Una lápida (contrato anulado, etapa 2b) no es un contrato que se pueda tocar: editarla la «resucitaría».
  return idx >= 0 && contratos[idx]?.estadoContrato === "ANULADO" ? -1 : idx;
}

/*
  ETAPA 2c (18/11/2026): LAS REFERENCIAS DE OTRAS COLECCIONES GUARDAN LA CLAVE, ADEMÁS DE LA POSICIÓN.
  Recibos, lotes, renovaciones, verificaciones y constancias de ARCA y logs de corridas nombraban al
  contrato sólo por su posición en `UserProject.contracts`. Desde la 2b la posición ya no se corre (las
  anulaciones dejan lápida), pero la posición sola no se puede comprobar: con la clave al lado, quien lee
  sabe si sigue apuntando al mismo contrato.

  Regla de lectura: si la referencia tiene clave, manda la clave; la posición es para lo viejo sin
  backfill. Una clave que no aparece en el vínculo es una referencia rota (-1), nunca «la posición».
*/

/** La clave del contrato en esa posición (también si es una lápida: la referencia apuntaba ahí). */
export function claveEnPosicion(contratos: any[] | undefined, idx: number | null | undefined): Types.ObjectId | null {
  if (idx == null || !Number.isInteger(Number(idx)) || Number(idx) < 0) return null;
  const k = contratos?.[Number(idx)]?.contratoKey;
  return k && Types.ObjectId.isValid(String(k)) ? new Types.ObjectId(String(k)) : null;
}

/** La posición a la que apunta una referencia: por clave si la tiene, por posición si no. -1 si está rota. */
export function indiceDeReferencia(contratos: any[] | undefined, ref: { contratoKey?: unknown; indice?: number | null }): number {
  const lista = contratos || [];
  if (ref.contratoKey) return lista.findIndex((c) => c?.contratoKey && String(c.contratoKey) === String(ref.contratoKey));
  const n = Number(ref.indice);
  return ref.indice != null && Number.isInteger(n) && n >= 0 && n < lista.length ? n : -1;
}

/**
 * Filtro de Mongo para «lo que cuelga de este contrato» en una colección que guarda `{campoIndice, contratoKey}`:
 * lo que tiene la clave, y lo viejo sin clave que está en esa posición. Lo que tiene OTRA clave no entra
 * aunque comparta la posición.
 */
export function filtroDeContrato(idx: number, clave: Types.ObjectId | null, campoIndice = "contractIndex", prefijo = ""): Record<string, unknown> {
  const sinClave = { $or: [{ [`${prefijo}contratoKey`]: null }, { [`${prefijo}contratoKey`]: { $exists: false } }] };
  if (!clave) return { [`${prefijo}${campoIndice}`]: idx };
  return { $or: [{ [`${prefijo}contratoKey`]: clave }, { $and: [{ [`${prefijo}${campoIndice}`]: idx }, sinClave] }] };
}

/**
 * LA HUELLA DE UNA REFERENCIA (backfill de la etapa 2c). Antes de la 2b las posiciones se corrían con
 * cada borrado físico: una referencia vieja puede estar apuntando a OTRO contrato que el que nombró. Lo
 * que la referencia guardó del contrato (alta, baja, empleadora) tiene que coincidir con el que hoy está
 * en esa posición; si no, la clave no se pone y la referencia queda para revisar a mano.
 * `null` = coincide (o la referencia no guardó nada que comparar); si no, el motivo.
 */
export function huellaNoCoincide(c: any, h: { alta?: string | null; baja?: string | null; empresaId?: unknown }): string | null {
  if (!c) return "no hay contrato en esa posición";
  if (h.alta && fechaISO(String(h.alta)) !== fechaISO(c.fecha_alta_contrato as any)) return `alta ${fechaISO(String(h.alta))} ≠ ${fechaISO(c.fecha_alta_contrato as any) || "sin alta"}`;
  if (h.baja && fechaISO(String(h.baja)) !== fechaISO(c.fecha_baja_contrato as any)) return `baja ${fechaISO(String(h.baja))} ≠ ${fechaISO(c.fecha_baja_contrato as any) || "sin baja"}`;
  if (h.empresaId && String(h.empresaId) !== String(c.empresaContratoId || "")) return `empleadora ${String(h.empresaId).slice(-6)} ≠ ${String(c.empresaContratoId || "ninguna").slice(-6)}`;
  return null;
}
