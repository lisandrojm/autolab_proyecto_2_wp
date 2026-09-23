import { Types } from "mongoose";

import { EscalaPeriodo, IEscalaPeriodo } from "../models/EscalaPeriodo.js";
import { AdicionalConvenio } from "../models/AdicionalConvenio.js";
import { AdicionalValorPeriodo } from "../models/AdicionalValorPeriodo.js";
import { EscalaPequenasEmpresas } from "../models/EscalaPequenasEmpresas.js";
import { ConvenioGrupo } from "../models/ConvenioGrupo.js";
import { numeroALetras } from "../utils/numeroALetras.js";
import { calcularEscalaGrupo, compararConActa, redondearCentavos, ValoresDelActa, DiferenciaEscala } from "../utils/escalaCalculo.js";
import { aIsoFecha, diaAnterior, periodoVigente, periodosSuperpuestos, rigeEn } from "../utils/escalaAFecha.js";
import { AdicionalVigente } from "../utils/liquidacionReferencia.js";

/**
 * LO QUE COMPARTEN LAS RUTAS Y LOS SCRIPTS DE CARGA.
 *
 * Las cuentas puras están en `utils/escalaCalculo`, `utils/escalaAFecha` y `utils/aplicarParitaria`, con sus
 * tests. Acá vive lo que necesita la base: armar un período con sus importes efectivos, validar que no se
 * pise con otro, resolver qué rige a una fecha, y ESPEJAR el vigente en `ConvenioGrupo`.
 *
 * Está en un servicio y no en la ruta porque los scripts de seed cargan exactamente lo mismo. Dos copias de
 * "cómo se arma un período" se desalinean, y la que corre por script es la que escribe doce grupos de una vez.
 */

export class DatoDeEscalaInvalido extends Error {}

export interface DatosDePeriodo {
  convenio: string;
  grupo?: number | null;
  grupoId?: Types.ObjectId | string | null;
  categoriaId?: Types.ObjectId | string | null;
  desde: string;
  hasta?: string | null;
  basico: number;
  adicionalPct?: number | null;
  presentismoPct?: number | null;
  netoFactor?: number | null;
  /** Lo que publica el acta. Lo que venga acá GANA sobre la cuenta. */
  acta?: ValoresDelActa;
  totalLetras?: string;
  netoLetras?: string;
  acuerdoId?: Types.ObjectId | string | null;
  tramo?: string;
  origen?: IEscalaPeriodo["origen"];
  migracion?: string;
  nota?: string;
  createdBy?: Types.ObjectId | string | null;
}

/**
 * Los campos de un período, listos para `create` o `updateOne`.
 *
 * La regla del acta: si el acta publica un importe, ése es el que rige y la cuenta queda en `diferencias`.
 * Si no lo publica, rige el calculado. Nunca al revés — el sueldo que se paga es el del acta, incluso
 * cuando el acta se equivoca en un centavo.
 */
