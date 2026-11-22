/**
 * BAJAS ARCA: LA LISTA (22/11/2026, pedido del usuario). El único lugar desde donde se da de baja una relación en
 * ARCA. Una fila por CADA relación VIVA del espejo (abierta, o con fin de hoy en adelante): la lista tiene que
 * sumar lo mismo que las relaciones vivas del espejo, y si no coincide es un bug (`vivasEnEspejo`, que se cuenta
 * aparte, es contra lo que la pantalla lo comprueba). Cada fila tiene exactamente UNA situación:
 *
 *   1. Terminado en WeProdu            el contrato tiene fecha de baja pasada y la relación sigue abierta en ARCA.
 *   2. Termina antes de su fecha       contrato a plazo cuya baja en WeProdu es anterior al fin que tiene ARCA.
 *   3. Baja presentada, sin confirmar  se mandó desde acá y no se leyó el resultado, o quedó en error de navegación.
 *   4. Sin contrato en WeProdu         ningún contrato con esa persona, empleadora y fecha de inicio. Incluye las
 *                                      que ARCA cierra sola (fin futuro): «ARCA la cierra sola» supone que hay un
 *                                      contrato, y acá no lo hay (Peralta Recio, Viggiano). La fila distingue
 *                                      «persona sin ficha en WeProdu» de «ficha sin contrato con esa alta».
 *   5. Indeterminado vigente           abierto de los dos lados. Inventario, no trabajo.
 *   6. Plazo vigente                   plazo fijo o jornada con fin de hoy en adelante: ARCA lo cierra solo en su
 *                                      fecha, pero se puede dar de baja antes. Inventario también.
 *
 * El número del menú es la suma de 1 a 4: el trabajo pendiente. La 5 y la 6 son inventario.
 *
 * FILAS BLOQUEADAS (sin situación, al final, con el botón deshabilitado y el motivo a la vista): las relaciones
 * vivas sobre las que desde acá no se puede operar. Se ven igual, porque la lista es TODO lo vivo:
 *   · `varios_proyectos`: la misma relación cargada en VARIOS proyectos («agregar miembro»: Quinteiro, Yorio). No es
 *     un problema de datos sino una decisión que WeProdu modela mal, y se resuelve A MANO. La lista NO elige un
 *     contrato «principal»: la baja en ARCA quedaría atada a un proyecto arbitrario y el resto seguiría vigente.
 *   · `varios_contratos`: duplicados dentro del MISMO proyecto. Se anula el que sobra y la fila toma su situación.
 *   · `baja_presentada`: la baja ya se presentó y ARCA la tomó; falta que la sincronización la traiga cerrada.
 *   · `no_se_opera`: la regla compartida dice que no hay nada que operar (alta sin confirmar o anulada).
 * Las dos primeras están también en Auditoría ARCA › «Relación con varios contratos», de esta misma función.
 * Servicios y anulados no cuentan como contrato de ninguna relación (`relacionesOperables.ts`).
 *
 * SOBRE EL ORDEN: la 3 se mira ANTES que la 1 y la 2. Una baja que se mandó y quedó sin confirmar casi siempre es de
 * un contrato que ya terminó: si ganara la 1, la fila diría «Terminado en WeProdu» con el botón «Dar de baja», como
 * si nadie hubiera mandado nada. La lista igual se ordena 1 a 6, y las bloqueadas al final.
 *
 * «Se puede operar» lo decide la regla de siempre, `compartido/arca/relacionParaOperar.ts` (vía
 * `relacionesOperables`): la misma que usa el panel. El tipo por el que se filtra y la advertencia de la modalidad
 * de directores (LRT) salen de `compartido/arca/modalidadArca.ts`, que también usa el panel.
 *
 * LA FOTO DE LAS 06:00 (`guardarCorridaBajasArca`): después de cada sincronización automática se guardan los conteos
 * de las seis situaciones y qué relación está en cuál, como hace la Auditoría con sus totales. Y contra la foto
 * anterior se anota quién entró, quién salió y quién cambió de situación: un número que cambia tiene que poder
 * explicarse.
 */
