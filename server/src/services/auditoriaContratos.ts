/**
 * AUDITORÍA DE CONTRATOS (etapa 3, 19/11/2026; decisiones del usuario del 18/11).
 *
 * Se registra SOLA, en el modelo: `instalarAuditoriaDeContratos(schema)` engancha `save`, los updates
 * (`updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne`) y los borrados de `UserProject`. Antes de
 * escribir lee cómo estaban los contratos que el update toca —sólo los campos tocados, para no traer
 * vínculos enteros de Atlas—, después lee cómo quedaron, y registra la diferencia por `contratoKey`
 * (`utils/auditoriaContratos.ts`). Quién lo hizo sale del contexto (`utils/contextoAuditoria.ts`).
 *
 * Los scripts que escriben con el driver (sin Mongoose) no pasan por los hooks: usan
 * `escribirContratosAuditado` (mismo antes/después). El test `test:auditoria-contratos` revisa que
 * ningún script nuevo escriba contratos sin eso.
 *
 * Si registrar falla, la escritura ya ocurrió: se avisa fuerte en el log y no se rompe la operación.
 */
import { Types } from "mongoose";
import type { Schema, Collection } from "mongoose";
import { AuditoriaContrato } from "../models/AuditoriaContrato.js";
import { contextoActual } from "../utils/contextoAuditoria.js";
import { camposTocados, diferenciasDeContratos, proyeccionPara, type CamposTocados, type EventoContrato } from "../utils/auditoriaContratos.js";

const oid = (v: any) => (v && Types.ObjectId.isValid(String(v)) ? new Types.ObjectId(String(v)) : null);

/** Guarda los eventos de varios vínculos, en una sola escritura, con el contexto actual. Nunca tira. */
export async function registrarEventosDeVarios(lista: { vinculo: { _id: any; projectId?: any; userId?: any }; eventos: EventoContrato[] }[], operacion: string): Promise<void> {
  const ctx = contextoActual();
  const el = new Date();
  const filas = lista.flatMap(({ vinculo, eventos }) =>
    eventos.map((e) => ({
      ...e,
      contratoKey: oid(e.contratoKey),
      userProjectId: vinculo._id,
      projectId: oid(vinculo.projectId),
      userId: oid(vinculo.userId),
      el,
      origen: ctx?.origen || "sistema",
      por: ctx?.por,
      detalle: ctx?.detalle || "sin contexto",
      motivo: e.motivo || ctx?.motivo || undefined,
      operacion,
    })),
  );
  if (!filas.length) return;
  try {
    await AuditoriaContrato.insertMany(filas, { ordered: false });
  } catch (err: any) {
    console.error(`[AUDITORIA] ✖ No se pudo registrar ${filas.length} evento(s) (${operacion}): ${err?.message || err}`);
  }
}

/** Lo mismo, para un vínculo. */
export const registrarEventos = (vinculo: { _id: any; projectId?: any; userId?: any }, eventos: EventoContrato[], operacion: string) => registrarEventosDeVarios([{ vinculo, eventos }], operacion);

/** Antes/después de una escritura que puede tocar contratos de varios vínculos. */
async function auditarAlrededor<R>(
  leer: (filtro: any, proyeccion: Record<string, 1>, uno: boolean) => Promise<any[]>,
  filtro: any,
  t: CamposTocados,
  uno: boolean,
  escribir: () => Promise<R>,
  operacion: string,
): Promise<R> {
  if (!t.toca) return escribir();
  const proy = proyeccionPara(t);
  const antes = await leer(filtro, proy, uno);
  const r = await escribir();
  const ids = antes.map((d) => d._id);
  const despues = ids.length ? await leer({ _id: { $in: ids } }, proy, false) : await leer(filtro, proy, true); // upsert: lo recién creado
  const porId = new Map(despues.map((d) => [String(d._id), d]));
  const campos = t.todo ? undefined : t.campos;
  const lista = antes.map((a) => {
    const d = porId.get(String(a._id));
    return { vinculo: a, eventos: diferenciasDeContratos(a.contracts || [], d ? d.contracts || [] : null, { campos, motivoQuitado: d ? undefined : "vínculo eliminado" }) };
  });
  if (!ids.length) for (const d of despues) lista.push({ vinculo: d, eventos: diferenciasDeContratos([], d.contracts || [], { campos }) });
  await registrarEventosDeVarios(lista, operacion);
  return r;
}

/**
 * Para los scripts que escriben con el driver: la misma auditoría que los hooks. `uno` = updateOne.
 * Devuelve lo mismo que la escritura.
 */
