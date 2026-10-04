import { MAX_ALTAS_MASIVAS, partirEnTandas } from "../../compartido/layoutAltaArca.js";

/**
 * ALTAS MASIVAS POR TANDAS: el orden de una corrida, sin navegador ni base.
 *
 * El pegado de ARCA admite pocos registros (9), así que una selección grande se presenta en tandas
 * sucesivas, con la misma sesión y de a una. Este archivo decide QUÉ se presenta y CUÁNDO; el motor
 * (`frontend/tools/altas-arca.mjs`) y la base entran por parámetro, y por eso se puede probar entero
 * con un ARCA simulado (`tandasAltas.test.ts`).
 *
 * Las reglas, que son las del pedido:
 *
 *   · NO DUPLICAR. Antes del «Aceptar» de cada tanda se deja escrito en el contrato que se está
 *     presentando; al volver ARCA se guarda el resultado, y recién ahí se pasa a la tanda siguiente.
 *     Un corte en el medio deja rastro, y lo que quedó sin resultado no se vuelve a presentar: se
 *     CONSULTA en ARCA por CUIL (solo lectura).
 *   · UNA INCIERTA NO SE REINTENTA. Si la consulta la encuentra, queda registrada. Si no la
 *     encuentra queda «incierta» —no verla no prueba que no esté— y la corrida sigue con las demás.
 *   · UNA RECHAZADA NO FRENA AL RESTO: queda con el motivo textual de ARCA.
 *   · SE CORTA SOLA si ARCA deja de comportarse como se espera: un error del motor (sesión caída,
 *     pantalla que no es), un diálogo que nadie esperaba, o más de N rechazos seguidos.
 *   · «DETENER» corta al terminar la tanda en curso: una tanda a medio presentar no se abandona.
 */

export type EstadoPersonaTanda = "pendiente" | "presentando" | "registrada" | "rechazada" | "incierta" | "seco";

export interface ItemTanda {
  userProjectId: string;
  contractIndex: number;
  cuil: string;
  nombre: string;
  registro: string;
}

export interface ResultadoItem {
  item: ItemTanda;
  estado: EstadoPersonaTanda;
  tanda?: number;
  motivo?: string;
  /** Clave de alta temprana, si ARCA la mostró. */
  cat?: string;
  /** El alta se confirmó leyendo Consultas, no por el resultado de la presentación. */
  porConsulta?: boolean;
}

export interface TandaHecha {
  n: number;
  cuils: string[];
  inicio: Date;
  fin: Date;
  duracionMs: number;
  /** `aceptada` | `rechazada` | `seco` | `indeterminado` | `fallo`. */
  resultado: string;
  error?: string;
}

export type MotivoCorte = "detenida" | "error" | "error_despues_de_presentar" | "dialogo" | "rechazos_seguidos";

export interface MotorTandas {
  /** El tope que dice la pantalla del pegado, o null si no lo dice. */
  leerTope(): Promise<number | null>;
  presentar(o: { texto: string; cuils: string[]; tope: number; antesDeAceptar: (cuils: string[]) => Promise<void> }): Promise<{
    resultado: string;
    porPersona?: Array<{ cuil: string; estado: string; motivo?: string; cat?: string }>;
  }>;
  /** `encontrada` es `true` o `null`: nunca `false` (ver `altaEnConsulta` en el motor). */
  consultar(o: { cuil: string; fechaInicio: string }): Promise<{ encontrada: true | null; cat?: string }>;
}

export interface GuardadoTandas {
  /** Antes del «Aceptar»: deja dicho en cada contrato que se está presentando. */
  presentando(items: ItemTanda[], tanda: number): Promise<void>;
  /** El resultado de UN contrato. `pendiente` = no se presentó: borra la marca de «presentando». */
  resultado(r: ResultadoItem): Promise<void>;
  /** Al cerrar cada tanda, con sus tiempos. */
  tanda(t: TandaHecha, resultados: ResultadoItem[]): Promise<void>;
}