import { Types } from "mongoose";
import { Tenant } from "../../models/Tenant.js";
import { RelacionLaboralArca } from "../../models/RelacionLaboralArca.js";
import { hoyArgentina } from "../../utils/contratoVigencia.js";
import { advertenciaDeModalidad, tipoDeRelacion } from "../../compartido/arca/modalidadArca.js";
import { relacionesOperables, type ContratoDeRelacion, type RelacionOperable } from "./relacionesOperables.js";

export type SituacionBajaArca = 1 | 2 | 3 | 4 | 5 | 6;
export const SITUACIONES_BAJA_ARCA: Record<SituacionBajaArca, string> = {
  1: "Terminado en WeProdu",
  2: "Termina antes de su fecha",
  3: "Baja presentada, sin confirmar",
  4: "Sin contrato en WeProdu",
  5: "Indeterminado vigente",
  6: "Plazo vigente",
};

/** Por qué una relación viva está en la lista sin poder operarse desde acá. */
export type MotivoBloqueo = "varios_contratos" | "varios_proyectos" | "baja_presentada" | "no_se_opera";
/** `cerrada` no es una fila: es a dónde fue una relación que salió de la lista (los movimientos de la foto). */
export type MotivoFuera = "cerrada" | MotivoBloqueo;

export const BLOQUEOS: Record<MotivoBloqueo, { etiqueta: string; texto: string }> = {
  varios_proyectos: { etiqueta: "Varios proyectos", texto: "Misma relación en varios proyectos: resolver a mano. Está en Auditoría ARCA › «Relación con varios contratos»; desde acá no se da de baja porque quedaría atada a un solo proyecto." },
  varios_contratos: { etiqueta: "Contrato duplicado", texto: "Tiene varios contratos en WeProdu con esa alta y empleadora: está en Auditoría ARCA › «Relación con varios contratos». No se puede dar de baja desde WeProdu hasta anular el duplicado." },
  baja_presentada: { etiqueta: "Baja ya presentada", texto: "La baja ya se presentó desde WeProdu y ARCA la tomó: falta que la sincronización la traiga cerrada." },
  no_se_opera: { etiqueta: "No se opera", texto: "No hay nada que operar." },
};

const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const corta = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const diaDe = (v: unknown): string => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

export interface MarcaDeBaja {
  resultado?: string;
  clase?: string;
  fecha?: unknown;
}

/** La baja se mandó y no se sabe cómo quedó (`presentando`, `indeterminado`), o el intento murió navegando. */
export const bajaSinConfirmar = (m?: MarcaDeBaja | null): boolean => {
  const r = String(m?.resultado || "");
  return r === "presentando" || r === "indeterminado" || (r === "fallida" && m?.clase === "navegacion");
};

export interface DatosParaSituacion {
  /** `estadoDeRelacion`: sólo entran `abierta` y `fin_futuro`. */
  estado: string;
  finArca: string;
  /** Cuántos contratos de WeProdu tiene la relación (sin anulados ni Servicios). */
  contratos: number;
  /** En cuántos proyectos (vínculos) distintos están esos contratos. */
  proyectos: number;
  /** La regla compartida dice que hay algo que operar. */
  puede: boolean;
  /** La baja del contrato en WeProdu ("" = sin baja). Sólo con UN contrato. */
  bajaContrato: string;
  /** La marca de la baja presentada desde WeProdu (la del contrato; sin contrato, la del registro de operaciones). */
  baja: MarcaDeBaja | null;
}

/**
 * LA SITUACIÓN DE UNA RELACIÓN VIVA, o por qué no tiene (`fuera`: una cerrada no es de la lista; el resto son filas
 * bloqueadas). Pura: es lo que se prueba.
 */
