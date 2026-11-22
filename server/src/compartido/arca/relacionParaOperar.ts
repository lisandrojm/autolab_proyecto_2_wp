/**
 * ¿HAY UNA RELACIÓN EN ARCA SOBRE LA CUAL OPERAR? (22/11/2026, pedido del usuario). La condición que decide si
 * un contrato puede ir a Relaciones Laborales → Modificaciones y Bajas (baja, modificación o anulación). La
 * usan los dos lados, así nunca dicen cosas distintas:
 *   · el panel (`services/arca/reglasOperacionRelacion.ts`), antes de mirar la operación pedida;
 *   · la bandeja Contratos (`contracts-overview` → `relacionArca`), para mostrar o no el ícono y para el filtro
 *     «Con relación para operar».
 *
 * La relación existe si el alta está presentada (desde WeProdu, hallada al verificar o adoptada) o si el
 * espejo de Relaciones Laborales tiene una con la MISMA empleadora, el mismo CUIL y la misma fecha de inicio.
 * Lo segundo cubre las altas hechas a mano en ARCA que no se adoptaron: no salieron de WeProdu, pero están.
 *
 * Y TIENE QUE HABER ALGO QUE OPERAR (22/11/2026): la relación está abierta, termina de hoy en adelante, o tiene una
 * operación reciente hecha desde WeProdu (una baja de los últimos 30 días se puede anular; una sin confirmar
 * hay que mirarla). Una relación cerrada hace años no necesita el botón. La fecha de fin es la de ARCA (el espejo);
 * si el espejo todavía no la tiene, la baja del contrato: las altas presentadas desde WeProdu quedan en ARCA con ese
 * mismo fin (353 de 353, ver el Glosario de ARCA). Lo usan también Antigüedad ARCA y A.R.C.A Bajas
 * (`services/arca/relacionesOperables.ts`): los tres lugares dicen lo mismo.
 *
 * Pura: el espejo lo resuelve quien llama (`enEspejo`, `fin`).
 */

export const TRAMITE_ALTA_ARCA = "alta_temprana_afip";

export interface ContratoParaRelacion {
  /**
   * El trámite del tipo de contrato (`alta_temprana_afip`, `constancia_cuit`…). `undefined` = quien llama no
   * lo resolvió y no se mira; `null` u otro valor = no es de ARCA.
   */
  tramite?: string | null;
  estadoContrato?: string | null;
  cuil: string;
  empresaCuit: string;
  /** "YYYY-MM-DD" */
  alta: string;
  altaArcaPresentada?: { resultado?: string; via?: string } | null;
  /** El espejo tiene la relación con esa empleadora, ese CUIL y esa fecha de inicio exacta. */
  enEspejo: boolean;
  /** Hoy, "YYYY-MM-DD". Sin esto no se mira si la relación ya terminó. */
  hoy?: string;
  /** La fecha de fin que se le conoce a la relación (`finConocido`); "" = abierta. */
  fin?: string;
  /** Hay una operación hecha desde WeProdu sin confirmar o reciente (`operacionReciente`). */
  operacionReciente?: boolean;
}

/** Por dónde se sabe que la relación existe. */
export type ViaRelacion = "weprodu" | "verificacion" | "adoptada" | "espejo";

export interface RelacionParaOperar {
  puede: boolean;
  /** Por qué no ("" si puede). */
  motivo: string;
  via: ViaRelacion | null;
}

const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const esISO = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

/** Cuántos días una operación hecha desde WeProdu deja la relación a mano (para anularla o corregirla). */
export const DIAS_OPERACION_RECIENTE = 30;

const diaDe = (v: unknown): string => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const menosDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const corta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * ¿Alguna operación de Modificaciones y Bajas hecha desde WeProdu (las marcas del contrato, o las del registro de
 * operaciones si no hay contrato) está sin confirmar, o es de los últimos `DIAS_OPERACION_RECIENTE` días?
 */
export function operacionReciente(marcas: Array<{ resultado?: string; fecha?: unknown } | null | undefined>, hoy: string): boolean {
  const desde = esISO(hoy) ? menosDias(hoy, DIAS_OPERACION_RECIENTE) : "";
  return marcas.some((m) => {
    const r = String(m?.resultado || "");
    if (r === "presentando" || r === "indeterminado") return true;
    return (r === "presentada" || r === "anulada") && !!desde && diaDe(m?.fecha) >= desde;
  });
}

/** La fecha de fin que se le conoce a la relación: la del espejo si está; si no, la baja del contrato. */
export const finConocido = (o: { enEspejo: boolean; finEspejo?: string | null; bajaContrato?: string | null }): string => (o.enEspejo ? String(o.finEspejo || "") : String(o.bajaContrato || "")).slice(0, 10);

export function relacionParaOperar(c: ContratoParaRelacion): RelacionParaOperar {
  const no = (motivo: string): RelacionParaOperar => ({ puede: false, motivo, via: null });
  const terminada = esISO(c.hoy) && esISO(c.fin) && String(c.fin) < String(c.hoy) && !c.operacionReciente;
  const cerrada = () => no(`La relación terminó el ${corta(String(c.fin))} en ARCA: no hay nada que operar.`);
  if (c.tramite !== undefined && c.tramite !== TRAMITE_ALTA_ARCA) return no("Este contrato no es de trámite ARCA (alta temprana): no tiene una relación en ARCA sobre la cual operar.");
  if (c.estadoContrato === "ANULADO") return no("El contrato está anulado en WeProdu.");
  if (dig(c.cuil).length !== 11) return no("La persona no tiene un CUIL de 11 dígitos.");
  if (dig(c.empresaCuit).length !== 11) return no("La empleadora del contrato no tiene CUIT: sin eso no se puede elegir en ARCA.");
  if (!esISO(c.alta)) return no("El contrato no tiene una fecha de alta válida.");
  const a = c.altaArcaPresentada;
  const r = String(a?.resultado || "");
  if (r === "presentando" || r === "indeterminado") return no("El alta de este contrato está sin confirmar en ARCA: primero resolvé eso (mirala en Relaciones Laborales → Consultas).");
  if (r === "anulada") return no("El alta de este contrato fue anulada en ARCA: ya no hay relación sobre la que operar.");
  if (r === "presentada") return terminada ? cerrada() : { puede: true, motivo: "", via: a?.via === "externa" ? "adoptada" : a?.via === "verificacion" ? "verificacion" : "weprodu" };
  if (c.enEspejo) return terminada ? cerrada() : { puede: true, motivo: "", via: "espejo" };
  return no("Este contrato no tiene el alta presentada en ARCA ni figura en las Relaciones Laborales sincronizadas: no hay relación sobre la cual operar.");
}
