import { Types } from "mongoose";
import { RelacionLaboralArca, type OrigenRelacionArca } from "../../models/RelacionLaboralArca.js";
import { AntiguedadArca } from "../../models/AntiguedadArca.js";
import type { RelacionLaboralTxt } from "../../compartido/arca/relacionesLaboralesTxt.js";
import { aplicaBaja, ganaLaNueva, unaPorClave, type ModoCarga } from "../../utils/versionRelacionArca.js";
import { antiguedadesDe, type RelacionParaAntiguedad } from "../../utils/antiguedadArca.js";
import { textoAntiguedad, type AntiguedadArcaResumen } from "../../compartido/antiguedadTexto.js";

/**
 * LA PERSISTENCIA DE LAS RELACIONES LABORALES DE ARCA Y DE LA ANTIGÜEDAD. Lo único que toca Mongo
 * en este módulo; las decisiones (qué versión gana, cuánto suma la antigüedad) están en
 * `utils/versionRelacionArca.ts` y `utils/antiguedadArca.ts`, puras y con tests.
 *
 * `guardarRelaciones` es idempotente: escribe por la clave natural (tenant, empleadora, CUIL,
 * fecha de inicio), no escribe lo que ya está igual, y correrlo N veces sobre los mismos TXT
 * deja la base igual que una vez. Se lee lo existente en UNA consulta por lote y se escribe con
 * UN `bulkWrite`: con ~90 KB/s desde Atlas (ver memoria «Latencia = bytes»), ida y vuelta por
 * fila serían veinte minutos para el seed.
 */

/** "2021-03-31" → medianoche UTC de ese día. Las fechas del TXT no tienen hora. */
export const fechaUtc = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
export const isoDe = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

export interface ResultadoGuardado {
  nuevas: number;
  actualizadas: number;
  /** De las actualizadas, cuántas cerraron una relación que estaba abierta. */
  bajasAplicadas: number;
  sinCambios: number;
  /** Versiones que llegaron pero perdieron contra la guardada (sólo en seed). */
  conservadas: number;
  /** Los CUIL cuyas filas se escribieron: son los que hay que recalcular. */
  cuilsTocados: Set<string>;
}

/** Los campos que se comparan para saber si una fila cambió (todo menos la clave y la auditoría). */
const CAMPOS_CONTENIDO = ["apellidoNombre", "obraSocial", "modalidadContrato", "actividadLaboral", "puestoDesempenado", "retribucionPactada", "modLiquidacion", "trabajadorAgropecuario", "situacionBaja", "convenioColectivo", "categoria", "tipoServicio"] as const;

const claveDe = (f: { cuil: string; fechaInicio: string }) => `${f.cuil}|${f.fechaInicio}`;
const LOTE_IN = 500;