export async function escribirContratosAuditado(coleccion: Collection, filtro: any, update: any, opciones: any = {}, uno = true) {
  const leer = (f: any, proy: Record<string, 1>, solo1: boolean) => {
    const c = coleccion.find(f, { projection: proy });
    return (solo1 ? c.limit(1) : c).toArray();
  };
  const t = camposTocados(update);
  return auditarAlrededor(leer, filtro, t, uno, () => (uno ? coleccion.updateOne(filtro, update, opciones) : coleccion.updateMany(filtro, update, opciones)), uno ? "crudo:updateOne" : "crudo:updateMany");
}

const pendientes = new WeakMap<object, { antes: any[]; proy: Record<string, 1>; t: CamposTocados; filtro: any }>();

export function instalarAuditoriaDeContratos(schema: Schema): void {
  // ---- save: el crudo al cargar es el «antes» (referencia, sin copiar: Mongoose arma sus propios subdocumentos).
  schema.pre("init", function (this: any, crudo: any) {
    this.$locals.contratosAlCargar = crudo && "contracts" in crudo ? crudo.contracts || [] : undefined;
  });
  schema.pre("save", function (this: any) {
    if (!this.isNew && !this.isModified("contracts")) {
      this.$locals.auditoriaPendiente = null;
      return;
    }
    const despues = this.toObject({ depopulate: true, virtuals: false }).contracts || [];
    const antes = this.isNew ? [] : this.$locals.contratosAlCargar;
    this.$locals.auditoriaPendiente = diferenciasDeContratos(antes === undefined ? null : antes, despues);
    this.$locals.contratosDespues = despues;
  });
  schema.post("save", async function (this: any) {
    const eventos = this.$locals.auditoriaPendiente;
    this.$locals.auditoriaPendiente = null;
    if (this.$locals.contratosDespues) this.$locals.contratosAlCargar = this.$locals.contratosDespues;
    if (eventos?.length) await registrarEventos(this, eventos, "save");
  });

  // ---- updates por query.
  const leerConModelo = (modelo: any, sort?: any) => (filtro: any, proy: Record<string, 1>, uno: boolean) => {
    let q = modelo.find(filtro).select(proy).lean();
    if (uno) q = q.sort(sort || {}).limit(1);
    return q.exec();
  };
  const operaciones = ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne"] as const;
  schema.pre(operaciones as any, { document: false, query: true }, async function (this: any) {
    const t = camposTocados(this.getUpdate(), this.op === "replaceOne");
    if (!t.toca) return;
    const proy = proyeccionPara(t);
    const filtro = this.getFilter();
    const antes = await leerConModelo(this.model, this.getOptions()?.sort)(filtro, proy, this.op !== "updateMany");
    pendientes.set(this, { antes, proy, t, filtro });
  });
  schema.post(operaciones as any, { document: false, query: true }, async function (this: any) {
    const p = pendientes.get(this);
    if (!p) return;
    pendientes.delete(this);
    const leer = leerConModelo(this.model);
    const ids = p.antes.map((d) => d._id);
    const despues = ids.length ? await leer({ _id: { $in: ids } }, p.proy, false) : this.getOptions()?.upsert ? await leer(p.filtro, p.proy, true) : [];
    const porId = new Map(despues.map((d: any) => [String(d._id), d]));
    const campos = p.t.todo ? undefined : p.t.campos;
    const lista = p.antes.map((a) => {
      const d: any = porId.get(String(a._id));
      return { vinculo: a, eventos: diferenciasDeContratos(a.contracts || [], d ? d.contracts || [] : [], { campos }) };
    });
    if (!ids.length) for (const d of despues as any[]) lista.push({ vinculo: d, eventos: diferenciasDeContratos([], d.contracts || [], { campos }) });
    await registrarEventosDeVarios(lista, this.op);
  });

  // ---- borrados del vínculo: todos sus contratos quedan quitados.
  const borrados = ["deleteOne", "deleteMany", "findOneAndDelete"] as const;
  const proyBorrado = proyeccionPara({ toca: true, todo: false, campos: [] });
  schema.pre(borrados as any, { document: false, query: true }, async function (this: any) {
    const antes = await leerConModelo(this.model, this.getOptions()?.sort)(this.getFilter(), proyBorrado, this.op !== "deleteMany");
    if (antes.length) pendientes.set(this, { antes, proy: proyBorrado, t: { toca: true, todo: false, campos: [] }, filtro: this.getFilter() });
  });
  schema.post(borrados as any, { document: false, query: true }, async function (this: any) {
    const p = pendientes.get(this);
    if (!p) return;
    pendientes.delete(this);
    const quedan = new Set((await leerConModelo(this.model)({ _id: { $in: p.antes.map((d) => d._id) } }, { _id: 1 } as any, false)).map((d: any) => String(d._id)));
    const lista = p.antes.filter((a) => !quedan.has(String(a._id))).map((a) => ({ vinculo: a, eventos: diferenciasDeContratos(a.contracts || [], null, { motivoQuitado: "vínculo eliminado" }) }));
    await registrarEventosDeVarios(lista, this.op);
  });
}