export function armarPeriodo(d: DatosDePeriodo): Record<string, any> {
  const desde = aIsoFecha(d.desde);
  if (!desde) throw new DatoDeEscalaInvalido("La fecha de inicio de vigencia es obligatoria (formato AAAA-MM-DD).");
  const hasta = d.hasta ? aIsoFecha(d.hasta) : "";
  if (d.hasta && !hasta) throw new DatoDeEscalaInvalido("La fecha de fin de vigencia no se entiende (formato AAAA-MM-DD).");
  if (hasta && hasta < desde) throw new DatoDeEscalaInvalido(`La vigencia termina (${hasta}) antes de empezar (${desde}).`);
  const basico = Number(d.basico || 0);
  if (!(basico > 0)) throw new DatoDeEscalaInvalido("El básico tiene que ser mayor que cero: una escala en cero no es una escala, es un dato sin cargar.");

  const calculada = calcularEscalaGrupo({ basico, adicionalPct: d.adicionalPct, presentismoPct: d.presentismoPct, netoFactor: d.netoFactor });
  const acta: ValoresDelActa = {
    adicionalMonto: d.acta?.adicionalMonto ?? null,
    presentismoMonto: d.acta?.presentismoMonto ?? null,
    total: d.acta?.total ?? null,
    neto: d.acta?.neto ?? null,
  };
  const diferencias: DiferenciaEscala[] = compararConActa(calculada, acta);

  const rige = (delActa: number | null | undefined, calculado: number) => (delActa == null ? calculado : redondearCentavos(Number(delActa)));
  const total = rige(acta.total, calculada.total);
  const neto = rige(acta.neto, calculada.netoSugerido);

  return {
    convenio: String(d.convenio || "").trim(),
    grupo: d.grupo ?? null,
    grupoId: d.grupoId ? new Types.ObjectId(String(d.grupoId)) : null,
    categoriaId: d.categoriaId ? new Types.ObjectId(String(d.categoriaId)) : null,
    desde: new Date(`${desde}T00:00:00.000Z`),
    hasta: hasta ? new Date(`${hasta}T00:00:00.000Z`) : null,
    basico: redondearCentavos(basico),
    adicionalPct: d.adicionalPct ?? null,
    presentismoPct: d.presentismoPct ?? calculada.presentismoPct,
    netoFactor: d.netoFactor ?? null,
    adicionalMonto: rige(acta.adicionalMonto, calculada.adicionalMonto),
    presentismoMonto: rige(acta.presentismoMonto, calculada.presentismoMonto),
    total,
    neto,
    // Las letras las usa el PDF del alta. Si no vienen, se generan: después de una paritaria, las viejas
    // dicen un importe que ya no es. (El formato de las cargadas por FRAME trae "CON", éste no; es cosmético.)
    totalLetras: d.totalLetras ?? numeroALetras(total),
    netoLetras: d.netoLetras ?? numeroALetras(neto),
    actaAdicionalMonto: acta.adicionalMonto,
    actaPresentismoMonto: acta.presentismoMonto,
    actaTotal: acta.total,
    actaNeto: acta.neto,
    diferencias,
    acuerdoId: d.acuerdoId ? new Types.ObjectId(String(d.acuerdoId)) : null,
    tramo: d.tramo ?? "",
    origen: d.origen ?? "manual",
    migracion: d.migracion ?? "",
    nota: d.nota ?? "",
    createdBy: d.createdBy ? new Types.ObjectId(String(d.createdBy)) : null,
  };
}

/**
 * Que el período nuevo no comparta ningún día con otro del mismo grupo.
 *
 * Devuelve el mensaje de error o `null`. No lanza, porque quien llama decide: la ruta responde 409 y el
 * script de carga lo saltea y lo informa al final.
 */
export async function motivoDeSuperposicion(convenio: string, grupo: number | null, desde: string, hasta: string | null, excluirId?: string): Promise<string | null> {
  const existentes = await EscalaPeriodo.find({ convenio, grupo: grupo ?? null }).select("desde hasta").lean();
  const otros = existentes.filter((p: any) => String(p._id) !== String(excluirId || ""));
  const choques = periodosSuperpuestos([...otros, { desde, hasta }]);
  if (!choques.length) return null;
  const nuevo = choques.find((c) => aIsoFecha(c.b.desde) === aIsoFecha(desde) || aIsoFecha(c.a.desde) === aIsoFecha(desde)) || choques[0];
  return `La vigencia se superpone con el período que arranca el ${aIsoFecha(nuevo.a.desde) || "?"} (comparten el ${nuevo.desde}). Cerrá el anterior antes de abrir el nuevo.`;
}

/**
 * Cierra el período que estaba abierto para dejar entrar al nuevo: su `hasta` pasa a ser el día anterior.
 *
 * Es el paso que evita dos escalas vigentes el mismo día. Sólo toca los que NO declaran `hasta` —los que ya
 * tienen vencimiento los puso alguien a propósito y pisarlos sería cambiar un dato cargado a mano.
 */