export function situacionDeBaja(d: DatosParaSituacion, hoy: string): { situacion: SituacionBajaArca; fuera: null } | { situacion: null; fuera: MotivoFuera } {
  const fuera = (m: MotivoFuera) => ({ situacion: null, fuera: m });
  const en = (s: SituacionBajaArca) => ({ situacion: s, fuera: null });
  if (d.estado !== "abierta" && d.estado !== "fin_futuro") return fuera("cerrada");
  if (d.contratos > 1) return fuera(d.proyectos > 1 ? "varios_proyectos" : "varios_contratos");
  if (!d.puede) return fuera("no_se_opera");
  if (String(d.baja?.resultado || "") === "presentada") return fuera("baja_presentada");
  if (bajaSinConfirmar(d.baja)) return en(3);
  if (d.contratos === 0) return en(4);
  // Un contrato. Abierta en ARCA: terminó en WeProdu (1) o sigue (5; también si termina de hoy en adelante: todavía no hay nada que cerrar).
  if (d.estado === "abierta") return en(d.bajaContrato && d.bajaContrato < hoy ? 1 : 5);
  // ARCA tiene fecha de fin de hoy en adelante: WeProdu termina ANTES (2), o es un plazo vigente que ARCA cierra sola (6).
  return en(d.bajaContrato && d.bajaContrato < d.finArca ? 2 : 6);
}

export type EnWeprodu = "con_contrato" | "sin_contrato" | "sin_ficha";

export interface FilaBajaArca {
  clave: string;
  empleadoraCuit: string;
  empleadora: string;
  cuil: string;
  persona: string;
  userId: string | null;
  /** La persona no tiene ficha en WeProdu (distinto de «ficha sin contrato»). */
  sinFicha: boolean;
  /** Qué hay en WeProdu de esta relación: un contrato (o varios), la ficha sin ese contrato, o ni la ficha. */
  enWeprodu: EnWeprodu;
  inicio: string;
  finArca: string;
  modalidadArca: string;
  /** El tipo por el que se filtra y se ordena: el de WeProdu si hay contrato; si no, la modalidad que declara ARCA. */
  tipo: string;
  /** El nombre del tipo de contrato de WeProdu ("" sin contrato: la pantalla muestra la modalidad de ARCA). */
  tipoContrato: string;
  /** Para mostrar; con varios proyectos, todos. */
  proyecto: string;
  proyectos: string[];
  finWeprodu: string;
  /** Días desde la baja del contrato en WeProdu, si ya pasó. */
  diasDesdeFin: number | null;
  /** `null` = fila bloqueada (ver `bloqueo`). */
  situacion: SituacionBajaArca | null;
  /** Por qué no se puede operar desde acá: el botón va deshabilitado con este motivo. */
  bloqueo: { motivo: MotivoBloqueo; etiqueta: string; texto: string } | null;
  /** Lo que la fila aclara debajo de la situación. */
  detalle: string;
  /** Advertencia visible en la fila y en el panel (hoy: la modalidad de directores, LRT). "" si ninguna. */
  advertencia: string;
  /** Con qué contrato abre el panel; `null` = modo «sin contrato». */
  contrato: { userProjectId: string; contratoKey: string | null; posicion: number } | null;
}

/** Una fila bloqueada con sus contratos: lo que Auditoría ARCA muestra en «Relación con varios contratos». */
export interface FilaBloqueada {
  clave: string;
  empleadoraCuit: string;
  empleadora: string;
  cuil: string;
  persona: string;
  userId: string | null;
  inicio: string;
  finArca: string;
  motivo: MotivoBloqueo;
  texto: string;
  contratos: ContratoDeRelacion[];
}

