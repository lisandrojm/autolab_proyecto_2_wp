import { fechaCorta } from "./altasVigentes.js";

/**
 * ¿ESTA ALTA PENDIENTE YA LA HIZO ALGUIEN A MANO EN ARCA? (pedido del 04/11/2026). Puro.
 *
 * Cuando ARCA rechaza o retiene un alta, a veces el operador la fuerza a mano en el sitio de ARCA. La
 * plataforma no se enteraba: el contrato seguía «Pedido de ARCA», en la cola de Altas Automáticas, y
 * nadie bajaba la constancia. Ahora, con las Relaciones Laborales SINCRONIZADAS (el TXT de movimientos
 * que genera ARCA, ver `sincronizarRelaciones.ts`), se busca la relación que es esta alta:
 *
 *   · UNA relación con la misma persona y empleadora (eso ya viene filtrado), que empieza el mismo día,
 *     termina el mismo día (o las dos sin fin) y con la misma modalidad → se ADOPTA: queda presentada
 *     como si la hubiera presentado la plataforma (`altaArcaPresentada.via = "externa"`).
 *   · Una relación que empieza durante el contrato pero no coincide en todo (fechas o modalidad) →
 *     REVISIÓN MANUAL, con lo esperado y lo encontrado lado a lado. Nunca se adopta sola.
 *   · Varias relaciones idénticas, u otro contrato de WeProdu que ya es esa alta → REVISIÓN MANUAL.
 *   · Nada que empiece durante el contrato → `null`: no es asunto de esta regla (sigue la cola normal).
 *     Una relación ANTERIOR al contrato es otro contrato (o algo activo que lo bloquea): eso lo resuelve
 *     `bloqueoPorVigencia`, no esto.
 *
 * Decisiones del usuario (04/11/2026): alcanza con lo sincronizado, sin consultar ARCA en vivo (el TXT
 * trae la modalidad, la consulta no); la constancia la baja la descarga diaria de siempre.
 *
 * LA MODALIDAD: el contrato la tiene como CÓDIGO (022) y el TXT de ARCA como DESCRIPCIÓN («A tiempo
 * completo determinado (contrato a plazo fijo)»). Se comparan por el catálogo oficial
 * (`ArcaModalidadContratacion`: código → nombre). Si ARCA no la informa, no se compara (la regla del
 * pedido: «si está disponible»); si la informa y no hay cómo saber la del contrato, es revisión manual.
 */

/** Una relación de ARCA tal como quedó sincronizada. Fechas "YYYY-MM-DD"; `fin` vacío = abierta. */
export interface RelacionSincronizada {
  inicio: string;
  fin: string;
  /** Como la escribe ARCA en el TXT: la descripción (a veces con el código adelante). Vacío = no la informó. */
  modalidad: string;
}

export interface AltaPendiente {
  /** "YYYY-MM-DD" */
  alta: string;
  /** "YYYY-MM-DD"; vacío = tiempo indeterminado. */
  baja: string;
  /** El código de modalidad del contrato (resuelto como para el TXT): "022". Vacío si no se pudo resolver. */
  modalidadCodigo: string;
  /** El nombre de ese código en el catálogo oficial. Vacío si el catálogo no lo tiene. */
  modalidadNombre: string;
  /** Otro contrato de WeProdu de la misma persona y empleadora, ya presentado, empieza el mismo día. */
  otroContratoMismoDia: boolean;
}

/** Lo esperado y lo encontrado, para mostrarlos lado a lado. */
export interface LadoALado {
  esperado: { inicio: string; fin: string; modalidad: string };
  encontradas: RelacionSincronizada[];
}

export type DecisionAltaExterna =
  | ({ accion: "adoptar"; motivo: string; relacion: RelacionSincronizada } & LadoALado)
  | ({ accion: "revision_manual"; motivo: string; relacion?: RelacionSincronizada } & LadoALado);

const normalizar = (t: string) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const codigo3 = (c: string) => {
  const d = String(c || "").replace(/\D/g, "");
  return d ? d.padStart(3, "0").slice(-3) : "";
};

/**
 * ¿La modalidad de ARCA es la del contrato? `true`/`false`, o `null` si no se puede saber (ARCA la
 * informa y del contrato no se conoce el código o su nombre).
 */
