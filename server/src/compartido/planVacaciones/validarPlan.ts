import { diasEntre, fechaCorta, sePisan } from "./fechas.js";

/**
 * LAS REGLAS DEL PLAN, puras: reciben el plan y un contexto ya resuelto (saldos, vacaciones existentes,
 * configuración, equipo) y devuelven avisos. No consultan nada: lo que hace falta de la base lo arma el
 * server antes (`services/vacaciones/planVacaciones.ts`) y la pantalla puede reusar la función con lo
 * que ya tiene cargado para avisar antes de guardar.
 *
 * `error` frena el envío al coordinador; `aviso` se muestra y se deja decidir.
 */

export type NivelDeAviso = "error" | "aviso";

export type CodigoDeAviso =
  | "fuera_de_ventana"
  | "supera_tope"
  | "supera_saldo"
  | "se_pisa_consigo"
  | "persona_fuera_del_equipo"
  | "vacacion_existente"
  | "en_otro_plan"
  | "fraccion_minima"
  | "fraccionamiento_no_permitido"
  | "contrato_vence_antes"
  | "solapamiento_regla";

export interface Aviso {
  nivel: NivelDeAviso;
  codigo: CodigoDeAviso;
  itemId?: string;
  userId?: string;
  mensaje: string;
}

export interface ItemParaValidar {
  id: string;
  userId: string;
  desde: string;
  hasta: string;
  dias: number;
  estado: string;
}

export interface PlanParaValidar {
  ventanaDesde: string;
  ventanaHasta: string;
  topeDiasPorPersona: number;
  items: ItemParaValidar[];
}

export interface ContextoDeValidacion {
  /** Días disponibles de cada persona en el período del plan (de `saldosDeVacaciones`). */
  disponiblesDe: Record<string, number>;
  nombreDe?: Record<string, string>;
  /** Vacaciones que ya existen (pedidas por la app o de otro plan ya aprobado), no rechazadas ni canceladas. */
  vacacionesExistentes?: Record<string, Array<{ desde: string; hasta: string; estado: string }>>;
  /** Bloques de OTROS planes todavía no aprobados. */
  itemsDeOtrosPlanes?: Record<string, Array<{ desde: string; hasta: string; plan: string }>>;
  config?: { permiteFraccionadas: boolean; minDiasFraccion: number };
  /** Hasta cuándo rige el contrato de cada persona ("YYYY-MM-DD"; vacío o ausente = indeterminado). */
  contratoVenceEl?: Record<string, string>;
  /** Quiénes están hoy en el equipo del proyecto; un ítem de alguien que ya no está es un error. */
  personasDelEquipo?: string[];
  /** Por ítem, el mensaje de la regla de solapamiento que viola (lo resuelve el server). */
  solapamientos?: Record<string, string>;
}

/** Los ítems que cuentan: lo cancelado y lo rechazado no se va a crear tal como está. */
const vivo = (i: ItemParaValidar) => i.estado !== "cancelado" && i.estado !== "rechazado";

