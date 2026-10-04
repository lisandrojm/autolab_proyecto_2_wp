import { codigoPuesto } from "../compartido/puestosDesempenados.js";

/**
 * QUÉ PUESTO DESEMPEÑADO POR DEFECTO LE TOCA A CADA CONVENIO, y qué haría sembrarlo — sin escribir nada.
 *
 * La lista de abajo es una decisión de quien conoce los convenios, no una inferencia: se cargó a
 * pedido. Los demás convenios en uso NO reciben nada acá; el plan los lista (`sinDefault`) para que
 * alguien decida.
 *
 * Las reglas del plan, todas conservadoras:
 *   · el código tiene que EXISTIR Y ESTAR ACTIVO en el catálogo de puestos. Si no, ese convenio no se
 *     toca y se avisa: este script no crea puestos por su cuenta.
 *   · el convenio tiene que existir. Si no, se avisa.
 *   · un valor ya cargado NO se pisa, salvo con `pisar` explícito. Igual al deseado = «ya estaba».
 *   · correrlo dos veces da lo mismo que correrlo una: la segunda vez no hay nada para aplicar.
 *
 * Es puro (sin Mongoose) para poder probarlo; `scripts/sembrarPuestoPorConvenio.ts` le trae los datos.
 */
export interface PuestoDeseado {
  cct: string;
  nombre: string;
  puesto: string;
}

export const PUESTOS_POR_CONVENIO: PuestoDeseado[] = [
  { cct: "0102/90", nombre: "ACTORES", puesto: "2455" },
  { cct: "0322/75", nombre: "ACTORES", puesto: "2455" },
  { cct: "0634/11", nombre: "TELEVISIÓN", puesto: "4132" },
];

export interface ConvenioParaPlan {
  externalId: string;
  name?: string;
  puestoDesempenadoDefault?: string | null;
}

export interface PlanPuestoPorConvenio {
  /** Lo que se va a escribir: `de` es lo que tenía ("" = vacío). */
  aplicar: Array<{ cct: string; nombre: string; de: string; a: string }>;
  /** Ya tenían exactamente ese puesto. */
  yaEstaban: Array<{ cct: string; puesto: string }>;
  /** Tenían OTRO puesto cargado y no se pisó (falta `pisar`). */
  respetados: Array<{ cct: string; actual: string; deseado: string }>;
  /** Códigos que no existen o no están activos en el catálogo: sus convenios no se tocan. */
  puestosFaltantes: Array<{ puesto: string; ccts: string[] }>;
  /** Convenios de la lista que no están en el ABM. */
  conveniosFaltantes: string[];
  /** Convenios EN USO que quedan sin default después de aplicar: para que alguien decida. */
  sinDefault: Array<{ cct: string; nombre: string; contratos: number; categorias: number }>;
}

const limpio = (v: unknown) => String(v ?? "").trim();

export function planPuestoPorConvenio(o: {
  deseados?: PuestoDeseado[];
  convenios: ConvenioParaPlan[];
  /** Códigos del catálogo que existen y están activos. */
  puestosActivos: Iterable<string>;
  /** Convenios en uso: con contratos o con categorías cargadas. */
  enUso?: Array<{ cct: string; contratos: number; categorias: number }>;
  pisar?: boolean;
}): PlanPuestoPorConvenio {
  const deseados = o.deseados || PUESTOS_POR_CONVENIO;
  const activos = new Set([...o.puestosActivos].map(codigoPuesto).filter(Boolean));
  const porCct = new Map(o.convenios.map((c) => [limpio(c.externalId), c]));
  const plan: PlanPuestoPorConvenio = { aplicar: [], yaEstaban: [], respetados: [], puestosFaltantes: [], conveniosFaltantes: [], sinDefault: [] };
  /** cct → puesto con el que queda después de aplicar el plan. */
  const queda = new Map<string, string>([...porCct].map(([cct, c]) => [cct, codigoPuesto(c.puestoDesempenadoDefault)]));

  for (const d of deseados) {
    const cct = limpio(d.cct);
    const puesto = codigoPuesto(d.puesto);
    if (!puesto || !activos.has(puesto)) {
      const previo = plan.puestosFaltantes.find((p) => p.puesto === (puesto || limpio(d.puesto)));
      if (previo) previo.ccts.push(cct);
      else plan.puestosFaltantes.push({ puesto: puesto || limpio(d.puesto), ccts: [cct] });
      continue;
    }
    const convenio = porCct.get(cct);
    if (!convenio) {
      plan.conveniosFaltantes.push(cct);
      continue;
    }
    const actual = codigoPuesto(convenio.puestoDesempenadoDefault);
    if (actual === puesto) plan.yaEstaban.push({ cct, puesto });
    else if (actual && !o.pisar) plan.respetados.push({ cct, actual, deseado: puesto });
    else {
      plan.aplicar.push({ cct, nombre: limpio(convenio.name) || d.nombre, de: actual, a: puesto });
      queda.set(cct, puesto);
    }
  }

  for (const u of o.enUso || []) {
    const cct = limpio(u.cct);
    if (!cct || queda.get(cct)) continue;
    plan.sinDefault.push({ cct, nombre: limpio(porCct.get(cct)?.name), contratos: u.contratos, categorias: u.categorias });
  }
  plan.sinDefault.sort((a, b) => b.contratos - a.contratos || a.cct.localeCompare(b.cct));
  return plan;
}