export type EventoTandas =
  | { tipo: "tope"; enPantalla: number | null; usado: number }
  | { tipo: "plan"; tandas: number; total: number; tope: number }
  | { tipo: "tanda"; n: number; de: number; cuils: string[]; estado: "presentando" | "terminada"; resultado?: string; duracionMs?: number }
  | { tipo: "personaTanda"; cuil: string; tanda?: number; estado: EstadoPersonaTanda; motivo?: string; cat?: string; porConsulta?: boolean }
  | { tipo: "corte"; motivo: MotivoCorte; mensaje: string };

export interface ResultadoTandas {
  tope: number;
  topeEnPantalla: number | null;
  tandas: TandaHecha[];
  resultados: ResultadoItem[];
  corte?: { motivo: MotivoCorte; mensaje: string };
}

/** Más de esta cantidad de rechazos SEGUIDOS corta la corrida: algo está mal armado y no es una persona. */
export const maxRechazosSeguidos = (): number => {
  const n = Number(process.env.ARCA_ALTAS_MAX_RECHAZOS_SEGUIDOS);
  return Number.isInteger(n) && n >= 0 ? n : 3;
};

/** La fecha de inicio del registro de 85 (posiciones 48–55, ddmmaaaa): es lo que se busca en la consulta. */
export const fechaInicioDeRegistro85 = (registro: string): string => String(registro || "").slice(47, 55);