export function mismaModalidad(alta: Pick<AltaPendiente, "modalidadCodigo" | "modalidadNombre">, deArca: string): boolean | null {
  const texto = String(deArca || "").trim();
  if (!texto) return true; // ARCA no la informó: no se compara.
  const codigoContrato = codigo3(alta.modalidadCodigo);
  // El TXT a veces trae el código adelante («022 - A tiempo completo…»): entonces se compara el código.
  const conCodigo = texto.match(/^(\d{1,3})(?:\s*[-–:]\s*|\s+|$)/);
  if (conCodigo) return codigoContrato ? codigo3(conCodigo[1]) === codigoContrato : null;
  if (!codigoContrato || !alta.modalidadNombre) return null;
  const a = normalizar(texto);
  const b = normalizar(alta.modalidadNombre);
  if (!a || !b) return null;
  // El TXT es de ancho fijo y puede cortar la descripción: alcanza con que una empiece por la otra.
  return a === b || (Math.min(a.length, b.length) >= 12 && (a.startsWith(b) || b.startsWith(a)));
}

const periodo = (inicio: string, fin: string) => (fin ? `${fechaCorta(inicio)} → ${fechaCorta(fin)}` : `${fechaCorta(inicio)} → sin fin`);
const textoModalidad = (codigo: string, nombre: string) => [codigo3(codigo), nombre].filter(Boolean).join(" - ") || "sin resolver";

export function decidirAltaExterna(a: AltaPendiente, relaciones: RelacionSincronizada[]): DecisionAltaExterna | null {
  const esperado = { inicio: a.alta, fin: a.baja, modalidad: textoModalidad(a.modalidadCodigo, a.modalidadNombre) };
  // Las que pueden ser esta alta: empiezan el día del alta o durante el contrato.
  const candidatas = relaciones.filter((r) => r.inicio && r.inicio >= a.alta && (!a.baja || r.inicio <= a.baja));
  if (candidatas.length === 0) return null;
  const ladoALado = { esperado, encontradas: candidatas };
  const manual = (motivo: string, relacion?: RelacionSincronizada): DecisionAltaExterna => ({ accion: "revision_manual", motivo, ...(relacion ? { relacion } : {}), ...ladoALado });
  const delDia = candidatas.filter((r) => r.inicio === a.alta);

  if (a.otroContratoMismoDia && delDia.length > 0)
    return manual(`ARCA tiene una relación que empieza el ${fechaCorta(a.alta)}, pero otro contrato de esta persona con esta empleadora que empieza ese día ya figura presentado desde WeProdu: revisar si éste es un duplicado. No se adopta para no tener dos contratos con la misma alta.`, delDia[0]);

  const exactas = delDia.filter((r) => (r.fin || "") === (a.baja || "") && mismaModalidad(a, r.modalidad) === true);
  if (exactas.length === 1) {
    const r = exactas[0];
    return { accion: "adoptar", motivo: `Alta externa: ARCA ya tiene la relación ${periodo(r.inicio, r.fin)}${r.modalidad ? `, ${r.modalidad}` : ""}, idéntica a este contrato. Se adoptó como presentada (no se vuelve a presentar).`, relacion: r, ...ladoALado };
  }
  if (exactas.length > 1) return manual(`ARCA tiene ${exactas.length} relaciones idénticas a este contrato (${periodo(a.alta, a.baja)}): no se puede saber cuál es la de este contrato. Revisar a mano.`);

  // Hay algo que empieza durante el contrato y no coincide en todo: qué difiere, de la más parecida.
  const r = delDia[0] || candidatas[0];
  const diferencias: string[] = [];
  if (r.inicio !== a.alta) diferencias.push(`empieza el ${fechaCorta(r.inicio)} y el contrato el ${fechaCorta(a.alta)}`);
  if ((r.fin || "") !== (a.baja || "")) diferencias.push(`${r.fin ? `termina el ${fechaCorta(r.fin)}` : "no tiene fecha de fin"} y el contrato ${a.baja ? `el ${fechaCorta(a.baja)}` : "es por tiempo indeterminado"}`);
  const modalidad = mismaModalidad(a, r.modalidad);
  if (modalidad === false) diferencias.push(`la modalidad es «${r.modalidad}» y la del contrato «${esperado.modalidad}»`);
  if (modalidad === null) diferencias.push(`no se pudo comparar la modalidad («${r.modalidad}» en ARCA; el contrato: ${esperado.modalidad})`);
  const otras = candidatas.length > 1 ? ` (hay ${candidatas.length} relaciones que empiezan durante el contrato)` : "";
  return manual(`Parece un alta hecha a mano en ARCA que no coincide con el contrato: ${diferencias.join("; ")}${otras}. No se adopta sola: revisar cuál es la correcta.`, r);
}