export interface ConteosBajaArca {
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
  s6: number;
  /** La suma de 1 a 4: el número del menú. La 5 y la 6 son inventario. */
  pendientes: number;
  /** Las filas sin situación (botón deshabilitado), por motivo. */
  bloqueadas: Partial<Record<MotivoBloqueo, number>>;
  /** Todas las filas: tiene que ser igual a las relaciones vivas del espejo. */
  total: number;
}

export interface ListaBajasArca {
  hoy: string;
  filas: FilaBajaArca[];
  bloqueadas: FilaBloqueada[];
  conteos: ConteosBajaArca;
}

const detalleDe = (situacion: SituacionBajaArca, r: RelacionOperable, c: ContratoDeRelacion | null, baja: MarcaDeBaja | null, hoy: string): string => {
  if (situacion === 3) {
    const cuando = diaDe(baja?.fecha);
    return String(baja?.resultado) === "fallida"
      ? `El intento${cuando ? ` del ${corta(cuando)}` : ""} quedó en error de navegación: no se llegó a mandar. Se puede reintentar.`
      : `Se mandó${cuando ? ` el ${corta(cuando)}` : ""} y no se leyó el resultado: mirá la relación en ARCA antes de volver a mandar.`;
  }
  if (situacion === 4) return `${r.userId ? "Ficha sin contrato con esa alta" : "Persona sin ficha en WeProdu"}${r.fin ? ` · en ARCA termina el ${corta(r.fin)}` : ""}`;
  if (situacion === 2) return `En ARCA termina el ${corta(r.fin)}`;
  if (situacion === 6) return `ARCA lo cierra solo el ${corta(r.fin)}${!c?.baja ? " · en WeProdu no tiene fecha de fin" : c.baja !== r.fin ? ` · en WeProdu termina el ${corta(c.baja)}` : ""}`;
  if (situacion === 5 && c?.baja && c.baja >= hoy) return `En WeProdu termina el ${corta(c.baja)}; ARCA no tiene fecha de fin`;
  return "";
};

/** Arma la lista a partir de las relaciones vivas y cómo se opera cada una. Pura. */
export function armarListaBajas(relaciones: RelacionOperable[], hoy: string): ListaBajasArca {
  const filas: FilaBajaArca[] = [];
  const bloqueadas: FilaBloqueada[] = [];
  for (const r of relaciones) {
    const unico = r.contratos.length === 1 ? r.contratos[0] : null;
    const baja: MarcaDeBaja | null = unico?.bajaPresentada || r.bajaEnRegistro || null;
    const s = situacionDeBaja({ estado: r.estado, finArca: r.fin, contratos: r.contratos.length, proyectos: new Set(r.contratos.map((c) => c.userProjectId)).size, puede: r.puede, bajaContrato: unico?.baja || "", baja }, hoy);
    // La lista es de relaciones vivas: una cerrada no es una fila.
    if (s.fuera === "cerrada") continue;
    const comun = { clave: r.clave, empleadoraCuit: r.empleadoraCuit, empleadora: r.empleadora, cuil: r.cuil, persona: r.persona, userId: r.userId, inicio: r.inicio, finArca: r.fin };
    let bloqueo: FilaBajaArca["bloqueo"] = null;
    if (s.situacion === null) {
      const texto = s.fuera === "no_se_opera" ? r.motivo || BLOQUEOS.no_se_opera.texto : BLOQUEOS[s.fuera].texto;
      bloqueo = { motivo: s.fuera, etiqueta: BLOQUEOS[s.fuera].etiqueta, texto };
      bloqueadas.push({ ...comun, motivo: s.fuera, texto, contratos: r.contratos });
    }
    const nombres = [...new Set(r.contratos.map((c) => c.contrato).filter(Boolean))];
    const proyectos = [...new Set(r.contratos.map((c) => c.proyecto).filter(Boolean))];
    filas.push({
      ...comun,
      sinFicha: !r.userId,
      enWeprodu: r.contratos.length ? "con_contrato" : r.userId ? "sin_contrato" : "sin_ficha",
      modalidadArca: r.modalidadContrato,
      tipo: tipoDeRelacion(r.contratos.map((c) => c.contrato), r.modalidadContrato),
      tipoContrato: nombres.join(" · "),
      proyecto: proyectos.join(" · "),
      proyectos,
      finWeprodu: unico?.baja || "",
      diasDesdeFin: unico?.baja && unico.baja < hoy ? dias(unico.baja, hoy) : null,
      situacion: s.situacion,
      bloqueo,
      detalle: s.situacion === null ? "" : detalleDe(s.situacion, r, unico, baja, hoy),
      advertencia: advertenciaDeModalidad(r.modalidadContrato),
      contrato: unico ? { userProjectId: unico.userProjectId, contratoKey: unico.contratoKey, posicion: unico.posicion } : null,
    });
  }
  // Por situación (las bloqueadas al final) y, dentro de cada una, primero las que llevan más días desde el fin.
  const orden = (f: FilaBajaArca) => f.situacion ?? 99;
  filas.sort((a, b) => orden(a) - orden(b) || (b.diasDesdeFin ?? -1) - (a.diasDesdeFin ?? -1) || a.persona.localeCompare(b.persona) || a.inicio.localeCompare(b.inicio));
  bloqueadas.sort((a, b) => a.persona.localeCompare(b.persona) || a.inicio.localeCompare(b.inicio));
  return { hoy, filas, bloqueadas, conteos: contar(filas) };
}