export async function cerrarPeriodosAbiertos(convenio: string, grupo: number | null, desdeDelNuevo: string): Promise<number> {
  const corte = diaAnterior(desdeDelNuevo);
  if (!corte) return 0;
  const r = await EscalaPeriodo.updateMany(
    { convenio, grupo: grupo ?? null, hasta: null, desde: { $lt: new Date(`${desdeDelNuevo}T00:00:00.000Z`) } },
    { $set: { hasta: new Date(`${corte}T00:00:00.000Z`) } }
  );
  return r.modifiedCount || 0;
}

export interface ResultadoEspejo {
  grupo: number | null;
  espejado: boolean;
  motivo?: string;
}

/**
 * COPIA EL PERÍODO VIGENTE A `ConvenioGrupo`, que es lo que lee todo el resto del sistema.
 *
 * Sin esto, aplicar una paritaria no cambiaría nada en los contratos, ni en los PDFs, ni en el TXT de ARCA:
 * esas pantallas leen el grupo, no el historial. Con esto, la escala versionada es la fuente y el grupo es
 * la foto de lo vigente.
 *
 * Dos cosas que NO hace, a propósito:
 *  - No crea grupos que no existan. Un grupo nuevo se da de alta en su ABM; inventarlo acá haría que un
 *    período mal cargado creara estructura.
 *  - Si a `hoy` no rige ningún período, no toca nada. Borrar la escala vigente porque el historial no llega
 *    hasta hoy sería destruir el único importe que hay.
 */
export async function espejarVigenteEnGrupo(convenio: string, grupo: number | null, hoy: string): Promise<ResultadoEspejo> {
  if (grupo == null) return { grupo, espejado: false, motivo: "El convenio no usa grupos: no hay dónde espejar." };
  const periodos = await EscalaPeriodo.find({ convenio, grupo }).lean();
  const vigente = periodoVigente(periodos as any[], hoy);
  if (!vigente) return { grupo, espejado: false, motivo: `Ningún período rige al ${hoy}: la escala del grupo queda como está.` };

  const destino = await ConvenioGrupo.findOne({ convenio, numero: grupo }).select("_id");
  if (!destino) return { grupo, espejado: false, motivo: `El convenio ${convenio} no tiene cargado el grupo ${grupo}.` };

  await ConvenioGrupo.updateOne(
    { _id: destino._id },
    {
      $set: {
        sueldoBasico: vigente.basico,
        sueldoAdicional: vigente.adicionalMonto,
        presentismo: vigente.presentismoMonto,
        sueldoBruto: vigente.total,
        neto: vigente.neto ?? 0,
        sueldoBrutoLetras: vigente.totalLetras || "",
        sueldoNetoLetras: vigente.netoLetras || "",
        fechaActualizacion: aIsoFecha(vigente.desde),
        // Se espeja también el fin de vigencia: es lo que alimenta el aviso de "escala vencida", y dejarlo
        // con el valor viejo es exactamente el bug que hoy marca vencidos a los 12 grupos de 0634/11.
        vigenciaHasta: aIsoFecha(vigente.hasta) || "",
      },
    }
  );
  return { grupo, espejado: true };
}

/** La escala de todos los grupos del convenio a una fecha, ordenada por grupo. */
export async function escalaDelConvenioAFecha(convenio: string, fecha: string): Promise<IEscalaPeriodo[]> {
  const periodos = await EscalaPeriodo.find({ convenio }).lean();
  const porGrupo = new Map<string, any[]>();
  for (const p of periodos as any[]) {
    const k = String(p.grupo ?? "");
    porGrupo.set(k, [...(porGrupo.get(k) || []), p]);
  }
  const out: any[] = [];
  for (const lista of porGrupo.values()) {
    const vigente = periodoVigente(lista, fecha);
    if (vigente) out.push(vigente);
  }
  return out.sort((a, b) => Number(a.grupo ?? 0) - Number(b.grupo ?? 0)) as IEscalaPeriodo[];
}