export function validarPlan(plan: PlanParaValidar, ctx: ContextoDeValidacion): Aviso[] {
  const avisos: Aviso[] = [];
  const nombre = (userId: string) => ctx.nombreDe?.[userId] || "La persona";
  const items = plan.items.filter(vivo);
  const equipo = ctx.personasDelEquipo ? new Set(ctx.personasDelEquipo) : null;

  for (const it of items) {
    const dias = it.dias || diasEntre(it.desde, it.hasta);
    if (it.desde < plan.ventanaDesde || it.hasta > plan.ventanaHasta || it.hasta < it.desde) {
      avisos.push({ nivel: "error", codigo: "fuera_de_ventana", itemId: it.id, userId: it.userId, mensaje: `${nombre(it.userId)}: el bloque ${fechaCorta(it.desde)}–${fechaCorta(it.hasta)} queda fuera de la ventana del plan.` });
    }
    if (dias > plan.topeDiasPorPersona) {
      avisos.push({ nivel: "error", codigo: "supera_tope", itemId: it.id, userId: it.userId, mensaje: `${nombre(it.userId)}: ${dias} días superan el tope de ${plan.topeDiasPorPersona} por persona.` });
    }
    if (equipo && !equipo.has(it.userId)) {
      avisos.push({ nivel: "error", codigo: "persona_fuera_del_equipo", itemId: it.id, userId: it.userId, mensaje: `${nombre(it.userId)} ya no está en el equipo con contrato vigente: sacá su bloque o refrescá el equipo.` });
    }
    if (ctx.solapamientos?.[it.id]) {
      avisos.push({ nivel: "error", codigo: "solapamiento_regla", itemId: it.id, userId: it.userId, mensaje: `${nombre(it.userId)}: ${ctx.solapamientos[it.id]}` });
    }
    for (const v of ctx.vacacionesExistentes?.[it.userId] || []) {
      if (sePisan(it, v)) avisos.push({ nivel: "aviso", codigo: "vacacion_existente", itemId: it.id, userId: it.userId, mensaje: `${nombre(it.userId)} ya tiene vacaciones ${v.estado === "pending" ? "pedidas" : "aprobadas"} del ${fechaCorta(v.desde)} al ${fechaCorta(v.hasta)}: al aprobar el bloque va a chocar.` });
    }
    for (const v of ctx.itemsDeOtrosPlanes?.[it.userId] || []) {
      if (sePisan(it, v)) avisos.push({ nivel: "aviso", codigo: "en_otro_plan", itemId: it.id, userId: it.userId, mensaje: `${nombre(it.userId)} también está planificada en «${v.plan}» del ${fechaCorta(v.desde)} al ${fechaCorta(v.hasta)}.` });
    }
    if (ctx.config) {
      const disponibles = ctx.disponiblesDe[it.userId] ?? 0;
      if (!ctx.config.permiteFraccionadas && dias < disponibles) {
        avisos.push({ nivel: "aviso", codigo: "fraccionamiento_no_permitido", itemId: it.id, userId: it.userId, mensaje: `${nombre(it.userId)}: la configuración no permite fraccionar y el bloque (${dias}) es menor que sus días disponibles (${disponibles}).` });
      } else if (ctx.config.permiteFraccionadas && dias > 0 && dias < ctx.config.minDiasFraccion) {
        avisos.push({ nivel: "aviso", codigo: "fraccion_minima", itemId: it.id, userId: it.userId, mensaje: `${nombre(it.userId)}: el bloque tiene ${dias} días y el mínimo por fracción es ${ctx.config.minDiasFraccion}.` });
      }
    }
    const vence = ctx.contratoVenceEl?.[it.userId];
    if (vence && vence < it.hasta) {
      avisos.push({ nivel: "aviso", codigo: "contrato_vence_antes", itemId: it.id, userId: it.userId, mensaje: `${nombre(it.userId)}: su contrato termina el ${fechaCorta(vence)}, antes de que termine el bloque.` });
    }
  }

  // Por persona: que la suma no supere el saldo y que sus bloques no se pisen entre sí.
  const porPersona = new Map<string, ItemParaValidar[]>();
  for (const it of items) porPersona.set(it.userId, [...(porPersona.get(it.userId) || []), it]);
  for (const [userId, suyos] of porPersona) {
    const total = suyos.reduce((acc, i) => acc + (i.dias || diasEntre(i.desde, i.hasta)), 0);
    const disponibles = ctx.disponiblesDe[userId];
    if (disponibles !== undefined && total > disponibles) {
      avisos.push({ nivel: "error", codigo: "supera_saldo", userId, mensaje: `${nombre(userId)}: los bloques suman ${total} días y tiene ${disponibles} disponibles.` });
    }
    for (let i = 0; i < suyos.length; i++) {
      for (let j = i + 1; j < suyos.length; j++) {
        if (sePisan(suyos[i], suyos[j])) avisos.push({ nivel: "error", codigo: "se_pisa_consigo", itemId: suyos[j].id, userId, mensaje: `${nombre(userId)} tiene dos bloques que se pisan (${fechaCorta(suyos[i].desde)}–${fechaCorta(suyos[i].hasta)} y ${fechaCorta(suyos[j].desde)}–${fechaCorta(suyos[j].hasta)}).` });
      }
    }
  }
  return avisos;
}

export const hayErrores = (avisos: Aviso[]): boolean => avisos.some((a) => a.nivel === "error");