export async function correrTandas(o: {
  items: ItemTanda[];
  /** Contratos que una corrida anterior dejó sin resultado: NO se presentan, se consultan. */
  inciertas?: ItemTanda[];
  enSeco: boolean;
  motor: MotorTandas;
  guardar: GuardadoTandas;
  emitir?: (e: EventoTandas) => void;
  /** Se mira ANTES de cada tanda: «Detener» y los diálogos inesperados cortan acá, no en el medio. */
  cortePedido?: () => { motivo: MotivoCorte; mensaje: string } | null;
  maxRechazos?: number;
  /** La pausa entre tandas (ritmo de una persona). */
  pausa?: () => Promise<void>;
}): Promise<ResultadoTandas> {
  const { motor, guardar, enSeco } = o;
  const emitir = o.emitir || (() => {});
  const maxRechazos = o.maxRechazos ?? maxRechazosSeguidos();
  const porContrato = new Map<string, ResultadoItem>();
  const clave = (i: ItemTanda) => `${i.userProjectId}:${i.contractIndex}`;
  const anotar = async (r: ResultadoItem, escribir = true) => {
    porContrato.set(clave(r.item), r);
    emitir({ tipo: "personaTanda", cuil: r.item.cuil, tanda: r.tanda, estado: r.estado, motivo: r.motivo, cat: r.cat, porConsulta: r.porConsulta });
    if (escribir && !enSeco) await guardar.resultado(r);
  };
  for (const i of o.items) porContrato.set(clave(i), { item: i, estado: "pendiente" });

  // Si una consulta falla (sesión caída), no se insiste con las demás: quedan inciertas.
  let consultaRota = false;
  const resolverIncierta = async (item: ItemTanda, tanda?: number): Promise<void> => {
    let r: { encontrada: true | null; cat?: string } = { encontrada: null };
    if (!consultaRota) {
      try {
        r = await motor.consultar({ cuil: item.cuil, fechaInicio: fechaInicioDeRegistro85(item.registro) });
      } catch {
        consultaRota = true;
      }
    }
    if (r.encontrada === true) await anotar({ item, estado: "registrada", tanda, cat: r.cat, porConsulta: true });
    else await anotar({ item, estado: "incierta", tanda, motivo: "No se pudo confirmar en ARCA si el alta quedó registrada. Mirala en Relaciones Laborales → Consultas antes de volver a presentarla." });
  };

  // ── El tope: el menor entre lo que dice ARCA y la constante ─────────────────────────────────────
  const enPantalla = await motor.leerTope();
  if (enPantalla === null) throw new Error("La pantalla de Altas Masivas no dice cuántos registros admite: cambió, y no se presenta sin saberlo.");
  const tope = Math.min(enPantalla, MAX_ALTAS_MASIVAS);
  emitir({ tipo: "tope", enPantalla, usado: tope });

  // ── Lo que quedó sin resultado de una corrida anterior: se consulta, no se presenta ─────────────
  if (!enSeco) for (const i of o.inciertas || []) await resolverIncierta(i);

  const cola = [...o.items];
  const totalTandas = partirEnTandas(cola, tope).length;
  emitir({ tipo: "plan", tandas: totalTandas, total: cola.length, tope });

  const tandas: TandaHecha[] = [];
  const yaDevueltas = new Set<string>();
  let corte: ResultadoTandas["corte"];
  let rechazosSeguidos = 0;
  let n = 0;
  while (cola.length > 0 && !corte) {
    const pedido = o.cortePedido?.();
    if (pedido) {
      corte = pedido;
      break;
    }
    if (n > 0) await o.pausa?.();
    const lote = cola.splice(0, tope);
    n++;
    const inicio = new Date();
    const cuils = lote.map((i) => i.cuil);
    emitir({ tipo: "tanda", n, de: Math.max(totalTandas, n), cuils, estado: "presentando" });

    /** Los CUIL por los que se llegó a apretar «Aceptar» en esta tanda (o se estaba por apretar). */
    let aceptando: string[] | null = null;
    let r: Awaited<ReturnType<MotorTandas["presentar"]>> | null = null;
    let error: string | undefined;
    try {
      r = await motor.presentar({
        texto: lote.map((i) => i.registro).join("\n"),
        cuils,
        tope,
        antesDeAceptar: async (enGrilla) => {
          const items = lote.filter((i) => enGrilla.includes(i.cuil));
          // PRIMERO se escribe, DESPUÉS se aprieta: si no se puede dejar el rastro, no se presenta.
          await guardar.presentando(items, n);
          aceptando = enGrilla;
          for (const i of items) emitir({ tipo: "personaTanda", cuil: i.cuil, tanda: n, estado: "presentando" });
        },
      });
    } catch (e: any) {
      error = String(e?.message || e);
      corte = { motivo: aceptando ? "error_despues_de_presentar" : e?.detenido ? "detenida" : "error", mensaje: error };
    }

    const porCuil = new Map((r?.porPersona || []).map((p) => [String(p.cuil), p]));
    const presentadas: string[] = aceptando || [];
    for (const item of lote) {
      const p = porCuil.get(item.cuil);
      if (r?.resultado === "seco") {
        await anotar({ item, estado: "seco", tanda: n }, false);
      } else if (p?.estado === "alta") {
        rechazosSeguidos = 0;
        await anotar({ item, estado: "registrada", tanda: n, cat: p.cat });
      } else if (p?.estado === "rechazada") {
        rechazosSeguidos++;
        await anotar({ item, estado: "rechazada", tanda: n, motivo: p.motivo || "ARCA rechazó el registro." });
      } else if (p?.estado === "devuelta") {
        // ARCA no registró ninguna de la tanda por el error de otra fila: esta no se presentó. Vuelve
        // a la cola UNA vez; si la devuelven de nuevo queda pendiente, sin insistir.
        await anotar({ item, estado: "pendiente", motivo: "ARCA no registró la tanda por el error de otra fila." });
        if (!yaDevueltas.has(clave(item))) {
          yaDevueltas.add(clave(item));
          cola.push(item);
        }
      } else if (presentadas.includes(item.cuil)) {
        // Se apretó «Aceptar» con esta persona en la grilla y no hay resultado: no se reintenta, se consulta.
        await resolverIncierta(item, n);
      }
      // Si no: nunca llegó al «Aceptar» (la tanda falló antes). Sigue pendiente y sin marca.
    }

    const fin = new Date();
    const hecha: TandaHecha = { n, cuils, inicio, fin, duracionMs: fin.getTime() - inicio.getTime(), resultado: error ? "fallo" : r?.resultado || "indeterminado", error };
    tandas.push(hecha);
    emitir({ tipo: "tanda", n, de: Math.max(totalTandas, n), cuils, estado: "terminada", resultado: hecha.resultado, duracionMs: hecha.duracionMs });
    if (!enSeco) await guardar.tanda(hecha, [...porContrato.values()]);

    if (!corte && rechazosSeguidos > maxRechazos) {
      corte = { motivo: "rechazos_seguidos", mensaje: `ARCA rechazó ${rechazosSeguidos} altas seguidas. Se cortó para revisar el armado antes de seguir.` };
    }
  }
  if (corte) emitir({ tipo: "corte", ...corte });
  return { tope, topeEnPantalla: enPantalla, tandas, resultados: [...porContrato.values()], corte };
}