export interface AdicionalConValor extends AdicionalVigente {
  _id: string;
  capitulo: "general" | "pequenas_empresas";
  orden: number;
  condicion?: string;
  /** Desde cuándo rige el importe que se está mostrando. Vacío = no hay valor para esa fecha. */
  valorDesde?: string;
  valorHasta?: string;
  valorId?: string;
}

/**
 * Los adicionales del convenio con el importe que rige a esa fecha.
 *
 * Los que no tienen valor para la fecha se devuelven igual, con `monto: null`. Esconderlos sería peor:
 * "Guardería sin importe cargado para mayo" es información, y desaparecer de la lista no lo es.
 */
export async function adicionalesAFecha(convenio: string, fecha: string, capitulo?: "general" | "pequenas_empresas"): Promise<AdicionalConValor[]> {
  const filtro: Record<string, any> = { convenio, isActive: true };
  if (capitulo) filtro.capitulo = capitulo;
  const [adicionales, valores] = await Promise.all([AdicionalConvenio.find(filtro).sort({ orden: 1, nombre: 1 }).lean(), AdicionalValorPeriodo.find({ convenio }).lean()]);

  const porAdicional = new Map<string, any[]>();
  for (const v of valores as any[]) {
    const k = String(v.adicionalId);
    porAdicional.set(k, [...(porAdicional.get(k) || []), v]);
  }

  return (adicionales as any[]).map((a) => {
    const vigente = periodoVigente(porAdicional.get(String(a._id)) || [], fecha);
    return {
      _id: String(a._id),
      codigo: a.codigo,
      nombre: a.nombre,
      tipoCalculo: a.tipoCalculo,
      remunerativo: a.remunerativo ?? null,
      confirmado: a.confirmado === true,
      base: a.base ?? null,
      unidad: a.unidad || "",
      condicion: a.condicion || "",
      capitulo: a.capitulo,
      orden: Number(a.orden || 0),
      monto: vigente?.monto ?? null,
      porcentaje: vigente?.porcentaje ?? null,
      valorId: vigente ? String(vigente._id) : undefined,
      valorDesde: vigente ? aIsoFecha(vigente.desde) : "",
      valorHasta: vigente ? aIsoFecha(vigente.hasta) : "",
    };
  });
}

/** El capítulo de pequeñas empresas a una fecha, por grupo. */
export async function pequenasEmpresasAFecha(convenio: string, fecha: string) {
  const filas = await EscalaPequenasEmpresas.find({ convenio }).lean();
  const porGrupo = new Map<number, any[]>();
  for (const f of filas as any[]) porGrupo.set(f.grupo, [...(porGrupo.get(f.grupo) || []), f]);
  const out: any[] = [];
  for (const lista of porGrupo.values()) {
    const vigente = periodoVigente(lista, fecha);
    if (vigente) out.push(vigente);
  }
  return out.sort((a, b) => a.grupo - b.grupo);
}

/**
 * La jornada adicional tendría que ser la semana ÷ 5. Devuelve el desvío, o `null` si cierra.
 *
 * No bloquea el guardado: el importe que se paga es el del acta. Es un aviso para que un número tipeado mal
 * se vea al cargarlo y no tres meses después.
 */
export function desvioJornadaAdicional(semana: number, jornada: number): number | null {
  const esperada = redondearCentavos(Number(semana || 0) / 5);
  const delta = redondearCentavos(Number(jornada || 0) - esperada);
  return Math.abs(delta) < 0.01 ? null : delta;
}

/** `true` si ese período rige hoy: lo usa la ruta para decidir si hay que espejar después de guardar. */
export const esElVigente = (periodo: { desde?: any; hasta?: any }, hoy: string): boolean => rigeEn(periodo, hoy);
