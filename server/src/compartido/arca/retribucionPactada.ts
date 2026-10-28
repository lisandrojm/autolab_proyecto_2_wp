/**
 * LA RETRIBUCIÓN PACTADA (pos. 58-72 del TXT de alta, y la remuneración del registro de 85) SEGÚN LA
 * MODALIDAD DE LIQUIDACIÓN (28/10/2026). Cada modalidad dice qué importe del contrato se declara: una
 * liquidación por DÍA declara el importe por jornada, una por MES el mensual, etc.
 *
 * Sin elegir (`""`) se declara lo de siempre: el sueldo bruto mensual de la escala de la categoría. Así
 * ninguna modalidad cambia lo que se presenta hasta que alguien lo configure.
 *
 * Los importes se derivan del contrato con las mismas cuentas que muestra Configurar Miembro
 * (`compartido/jornadas.ts`): la jornada bruta pactada es la base; el neto es × neto/bruto de la escala.
 * Sin dependencias: lo usan el front (`@compartido`), el generador del TXT y el validador del lote.
 */
import { mesesEquivalentes, periodoDeCalculo } from "../jornadas.js";

export const CAMPOS_RETRIBUCION = [
  { value: "jornada_neto", label: "Importe por jornada neto" },
  { value: "jornada_bruto", label: "Importe por jornada bruto" },
  { value: "semana_neto", label: "Importe por semana neto" },
  { value: "semana_bruto", label: "Importe por semana bruto" },
  { value: "mensual_neto", label: "Importe mensual neto" },
  { value: "mensual_bruto", label: "Importe mensual bruto" },
  { value: "total_neto", label: "Importe total del contrato neto" },
  { value: "sueldo_diario_neto", label: "Sueldo diario neto" },
  { value: "sueldo_bruto", label: "Sueldo bruto" },
  { value: "sueldo_neto", label: "Sueldo neto" },
] as const;

export type CampoRetribucion = (typeof CAMPOS_RETRIBUCION)[number]["value"];

export const TEXTO_SIN_CAMPO = "Sueldo bruto de la escala (categoría)";

export const esCampoRetribucion = (v: unknown): v is CampoRetribucion => CAMPOS_RETRIBUCION.some((c) => c.value === v);

export const rotuloCampoRetribucion = (v: unknown): string => CAMPOS_RETRIBUCION.find((c) => c.value === v)?.label ?? TEXTO_SIN_CAMPO;

/** Lo que hace falta del contrato (`UserProject.contracts[i]` o la fila de Contratos). */
export interface ContratoParaRetribucion {
  sueldo_jornada?: number | string | null;
  sueldo_bruto?: number | string | null;
  sueldo_neto?: number | string | null;
  sueldo_diario_neto?: number | string | null;
  cantidad_jornadas_laborales?: number | string | null;
  dias_semana?: number[] | null;
  dias_por_semana?: number | string | null;
  dias_rotativos?: boolean | null;
  fechas_trabajadas?: string[] | null;
  fecha_alta_contrato?: string | null;
  fecha_baja_contrato?: string | null;
}