export function contar(filas: { situacion: SituacionBajaArca | null; bloqueo?: { motivo: MotivoBloqueo } | null }[]): ConteosBajaArca {
  const n = (s: SituacionBajaArca) => filas.filter((f) => f.situacion === s).length;
  const c: ConteosBajaArca = { s1: n(1), s2: n(2), s3: n(3), s4: n(4), s5: n(5), s6: n(6), pendientes: 0, bloqueadas: {}, total: filas.length };
  c.pendientes = c.s1 + c.s2 + c.s3 + c.s4;
  for (const f of filas) if (f.situacion === null && f.bloqueo) c.bloqueadas[f.bloqueo.motivo] = (c.bloqueadas[f.bloqueo.motivo] || 0) + 1;
  return c;
}

/**
 * La lista de hoy, sobre el espejo. No abre ARCA. `vivasEnEspejo` se cuenta APARTE, con su propia consulta: es el
 * número contra el que la pantalla comprueba que la lista no perdió ni repitió ninguna relación.
 */
export async function listaBajasArca(tenantId: Types.ObjectId | string): Promise<ListaBajasArca & { vivasEnEspejo: number }> {
  const desde = new Date(`${hoyArgentina()}T00:00:00.000Z`);
  const [{ hoy, relaciones }, vivasEnEspejo] = await Promise.all([
    relacionesOperables(tenantId),
    RelacionLaboralArca.countDocuments({ tenantId: new Types.ObjectId(String(tenantId)), $or: [{ fechaFin: null }, { fechaFin: { $gte: desde } }] }),
  ]);
  return { ...armarListaBajas(relaciones, hoy), vivasEnEspejo };
}

// ───────────────────────────── La foto de cada corrida y los movimientos ─────────────────────────────

/** Una fila CON situación (1 a 6). Las bloqueadas no van en la foto: si una fila pasa a bloqueada, «salió» y se dice a dónde. */
export interface FilaDeFoto {
  clave: string;
  persona: string;
  situacion: SituacionBajaArca;
}

export interface MovimientosBajaArca {
  entraron: FilaDeFoto[];
  /** `ahora` dice dónde quedó, si se sabe (cerrada en ARCA, con varios contratos, baja presentada…). */
  salieron: (FilaDeFoto & { ahora: string })[];
  cambiaron: { clave: string; persona: string; de: SituacionBajaArca; a: SituacionBajaArca }[];
}