function enLotes<T>(items: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

export async function guardarRelaciones(o: {
  tenantId: Types.ObjectId;
  empleadoraCuit: string;
  empleadoraCompanyId?: Types.ObjectId | null;
  filas: RelacionLaboralTxt[];
  origen: OrigenRelacionArca;
  modo: ModoCarga;
  ahora?: Date;
  /** Cuenta qué haría, sin escribir. */
  dryRun?: boolean;
}): Promise<ResultadoGuardado> {
  const ahora = o.ahora || new Date();
  const res: ResultadoGuardado = { nuevas: 0, actualizadas: 0, bajasAplicadas: 0, sinCambios: 0, conservadas: 0, cuilsTocados: new Set() };
  // Primero se resuelve dentro del propio lote: el mismo TXT puede traer dos versiones de una relación.
  const candidatas = unaPorClave<RelacionLaboralTxt>(o.filas, claveDe, o.modo);
  if (candidatas.size === 0) return res;

  const cuils = [...new Set([...candidatas.values()].map((f) => f.cuil))];
  const existentes = new Map<string, any>();
  for (const lote of enLotes(cuils, LOTE_IN)) {
    const docs: any[] = await RelacionLaboralArca.find({ tenantId: o.tenantId, empleadoraCuit: o.empleadoraCuit, cuil: { $in: lote } })
      .select(["cuil", "fechaInicio", "fechaFin", ...CAMPOS_CONTENIDO].join(" "))
      .lean();
    for (const d of docs) existentes.set(claveDe({ cuil: d.cuil, fechaInicio: isoDe(d.fechaInicio)! }), d);
  }

  const ops: any[] = [];
  for (const [k, f] of candidatas) {
    const existente = existentes.get(k);
    const version = existente ? { fechaFin: isoDe(existente.fechaFin) } : null;
    if (version && !ganaLaNueva(version, f, o.modo)) { res.conservadas++; continue; }
    if (version) {
      const igual = isoDe(existente.fechaFin) === f.fechaFin && CAMPOS_CONTENIDO.every((c) => (existente[c] ?? null) === (f[c] ?? null) || (existente[c] === "" && f[c] === null));
      if (igual) { res.sinCambios++; continue; }
      res.actualizadas++;
      if (aplicaBaja(version, f)) res.bajasAplicadas++;
    } else {
      res.nuevas++;
    }
    res.cuilsTocados.add(f.cuil);
    const set: Record<string, unknown> = {
      empleadoraCompanyId: o.empleadoraCompanyId ?? null,
      fechaFin: f.fechaFin ? fechaUtc(f.fechaFin) : null,
      origen: o.origen,
      sincronizadoEl: ahora,
      rawLinea: f.rawLinea,
    };
    for (const c of CAMPOS_CONTENIDO) set[c] = f[c];
    ops.push({
      updateOne: {
        filter: { tenantId: o.tenantId, empleadoraCuit: o.empleadoraCuit, cuil: f.cuil, fechaInicio: fechaUtc(f.fechaInicio) },
        update: { $set: set },
        upsert: true,
      },
    });
  }
  if (!o.dryRun && ops.length) await RelacionLaboralArca.bulkWrite(ops, { ordered: false });
  return res;
}

/**
 * Recalcula `AntiguedadArca` para esos CUIL (una fila por empleadora + la global), con el «hoy» que
 * se le pasa. Devuelve cuántas filas escribió. Si un CUIL ya no tiene relaciones, borra sus filas.
 */
export async function recalcularAntiguedad(tenantId: Types.ObjectId, cuils: Iterable<string>, hoy: string, dryRun = false): Promise<number> {
  const lista = [...new Set(cuils)];
  let escritas = 0;
  const calculadoEl = new Date();
  for (const lote of enLotes(lista, LOTE_IN)) {
    const docs: any[] = await RelacionLaboralArca.find({ tenantId, cuil: { $in: lote } }).select("cuil empleadoraCuit fechaInicio fechaFin apellidoNombre").lean();
    const porCuil = new Map<string, RelacionParaAntiguedad[]>();
    for (const d of docs) {
      if (!porCuil.has(d.cuil)) porCuil.set(d.cuil, []);
      porCuil.get(d.cuil)!.push({ empleadoraCuit: d.empleadoraCuit, fechaInicio: isoDe(d.fechaInicio)!, fechaFin: isoDe(d.fechaFin), apellidoNombre: d.apellidoNombre });
    }
    const ops: any[] = [];
    for (const cuil of lote) {
      const relaciones = porCuil.get(cuil) || [];
      if (relaciones.length === 0) { ops.push({ deleteMany: { filter: { tenantId, cuil } } }); continue; }
      const filas = antiguedadesDe(relaciones, hoy);
      // Empleadoras que la persona ya no tiene (no debería pasar: las relaciones no se borran) se limpian igual.
      ops.push({ deleteMany: { filter: { tenantId, cuil, empleadoraCuit: { $nin: filas.map((f) => f.empleadoraCuit) } } } });
      for (const { empleadoraCuit, metricas: m } of filas) {
        ops.push({
          updateOne: {
            filter: { tenantId, cuil, empleadoraCuit },
            update: {
              $set: {
                apellidoNombre: m.apellidoNombre,
                primeraAlta: fechaUtc(m.primeraAlta),
                ultimaFecha: fechaUtc(m.ultimaFecha),
                antiguedadDesdePrimeraAlta: m.antiguedadDesdePrimeraAlta,
                diasTrabajados: m.diasTrabajados,
                aniosTrabajados: m.aniosTrabajados,
                cantidadContratos: m.cantidadContratos,
                tieneRelacionAbierta: m.tieneRelacionAbierta,
                empresas: m.empresas,
                calculadoEl,
              },
            },
            upsert: true,
          },
        });
        escritas++;
      }
    }
    if (!dryRun && ops.length) await AntiguedadArca.bulkWrite(ops, { ordered: false });
  }
  return escritas;
}

/**
 * La antigüedad según ARCA de un conjunto de personas, por CUIL (fila global: todas las empleadoras),
 * lista para viajar a una pantalla. Quien no está en ARCA no aparece en el mapa. Una sola consulta.
 */
export async function antiguedadArcaPorCuil(tenantId: Types.ObjectId, cuils: Iterable<string>): Promise<Map<string, AntiguedadArcaResumen>> {
  const lista = [...new Set([...cuils].map((c) => String(c || "").replace(/\D/g, "")).filter((c) => c.length === 11))];
  const out = new Map<string, AntiguedadArcaResumen>();
  for (const lote of enLotes(lista, LOTE_IN)) {
    const filas: any[] = await AntiguedadArca.find({ tenantId, empleadoraCuit: null, cuil: { $in: lote } })
      .select("cuil primeraAlta ultimaFecha diasTrabajados antiguedadDesdePrimeraAlta cantidadContratos empresas tieneRelacionAbierta calculadoEl")
      .lean();
    for (const f of filas) {
      out.set(f.cuil, {
        fuente: "arca",
        diasTrabajados: f.diasTrabajados,
        texto: textoAntiguedad(f.diasTrabajados),
        primeraAlta: isoDe(f.primeraAlta),
        ultimaFecha: isoDe(f.ultimaFecha),
        antiguedadDesdePrimeraAlta: f.antiguedadDesdePrimeraAlta,
        cantidadContratos: f.cantidadContratos,
        empresas: f.empresas || [],
        tieneRelacionAbierta: !!f.tieneRelacionAbierta,
        calculadoEl: f.calculadoEl ? new Date(f.calculadoEl).toISOString() : null,
      });
    }
  }
  return out;
}

/**
 * Los CUIL con alguna relación abierta: su antigüedad crece un día por día, así que el sync diario
 * los recalcula aunque ARCA no haya informado nada nuevo de ellos.
 */
export async function cuilsConRelacionAbierta(tenantId: Types.ObjectId): Promise<string[]> {
  return RelacionLaboralArca.distinct("cuil", { tenantId, fechaFin: null });
}
