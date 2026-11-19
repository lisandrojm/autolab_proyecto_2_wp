/**
 * EL ESTADO SE PONE AL GUARDAR (etapa 3, 19/11/2026).
 *
 * Todo lo que crea o reemplaza un contrato con `save()` (el wizard, las solicitudes, el import…) lo deja
 * sin `estadoContrato`: el wizard arma el contrato entero de nuevo. En vez de que cada ruta se acuerde,
 * el modelo lo calcula antes de guardar con la misma regla de la migración (`estadoSegunDatosLocales`:
 * alta, baja y si el tipo es de tiempo indeterminado; lo indecidible queda SIN_DETERMINAR, nunca VIGENTE
 * por defecto).
 *
 * Cuándo lo calcula, por contrato (no anulado):
 *  - no tiene estado (nuevo, o reemplazado por el wizard);
 *  - cambió su alta, su baja o su tipo respecto de cómo se cargó (comparado por `contratoKey`).
 * Un contrato que no se tocó conserva su estado, aunque el calendario haya avanzado: eso lo hace la
 * transición diaria, en un solo sentido (`transicionEstadoContratos.ts`).
 *
 * Las escrituras por `updateOne` no pasan por acá; las que tocan fechas ya ponen el estado (las bajas de
 * ARCA) y lo que quede sin estado lo completa la tarea diaria y lo marca el reporte.
 */
import type { Schema } from "mongoose";
import { Contrato } from "../models/Contrato.js";
import { hoyArgentina, fechaISO } from "../utils/contratoVigencia.js";
import { estadoSegunDatosLocales, tipoEsIndeterminado } from "../utils/estadoDeContrato.js";

let cache: { el: number; porId: Map<string, boolean>; porNombre: Map<string, boolean> } | null = null;
const VIDA_MS = 5 * 60 * 1000;

/** El catálogo de tipos (¿es de tiempo indeterminado?), cacheado unos minutos. */
export async function catalogoDeTipos(): Promise<{ porId: Map<string, boolean>; porNombre: Map<string, boolean> }> {
  if (cache && Date.now() - cache.el < VIDA_MS) return cache;
  const tipos: any[] = await Contrato.find({}).select("name data.esTiempoIndeterminado").lean();
  cache = {
    el: Date.now(),
    porId: new Map(tipos.map((t) => [String(t._id), !!t.data?.esTiempoIndeterminado])),
    porNombre: new Map(tipos.map((t) => [String(t.name || "").trim().toLowerCase(), !!t.data?.esTiempoIndeterminado])),
  };
  return cache;
}

const dia = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : fechaISO(v as any));
const huellaDeEstado = (c: any) => `${dia(c?.fecha_alta_contrato)}|${dia(c?.fecha_baja_contrato)}|${String(c?.contrato_id || "")}|${String(c?.nombre_contrato || "").trim().toLowerCase()}`;

/** ¿Hay que (re)calcular el estado de este contrato? Puro. `previo` = como estaba al cargar (por clave). */
export function hayQueCalcularEstado(c: any, previo: any | undefined): boolean {
  if (!c || c.estadoContrato === "ANULADO") return false;
  if (!c.estadoContrato) return true;
  return !!previo && huellaDeEstado(previo) !== huellaDeEstado(c);
}

export function instalarEstadoAlGuardar(schema: Schema): void {
  schema.pre("validate", async function (this: any) {
    if (!this.isNew && !this.isModified("contracts")) return;
    const contratos: any[] = this.contracts || [];
    const alCargar: any[] = this.$locals?.contratosAlCargar || [];
    const previoPorClave = new Map(alCargar.filter((c) => c?.contratoKey).map((c) => [String(c.contratoKey), c]));
    const pendientes = contratos.filter((c) => hayQueCalcularEstado(c, c?.contratoKey ? previoPorClave.get(String(c.contratoKey)) : undefined));
    if (!pendientes.length) return;
    const { porId, porNombre } = await catalogoDeTipos();
    const hoy = hoyArgentina();
    for (const c of pendientes) {
      const r = estadoSegunDatosLocales(c, tipoEsIndeterminado(c, porId, porNombre), hoy);
      c.estadoContrato = r.estado;
      c.estadoContratoMotivo = r.motivo || undefined;
    }
  });
}