export const sinMovimientos = (m: MovimientosBajaArca) => !m.entraron.length && !m.salieron.length && !m.cambiaron.length;

const AHORA: Record<MotivoFuera, string> = {
  cerrada: "se cerró en ARCA",
  varios_contratos: "ahora tiene varios contratos (botón deshabilitado; Auditoría ARCA)",
  varios_proyectos: "ahora está en varios proyectos (botón deshabilitado; Auditoría ARCA)",
  baja_presentada: "se presentó la baja y ARCA la tomó",
  no_se_opera: "ya no hay nada que operar",
};

/** Qué cambió entre dos fotos de la lista. `bloqueadas`: las que hoy siguen vivas pero sin situación. Pura. */
export function movimientosEntre(antes: FilaDeFoto[], ahora: FilaDeFoto[], bloqueadas: { clave: string; motivo: MotivoBloqueo }[] = []): MovimientosBajaArca {
  const eraDe = new Map(antes.map((f) => [f.clave, f]));
  const esDe = new Map(ahora.map((f) => [f.clave, f]));
  const bloqueoDe = new Map(bloqueadas.map((f) => [f.clave, f.motivo]));
  return {
    entraron: ahora.filter((f) => !eraDe.has(f.clave)),
    salieron: antes.filter((f) => !esDe.has(f.clave)).map((f) => ({ ...f, ahora: AHORA[bloqueoDe.get(f.clave) || "cerrada"] || AHORA.cerrada })),
    cambiaron: ahora.filter((f) => eraDe.has(f.clave) && eraDe.get(f.clave)!.situacion !== f.situacion).map((f) => ({ clave: f.clave, persona: f.persona, de: eraDe.get(f.clave)!.situacion, a: f.situacion })),
  };
}

const BASE = "integrations.arcaSimplificacion.sincronizacionRelaciones.bajasArca";
/** Cuántos días con cambios se guardan. */
const MOVIMIENTOS_GUARDADOS = 60;

export interface FotoBajasArca {
  el: string;
  conteos: ConteosBajaArca;
  filas: FilaDeFoto[];
}

export interface GuardadoBajasArca {
  /** Los conteos de la última vez que alguien calculó la lista (la corrida o la pantalla): lo que lee el menú. */
  actual: { el: string; conteos: ConteosBajaArca } | null;
  /** La foto de la última corrida automática. */
  corrida: FotoBajasArca | null;
  /** Qué cambió en cada corrida respecto de la anterior (sólo las que cambiaron algo), de la más nueva a la más vieja. */
  movimientos: ({ el: string; conteos: ConteosBajaArca } & MovimientosBajaArca)[];
}

const iso = (d: unknown) => (d ? new Date(d as any).toISOString() : "");

export async function guardadoBajasArca(tenantId: Types.ObjectId | string): Promise<GuardadoBajasArca> {
  const t: any = await Tenant.findById(new Types.ObjectId(String(tenantId))).select(BASE).lean();
  const b = t?.integrations?.arcaSimplificacion?.sincronizacionRelaciones?.bajasArca;
  return {
    actual: b?.actual?.conteos ? { el: iso(b.actual.el), conteos: b.actual.conteos } : null,
    corrida: b?.corrida?.conteos ? { el: iso(b.corrida.el), conteos: b.corrida.conteos, filas: b.corrida.filas || [] } : null,
    movimientos: ((b?.movimientos || []) as any[]).map((m) => ({ el: iso(m.el), conteos: m.conteos, entraron: m.entraron || [], salieron: m.salieron || [], cambiaron: m.cambiaron || [] })).reverse(),
  };
}

/** Deja los conteos de ahora para el contador del menú (cada vez que se abre la lista). No toca la foto de la corrida. */
export async function guardarConteosActuales(tenantId: Types.ObjectId | string, conteos: ConteosBajaArca): Promise<void> {
  await Tenant.updateOne({ _id: new Types.ObjectId(String(tenantId)) }, { $set: { [`${BASE}.actual`]: { el: new Date(), conteos } } });
}