export interface ContextoRetribucion {
  /** Del tipo de contrato: `data.cantidadJornadas`, `data.diasPorSemana`, `data.esTiempoIndeterminado`. */
  tipo?: { cantidadJornadas?: number | null; diasPorSemana?: number | null; esTiempoIndeterminado?: boolean | null } | null;
  /** La escala de la categoría: `sueldoBruto` y `neto` dan la proporción neto/bruto. */
  escala?: { sueldoBruto?: number | null; neto?: number | null } | null;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * El importe del contrato que pide `campo`. `null` si no se puede calcular (falta la jornada, o el
 * período para el mensual): el checklist lo muestra como faltante en vez de declarar un 0.
 */
export function importeDelContrato(campo: CampoRetribucion, c: ContratoParaRetribucion, ctx: ContextoRetribucion = {}): number | null {
  const jornada = num(c.sueldo_jornada);
  const jornadas = num(c.cantidad_jornadas_laborales);
  // Neto/bruto de la escala (0,81 en el 634/11); sin escala, el que guardó el contrato; si no, 1 (servicios).
  const bruto = num(ctx.escala?.sueldoBruto);
  const neto = num(ctx.escala?.neto);
  const prop = bruto > 0 && neto > 0 ? neto / bruto : jornada > 0 && num(c.sueldo_diario_neto) > 0 ? num(c.sueldo_diario_neto) / jornada : 1;

  const diasTipo = num(ctx.tipo?.diasPorSemana);
  const dias = Array.isArray(c.dias_semana) ? c.dias_semana : [];
  const diasPorSemana = diasTipo > 0 ? diasTipo : c.dias_rotativos ? num(c.dias_por_semana) : dias.length;

  const mensualBruto = (): number | null => {
    const jornadasTipo = num(ctx.tipo?.cantidadJornadas);
    if (jornada <= 0) return null;
    if (jornadasTipo > 0) return jornada * jornadasTipo;
    const p = periodoDeCalculo(c.fecha_alta_contrato || "", c.fecha_baja_contrato || "", !!ctx.tipo?.esTiempoIndeterminado);
    const meses = mesesEquivalentes(p.desde, p.hasta, dias, c.fechas_trabajadas || undefined);
    return meses > 0 && jornadas > 0 ? (jornada * jornadas) / meses : null;
  };

  let valor: number | null;
  switch (campo) {
    case "jornada_bruto":
      valor = jornada > 0 ? jornada : null;
      break;
    case "jornada_neto":
      valor = jornada > 0 ? jornada * prop : null;
      break;
    case "semana_bruto":
      valor = jornada > 0 && diasPorSemana > 0 ? jornada * diasPorSemana : null;
      break;
    case "semana_neto":
      valor = jornada > 0 && diasPorSemana > 0 ? jornada * diasPorSemana * prop : null;
      break;
    case "mensual_bruto":
      valor = mensualBruto();
      break;
    case "mensual_neto": {
      const m = mensualBruto();
      valor = m === null ? null : m * prop;
      break;
    }
    case "total_neto":
      valor = num(c.sueldo_neto) > 0 ? num(c.sueldo_neto) : jornada > 0 && jornadas > 0 ? jornada * jornadas * prop : null;
      break;
    case "sueldo_diario_neto":
      valor = num(c.sueldo_diario_neto) > 0 ? num(c.sueldo_diario_neto) : null;
      break;
    case "sueldo_bruto":
      valor = num(c.sueldo_bruto) > 0 ? num(c.sueldo_bruto) : null;
      break;
    case "sueldo_neto":
      valor = num(c.sueldo_neto) > 0 ? num(c.sueldo_neto) : null;
      break;
    default:
      valor = null;
  }
  return valor === null ? null : r2(valor);
}

/** Qué campo usa la modalidad de liquidación con este código (1 díg.). `""` = el de la escala. */
export function campoDeModalidad(codigo: string | null | undefined, modalidades: Array<{ externalId?: string | null; retribucionPactada?: string | null }> | null | undefined): CampoRetribucion | "" {
  const k = String(codigo ?? "").replace(/\D/g, "");
  if (!k) return "";
  const m = (modalidades || []).find((x) => String(x.externalId ?? "").replace(/\D/g, "") === k);
  return esCampoRetribucion(m?.retribucionPactada) ? m!.retribucionPactada as CampoRetribucion : "";
}

/**
 * LA RETRIBUCIÓN QUE SE DECLARA: el importe del contrato que pide la modalidad o, si no pide ninguno,
 * el bruto de la escala. `origen` dice de dónde salió, para explicarlo en el checklist.
 */
export function retribucionPactada(campo: CampoRetribucion | "", c: ContratoParaRetribucion, ctx: ContextoRetribucion = {}): { valor: number; origen: "escala" | CampoRetribucion } {
  if (!campo) return { valor: num(ctx.escala?.sueldoBruto), origen: "escala" };
  return { valor: importeDelContrato(campo, c, ctx) ?? 0, origen: campo };
}