const fotoDe = (l: ListaBajasArca): FilaDeFoto[] => l.filas.flatMap((f) => (f.situacion === null ? [] : [{ clave: f.clave, persona: f.persona, situacion: f.situacion }]));

/** «8 pendientes (1: 0 · 2: 0 · 3: 0 · 4: 8) y 98 de inventario (5: 68 · 6: 30)». */
export const resumenDeConteos = (c: ConteosBajaArca): string => {
  const bloqueadas = Object.values(c.bloqueadas || {}).reduce((s, n) => s + (n || 0), 0);
  return `${c.pendientes} pendientes (1: ${c.s1} · 2: ${c.s2} · 3: ${c.s3} · 4: ${c.s4}) y ${c.s5 + c.s6} de inventario (5: ${c.s5} · 6: ${c.s6})${bloqueadas ? ` · ${bloqueadas} sin poder operarse desde acá` : ""}`;
};

/**
 * Para la corrida automática de las 06:00: calcula la lista, guarda la foto y, si algo cambió respecto de la foto
 * anterior, lo anota. Nunca tira.
 */
export async function guardarCorridaBajasArca(tenantId: Types.ObjectId | string): Promise<ConteosBajaArca | null> {
  try {
    const [lista, previo] = await Promise.all([listaBajasArca(tenantId), guardadoBajasArca(tenantId)]);
    const el = new Date();
    const filas = fotoDe(lista);
    const set: Record<string, unknown> = { [`${BASE}.corrida`]: { el, conteos: lista.conteos, filas }, [`${BASE}.actual`]: { el, conteos: lista.conteos } };
    const mov = previo.corrida ? movimientosEntre(previo.corrida.filas, filas, lista.bloqueadas) : null;
    const update: Record<string, unknown> = { $set: set };
    if (mov && !sinMovimientos(mov)) update.$push = { [`${BASE}.movimientos`]: { $each: [{ el, conteos: lista.conteos, ...mov }], $slice: -MOVIMIENTOS_GUARDADOS } };
    await Tenant.updateOne({ _id: new Types.ObjectId(String(tenantId)) }, update);
    const c = lista.conteos;
    console.log(`[bajas-arca] ${tenantId}: ${resumenDeConteos(c)} · ${c.total} filas, ${lista.vivasEnEspejo} vivas en el espejo${c.total !== lista.vivasEnEspejo ? " (NO COINCIDEN)" : ""}${mov && !sinMovimientos(mov) ? ` · entraron ${mov.entraron.length}, salieron ${mov.salieron.length}, cambiaron ${mov.cambiaron.length}` : ""}`);
    return c;
  } catch (e: any) {
    console.error(`[bajas-arca] ${tenantId}: no pude guardar la foto de la lista:`, e?.message || e);
    return null;
  }
}

/** La lista con lo guardado: lo que pide la pantalla. Deja los conteos de ahora para el menú. */
export async function listaBajasArcaConFoto(tenantId: Types.ObjectId | string): Promise<ListaBajasArca & { vivasEnEspejo: number; corrida: { el: string; conteos: ConteosBajaArca } | null; desdeLaCorrida: MovimientosBajaArca | null; movimientos: GuardadoBajasArca["movimientos"] }> {
  const [lista, guardado] = await Promise.all([listaBajasArca(tenantId), guardadoBajasArca(tenantId)]);
  await guardarConteosActuales(tenantId, lista.conteos).catch(() => {});
  return {
    ...lista,
    corrida: guardado.corrida ? { el: guardado.corrida.el, conteos: guardado.corrida.conteos } : null,
    desdeLaCorrida: guardado.corrida ? movimientosEntre(guardado.corrida.filas, fotoDe(lista), lista.bloqueadas) : null,
    movimientos: guardado.movimientos,
  };
}
