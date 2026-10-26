/**
 * DÓNDE VA LA FIRMA EN CADA TIPO DE DOCUMENTO (bot de Dropbox Sign, 22/10/2026). Módulo DECLARATIVO y
 * PURO: una tabla de reglas por tipo, anclada al TEXTO del PDF (y, cuando el rótulo está dibujado y no
 * escrito, a las palabras que devuelve el OCR de la franja). Sin ancla NO se envía: el documento queda
 * en revisión con el motivo. No hay recetas de pantalla de respaldo: lo que muestra la previsualización
 * es exactamente lo que el motor va a colocar.
 *
 * Las reglas son SERIALIZABLES (patrones como texto): el catálogo de abajo es el de fábrica y cada
 * tenant guarda su copia editable (`integrations.dropboxSign.bot.reglasColocacion`, ver
 * `services/dropboxSignBot/reglasTenant.ts`). Agregar un tipo = una entrada acá + un fixture + un test;
 * el motor no conoce tipos.
 *
 * Coordenadas: PUNTOS PDF, con `y` medido DESDE ARRIBA de la página (así «sobre la línea» es `y`
 * menor). La conversión a píxeles de pantalla es `pdfAPantalla`, con la caja de la página renderizada
 * en el editor.
 *
 * TRES TIPOS DE ANCLA:
 *   · derechaDelRotulo   «Firma: ______»: el campo va a la derecha del rótulo, sobre la línea de guiones
 *                        de ese mismo renglón (contratos).
 *   · sobreRotulo        una línea horizontal con el rótulo DEBAJO («Firma Empleado» del recibo, la
 *                        celda de la constancia de ARCA): el campo va encima de la línea, centrado en el
 *                        rótulo, con el ancho de la línea.
 *   · columnaDelFirmante dos columnas con «______ / Firma / Aclaración: NOMBRE» (releases): la columna
 *                        cuya «Aclaración» trae el nombre del firmante; el campo va sobre su línea.
 *
 * LO QUE NUNCA: ninguna coincidencia cuyo texto contenga una palabra de `excluir` («Empleador» por
 * defecto) puede ser ancla, y el rótulo se compara ENTERO y por palabra: «Firma Empleado» no matchea
 * adentro de «Firma Empleador». Lo descartado se devuelve con su motivo para que la UI lo muestre.
 */

export interface ItemTexto {
  str: string;
  x: number;
  /** Desde arriba de la página. */
  y: number;
  w: number;
  h: number;
  /** De dónde salió: la capa de texto del PDF o el OCR de la franja. */
  fuente?: "texto" | "ocr";
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PaginaPdf {
  /** Base 1. */
  numero: number;
  ancho: number;
  alto: number;
  items: ItemTexto[];
  /** Palabras leídas por OCR de la franja (si se hizo). */
  ocr?: ItemTexto[];
  /** Líneas horizontales detectadas en la imagen de la franja (puntos PDF). */
  lineas?: Rect[];
}

export interface PuntoPdf {
  x: number;
  y: number;
}

export type TipoAncla = "derechaDelRotulo" | "sobreRotulo" | "columnaDelFirmante";

export const TIPOS_ANCLA: Record<TipoAncla, string> = {
  derechaDelRotulo: "A la derecha del rótulo, sobre la línea de guiones del mismo renglón",
  sobreRotulo: "Encima de la línea que tiene el rótulo debajo, centrada en el rótulo",
  columnaDelFirmante: "La columna cuya «Aclaración» trae el nombre del firmante, sobre su línea",
};

export type Ocurrencia = "ultima" | "primera";

export interface Ancla {
  tipo: TipoAncla;
  /** Texto o expresión regular (sin tildes obligatorias) del rótulo a buscar. */
  rotulo: string;
  /** Con varias coincidencias válidas, cuál: la última (por defecto) o la primera del documento. */
  ocurrencia: Ocurrencia;
  /** Palabras que descartan una coincidencia (comparación por palabra entera, sin tildes ni mayúsculas). */
  excluir: string[];
  /** Ajuste fino del campo, en puntos PDF. */
  offset: { dx: number; dy: number };
}

export type Validacion =
  | { tipo: "enMitadIzquierda" }
  | { tipo: "enMitadDerecha" }
  /** El campo no puede quedar a menos de `distanciaMin` puntos de ningún texto que matchee. */
  | { tipo: "lejosDeTexto"; patron: string; distanciaMin: number }
  /** El campo tiene que quedar a lo sumo a `distanciaMax` puntos de un texto que matchee. `"FIRMANTE"` = el nombre del firmante. */
  | { tipo: "textoCercano"; patron: string; distanciaMax: number };

export interface ReglaColocacion {
  tipo: string;
  /** Expresión regular (insensible a mayúsculas) sobre el nombre de archivo. */
  patronNombre: string;
  /** `pendiente` = reconocido pero sin regla: requiere_revision, nunca se envía. */
  estado: "activo" | "pendiente";
  motivoPendiente?: string;
  /** Dónde buscar el ancla. */
  pagina: "primera" | "ultima" | "cualquiera";
  /** Se prueban en orden; la primera con coincidencias válidas manda. */
  anclas: Ancla[];
  /** Si el rótulo no está en la capa de texto: franja de la página (fracciones del alto) que se lee por OCR. */
  ocr: { desde: number; hasta: number } | null;
  /** Alto del campo (pt). El ancho es el de la línea del ancla; si no se mide, `anchoFijo`. */
  campo: { alto: number; anchoFijo: number };
  validaciones: Validacion[];
  /** Qué se espera ver, para quien lea el log. */
  descripcion: string;
}

/** Viewport con el que se validó el editor. El motor lo exige. */
export const VIEWPORT = { width: 1457, height: 812 } as const;
/** Dónde está el ítem «Firma» del panel izquierdo del editor, en ese viewport. */
export const ORIGEN_FIRMA = { x: 69, y: 504 } as const;
/** Tolerancia (puntos PDF) del rectángulo donde tiene que caer el centro del campo colocado. */
export const TOLERANCIA = { x: 70, y: 40 } as const;

const EXCLUIR_SIEMPRE = ["Empleador"];
const FRANJA_PIE = { desde: 0.85, hasta: 1 };

export const REGLAS_BASE: ReglaColocacion[] = [
  {
    tipo: "AltaAFIP",
    patronNombre: "_AltaAFIP_",
    estado: "activo",
    pagina: "primera",
    anclas: [{ tipo: "sobreRotulo", rotulo: "Firma empleado y fecha de notificaci[oó]n", ocurrencia: "ultima", excluir: EXCLUIR_SIEMPRE, offset: { dx: 0, dy: 0 } }],
    ocr: null,
    campo: { alto: 32, anchoFijo: 150 },
    validaciones: [
      { tipo: "enMitadDerecha" },
      { tipo: "lejosDeTexto", patron: "Fecha de alta telef[oó]nica", distanciaMin: 40 },
    ],
    descripcion: "ARCA «Constancia del Trabajador / Alta», página 1: la celda vacía «Firma empleado y fecha de notificación» (la página 2, talón del empleador, no se firma)",
  },
  {
    tipo: "Contrato_Jornada",
    patronNombre: "_Contrato_Jornada(_|\\.pdf$)",
    estado: "activo",
    pagina: "ultima",
    anclas: [{ tipo: "derechaDelRotulo", rotulo: "Firma:", ocurrencia: "ultima", excluir: EXCLUIR_SIEMPRE, offset: { dx: 0, dy: 0 } }],
    ocr: null,
    campo: { alto: 45, anchoFijo: 170 },
    validaciones: [{ tipo: "lejosDeTexto", patron: "Aclaraci[oó]n", distanciaMin: 12 }],
    descripcion: "«CONTRATO DE PLAZO FIJO - JORNADA», última página: sobre la línea «Firma: ____»",
  },
  {
    tipo: "Contrato_Plazo-fijo",
    patronNombre: "_Contrato_Plazo-fijo",
    estado: "activo",
    pagina: "ultima",
    anclas: [{ tipo: "derechaDelRotulo", rotulo: "Firma:", ocurrencia: "ultima", excluir: EXCLUIR_SIEMPRE, offset: { dx: 0, dy: 0 } }],
    ocr: null,
    campo: { alto: 45, anchoFijo: 170 },
    validaciones: [{ tipo: "lejosDeTexto", patron: "Aclaraci[oó]n", distanciaMin: 12 }],
    descripcion: "«CONTRATO PLAZO FIJO 6X6» (y variantes), última página: sobre la línea «Firma: ____»",
  },
  {
    tipo: "Contrato_Servicios",
    patronNombre: "_Contrato_Servicios",
    estado: "activo",
    pagina: "ultima",
    anclas: [{ tipo: "derechaDelRotulo", rotulo: "Firma:", ocurrencia: "ultima", excluir: EXCLUIR_SIEMPRE, offset: { dx: 0, dy: 0 } }],
    ocr: null,
    campo: { alto: 45, anchoFijo: 170 },
    validaciones: [{ tipo: "lejosDeTexto", patron: "Aclaraci[oó]n", distanciaMin: 12 }],
    descripcion: "Contrato de servicios, última página: sobre la línea «Firma: ____» (el rótulo viene dos veces en el renglón; se toma el que precede a la línea)",
  },
  {
    tipo: "Release",
    patronNombre: "_Release_(?!Servicios)",
    estado: "activo",
    pagina: "ultima",
    anclas: [{ tipo: "columnaDelFirmante", rotulo: "Aclaraci[oó]n:", ocurrencia: "ultima", excluir: [...EXCLUIR_SIEMPRE, "Socio Gerente"], offset: { dx: 0, dy: 0 } }],
    ocr: null,
    campo: { alto: 45, anchoFijo: 190 },
    validaciones: [{ tipo: "textoCercano", patron: "FIRMANTE", distanciaMax: 90 }],
    descripcion: "«ACUERDO DE TITULARIDAD DE LA OBRA», última página: la línea de firma de la columna del firmante, sobre «Aclaración: <SU NOMBRE>». La otra columna es del empleador y no se toca",
  },
  {
    tipo: "Release_Servicios",
    patronNombre: "_Release_Servicios",
    estado: "activo",
    pagina: "ultima",
    anclas: [
      { tipo: "derechaDelRotulo", rotulo: "Firma:", ocurrencia: "ultima", excluir: EXCLUIR_SIEMPRE, offset: { dx: 0, dy: 0 } },
      { tipo: "columnaDelFirmante", rotulo: "Aclaraci[oó]n:", ocurrencia: "ultima", excluir: [...EXCLUIR_SIEMPRE, "Socio Gerente"], offset: { dx: 0, dy: 0 } },
    ],
    ocr: null,
    campo: { alto: 45, anchoFijo: 180 },
    validaciones: [],
    descripcion: "Release de servicios, última página: sobre la línea «Firma: ____» si la hay; si no, la columna cuya «Aclaración» trae el nombre del firmante",
  },
  {
    tipo: "REC_SUELDO",
    patronNombre: "_REC_SUELDO_",
    estado: "activo",
    pagina: "cualquiera",
    anclas: [{ tipo: "sobreRotulo", rotulo: "Firma Empleado", ocurrencia: "ultima", excluir: EXCLUIR_SIEMPRE, offset: { dx: 0, dy: 0 } }],
    ocr: FRANJA_PIE,
    campo: { alto: 40, anchoFijo: 115 },
    validaciones: [],
    descripcion: "Recibo de sueldo (MEMOSOFT): la línea del pie con «Firma Empleado» debajo, en el ORIGINAL. La COPIA trae «Firma Empleador» con la firma del empleador impresa y se descarta. Los rótulos del pie están dibujados: se leen por OCR",
  },
];

/* ─────────────────────────── texto ─────────────────────────── */

export const sinTildes = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const normalizarNombre = (s: string) => sinTildes(s).toUpperCase().replace(/\s+/g, " ").trim();
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PARECE_REGEX = /[\\\[\](){}|^$+?*]/;

/** Compila una expresión regular guardada como texto; `null` si no compila. */
export function compilar(patron: string, flags = "i"): RegExp | null {
  try {
    return new RegExp(patron, flags);
  } catch {
    return null;
  }
}

/** El patrón de un rótulo: regex si lo parece, texto literal (espacios flexibles) si no. */
export function patronDeRotulo(rotulo: string): RegExp | null {
  const r = String(rotulo || "").trim();
  if (!r) return null;
  return PARECE_REGEX.test(r) ? compilar(r) : compilar(escapar(sinTildes(r)).replace(/\s+/g, "\\s+"));
}

const ES_LETRA = /[\p{L}\p{N}]/u;

/** El tramo [desde, hasta) extendido a los bordes de palabra: «Firma Empleado» adentro de «Firma Empleador» se extiende a «Firma Empleador». */
export function extenderAPalabra(texto: string, desde: number, hasta: number): { desde: number; hasta: number } {
  let d = desde;
  let h = hasta;
  while (d > 0 && ES_LETRA.test(texto[d - 1])) d--;
  while (h < texto.length && ES_LETRA.test(texto[h])) h++;
  return { desde: d, hasta: h };
}

/** ¿El texto contiene esa palabra ENTERA (sin tildes ni mayúsculas)? «Empleador» no está en «Firma Empleado». */
export function contienePalabra(texto: string, palabra: string): boolean {
  const p = String(palabra || "").trim();
  if (!p) return false;
  const re = compilar(`(?<![\\p{L}\\p{N}])(?:${escapar(sinTildes(p)).replace(/\s+/g, "\\s+")})(?![\\p{L}\\p{N}])`, "iu");
  return !!re && re.test(sinTildes(texto));
}

const patronDeFirmante = (nombre?: string): RegExp | null => {
  const n = normalizarNombre(nombre || "");
  if (!n) return null;
  // Las palabras del nombre en cualquier orden y con cualquier espacio en el medio (el PDF puede traer «ETHEL INES PARRINELLO» y la base «ETHEL PARRINELLO»).
  const palabras = n.split(" ").filter((p) => p.length > 1);
  return new RegExp(palabras.map((p) => `(?=.*${escapar(p)})`).join("") + ".*", "i");
};

/* ─────────────────────────── geometría ─────────────────────────── */

/** Distancia (puntos) de un punto al rectángulo de un ítem: 0 si cae adentro. */
export function distanciaARect(p: PuntoPdf, r: Rect): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** Puntos PDF → píxeles de pantalla, dada la caja (px) de la página renderizada en el editor. */
export function pdfAPantalla(punto: PuntoPdf, pagina: { ancho: number; alto: number }, caja: Rect): { x: number; y: number } {
  return { x: caja.x + (punto.x / pagina.ancho) * caja.w, y: caja.y + (punto.y / pagina.alto) * caja.h };
}

/** Píxeles de pantalla → puntos PDF (para verificar dónde quedó el campo). */
export function pantallaAPdf(px: { x: number; y: number }, pagina: { ancho: number; alto: number }, caja: Rect): PuntoPdf {
  return { x: ((px.x - caja.x) / caja.w) * pagina.ancho, y: ((px.y - caja.y) / caja.h) * pagina.alto };
}

const centroDe = (r: Rect): PuntoPdf => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/* ─────────────────────────── líneas y coincidencias ─────────────────────────── */

/** Un renglón: ítems vecinos a la misma altura, unidos con un espacio, con el mapa de caracteres a x. */
export interface Renglon {
  texto: string;
  rect: Rect;
  partes: Array<ItemTexto & { desde: number; hasta: number }>;
}

/** Los renglones de una página (capa de texto + palabras del OCR), de arriba hacia abajo. */
export function renglonesDe(pagina: PaginaPdf): Renglon[] {
  const items = [...pagina.items.map((i) => ({ ...i, fuente: i.fuente || ("texto" as const) })), ...(pagina.ocr || []).map((i) => ({ ...i, fuente: "ocr" as const }))].filter((i) => i.str.trim());
  const grupos: ItemTexto[][] = [];
  for (const i of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const g = grupos[grupos.length - 1];
    // Misma línea = `y` a menos de 3 pt del primero del grupo (las cajas del OCR varían más por los trazos ascendentes: medio alto).
    const tolerancia = Math.max(3, (i.fuente === "ocr" ? i.h : 0) * 0.6);
    if (g && g[0].fuente === i.fuente && Math.abs(g[0].y - i.y) <= tolerancia) g.push(i);
    else grupos.push([i]);
  }
  return grupos.map((g) => {
    const ordenados = [...g].sort((a, b) => a.x - b.x);
    const partes: Renglon["partes"] = [];
    let texto = "";
    for (const it of ordenados) {
      if (texto) texto += " ";
      partes.push({ ...it, desde: texto.length, hasta: texto.length + it.str.length });
      texto += it.str;
    }
    const x = Math.min(...ordenados.map((i) => i.x));
    const der = Math.max(...ordenados.map((i) => i.x + i.w));
    const y = Math.min(...ordenados.map((i) => i.y));
    const abajo = Math.max(...ordenados.map((i) => i.y + i.h));
    return { texto, rect: { x, y, w: der - x, h: abajo - y }, partes };
  });
}

/** La x de un carácter del renglón (interpolando dentro del ítem que lo contiene). */
function xDeCaracter(r: Renglon, c: number): number {
  for (const p of r.partes) {
    if (c >= p.desde && c <= p.hasta) return p.x + ((c - p.desde) / Math.max(1, p.hasta - p.desde)) * p.w;
    if (c < p.desde) return p.x; // en el espacio entre dos ítems: el inicio del siguiente
  }
  const u = r.partes[r.partes.length - 1];
  return u ? u.x + u.w : r.rect.x;
}

/** El rectángulo de un tramo [desde, hasta) de caracteres del renglón. */
export function rectDeTramo(r: Renglon, desde: number, hasta: number): Rect {
  const partes = r.partes.filter((p) => p.hasta > desde && p.desde < hasta);
  const x1 = xDeCaracter(r, desde);
  const x2 = Math.max(x1 + 1, xDeCaracter(r, hasta));
  const y = partes.length ? Math.min(...partes.map((p) => p.y)) : r.rect.y;
  const abajo = partes.length ? Math.max(...partes.map((p) => p.y + p.h)) : r.rect.y + r.rect.h;
  return { x: x1, y, w: x2 - x1, h: abajo - y };
}

export interface Coincidencia {
  /** El renglón entero. */
  renglon: Renglon;
  texto: string;
  /** Tramo del rótulo. */
  desde: number;
  hasta: number;
  rect: Rect;
  /** Lo que sigue al rótulo hasta la próxima coincidencia (o el fin del renglón). */
  segmento: string;
  segmentoDesde: number;
  segmentoHasta: number;
  fuente: "texto" | "ocr";
}

/** Todas las coincidencias de un patrón en los renglones de la página, en orden de lectura. */
export function coincidencias(pagina: PaginaPdf, patron: RegExp): Coincidencia[] {
  const res: Coincidencia[] = [];
  const global = new RegExp(patron.source, patron.flags.includes("g") ? patron.flags : `${patron.flags}g`);
  for (const r of renglonesDe(pagina)) {
    const textoSinTildes = sinTildes(r.texto);
    const matches = [...textoSinTildes.matchAll(global)].filter((m) => (m[0] || "").length > 0);
    matches.forEach((m, i) => {
      const desde = m.index || 0;
      const hasta = desde + m[0].length;
      const segmentoHasta = i + 1 < matches.length ? matches[i + 1].index || r.texto.length : r.texto.length;
      const fuente = r.partes.find((p) => p.hasta > desde && p.desde < hasta)?.fuente || "texto";
      res.push({ renglon: r, texto: r.texto, desde, hasta, rect: rectDeTramo(r, desde, hasta), segmento: r.texto.slice(hasta, segmentoHasta), segmentoDesde: hasta, segmentoHasta, fuente });
    });
  }
  return res;
}

/** Los tramos de texto que matchean (como ítems), también cuando la frase está partida en varios ítems del renglón. */
export function buscarTexto(pagina: PaginaPdf, patron: RegExp): ItemTexto[] {
  return coincidencias(pagina, patron).map((c) => ({ str: c.texto.slice(c.desde, c.hasta), ...c.rect, fuente: c.fuente }));
}

/* ─────────────────────────── validaciones ─────────────────────────── */

export interface ContextoValidacion {
  pagina: PaginaPdf;
  paginaIndex: number;
  totalPaginas: number;
  nombreFirmante?: string;
}

/** Aplica las validaciones a un punto. Devuelve las que fallan (vacío = ok). */
export function validarPunto(punto: PuntoPdf, validaciones: Validacion[], ctx: ContextoValidacion): string[] {
  const fallas: string[] = [];
  const itemsNorm = [...ctx.pagina.items, ...(ctx.pagina.ocr || [])].map((i) => ({ ...i, str: sinTildes(i.str) }));
  for (const v of validaciones) {
    switch (v.tipo) {
      case "enMitadIzquierda":
        if (punto.x > ctx.pagina.ancho / 2) fallas.push("el campo cae en la mitad derecha de la página");
        break;
      case "enMitadDerecha":
        if (punto.x < ctx.pagina.ancho / 2) fallas.push("el campo cae en la mitad izquierda de la página");
        break;
      case "lejosDeTexto": {
        const re = compilar(v.patron);
        if (!re) break;
        const cerca = itemsNorm.filter((i) => re.test(i.str)).map((i) => distanciaARect(punto, i));
        if (cerca.some((d) => d < v.distanciaMin)) fallas.push(`queda a menos de ${v.distanciaMin} pt de «${v.patron}»`);
        break;
      }
      case "textoCercano": {
        const patron = v.patron === "FIRMANTE" ? patronDeFirmante(ctx.nombreFirmante) : compilar(v.patron);
        if (!patron) {
          fallas.push(v.patron === "FIRMANTE" ? "no hay nombre de firmante para verificar la cercanía" : `el patrón «${v.patron}» no compila`);
          break;
        }
        const dist = itemsNorm.filter((i) => patron.test(normalizarNombre(i.str)) || patron.test(i.str)).map((i) => distanciaARect(punto, i));
        if (!dist.length || Math.min(...dist) > v.distanciaMax) fallas.push(`queda a más de ${v.distanciaMax} pt de «${v.patron === "FIRMANTE" ? ctx.nombreFirmante : v.patron}»`);
        break;
      }
    }
  }
  return fallas;
}

/* ─────────────────────────── reglas ─────────────────────────── */

/** La regla que matchea el nombre de archivo, o `null`. `Release_Servicios` no matchea `Release`. */
export function reglaDe(nombreArchivo: string, reglas: ReglaColocacion[] = REGLAS_BASE): ReglaColocacion | null {
  const n = String(nombreArchivo || "");
  return reglas.find((r) => compilar(r.patronNombre)?.test(n)) || null;
}

/** Por qué un archivo no se puede enviar por su tipo, o `null` si tiene regla activa. */
export function motivoPorTipo(nombreArchivo: string, reglas: ReglaColocacion[] = REGLAS_BASE): string | null {
  const r = reglaDe(nombreArchivo, reglas);
  if (!r) return `Tipo de documento sin regla de colocación de la firma: el nombre no matchea ningún patrón conocido (${reglas.map((x) => x.tipo).join(", ")}).`;
  if (r.estado === "pendiente") return `Tipo ${r.tipo}: ${r.motivoPendiente || "falta definir posición de firma"}`;
  return null;
}

const TIPOS_VALIDACION = ["enMitadIzquierda", "enMitadDerecha", "lejosDeTexto", "textoCercano"];

/** Valida y normaliza una lista de reglas (lo que llega del PUT). */
export function validarReglas(entrada: unknown): { ok: true; reglas: ReglaColocacion[] } | { ok: false; error: string } {
  if (!Array.isArray(entrada) || entrada.length === 0) return { ok: false, error: "Tiene que haber al menos una regla." };
  const reglas: ReglaColocacion[] = [];
  const tipos = new Set<string>();
  const num = (v: any, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);
  for (const [i, r] of (entrada as any[]).entries()) {
    const donde = `Regla ${i + 1}${r?.tipo ? ` (${r.tipo})` : ""}`;
    const tipo = String(r?.tipo || "").trim();
    if (!tipo) return { ok: false, error: `${donde}: falta el tipo.` };
    if (tipos.has(tipo)) return { ok: false, error: `${donde}: el tipo está repetido.` };
    tipos.add(tipo);
    const patronNombre = String(r?.patronNombre || "").trim();
    if (!patronNombre || !compilar(patronNombre)) return { ok: false, error: `${donde}: el patrón del nombre de archivo está vacío o no compila.` };
    const estado = r?.estado === "pendiente" ? "pendiente" : "activo";
    const pagina = ["primera", "ultima", "cualquiera"].includes(r?.pagina) ? r.pagina : "ultima";
    const anclas: Ancla[] = [];
    for (const [j, a] of (Array.isArray(r?.anclas) ? r.anclas : []).entries()) {
      if (!(a?.tipo in TIPOS_ANCLA)) return { ok: false, error: `${donde}, ancla ${j + 1}: tipo de ancla desconocido.` };
      const rotulo = String(a?.rotulo || "").trim();
      if (!rotulo || !patronDeRotulo(rotulo)) return { ok: false, error: `${donde}, ancla ${j + 1}: el rótulo está vacío o no compila.` };
      const excluir = (Array.isArray(a?.excluir) ? a.excluir : []).map((e: any) => String(e || "").trim()).filter(Boolean);
      anclas.push({ tipo: a.tipo, rotulo, ocurrencia: a?.ocurrencia === "primera" ? "primera" : "ultima", excluir, offset: { dx: num(a?.offset?.dx, 0), dy: num(a?.offset?.dy, 0) } });
    }
    if (estado === "activo" && anclas.length === 0) return { ok: false, error: `${donde}: una regla activa necesita al menos un ancla.` };
    let ocr: ReglaColocacion["ocr"] = null;
    if (r?.ocr && typeof r.ocr === "object") {
      const desde = num(r.ocr.desde, 0.85);
      const hasta = num(r.ocr.hasta, 1);
      if (desde < 0 || hasta > 1 || desde >= hasta) return { ok: false, error: `${donde}: la franja de OCR tiene que ir de 0 a 1, con «desde» menor que «hasta».` };
      ocr = { desde, hasta };
    }
    const alto = num(r?.campo?.alto, 45);
    const anchoFijo = num(r?.campo?.anchoFijo, 170);
    if (alto < 10 || alto > 200 || anchoFijo < 20 || anchoFijo > 500) return { ok: false, error: `${donde}: el campo tiene que medir entre 10 y 200 pt de alto y entre 20 y 500 pt de ancho.` };
    const validaciones: Validacion[] = [];
    for (const v of Array.isArray(r?.validaciones) ? r.validaciones : []) {
      if (!TIPOS_VALIDACION.includes(v?.tipo)) return { ok: false, error: `${donde}: validación desconocida «${v?.tipo}».` };
      if (v.tipo === "lejosDeTexto" || v.tipo === "textoCercano") {
        const patron = String(v?.patron || "").trim();
        if (!patron || (patron !== "FIRMANTE" && !compilar(patron))) return { ok: false, error: `${donde}: el patrón de una validación está vacío o no compila.` };
        validaciones.push(v.tipo === "lejosDeTexto" ? { tipo: "lejosDeTexto", patron, distanciaMin: num(v?.distanciaMin, 12) } : { tipo: "textoCercano", patron, distanciaMax: num(v?.distanciaMax, 90) });
      } else validaciones.push({ tipo: v.tipo });
    }
    reglas.push({ tipo, patronNombre, estado, ...(estado === "pendiente" ? { motivoPendiente: String(r?.motivoPendiente || "falta definir posición de firma") } : {}), pagina, anclas, ocr, campo: { alto, anchoFijo }, validaciones, descripcion: String(r?.descripcion || "") });
  }
  return { ok: true, reglas };
}

/* ─────────────────────────── detección ─────────────────────────── */

export interface Candidato {
  /** Base 1. */
  pagina: number;
  paginaIndex: number;
  /** El rótulo tal como se leyó (con el renglón entero en `renglon`). */
  texto: string;
  renglon: string;
  rect: Rect;
  fuente: "texto" | "ocr";
  ancla: TipoAncla;
  rotulo: string;
}

export interface Descartado extends Candidato {
  motivo: string;
}

export interface Colocacion {
  tipo: string;
  /** Adónde tiene que ir el motor. `otra` (una página del medio) no la sabe navegar: requiere_revision. */
  pagina: "primera" | "ultima" | "otra";
  paginaIndex: number;
  /** Cuántas páginas tiene el PDF: el motor lo compara con las que mide en el editor. */
  totalPaginas?: number;
  tamanoPagina: { ancho: number; alto: number };
  /** El campo de firma, en puntos PDF. Es lo que muestra la previsualización. */
  campo: Rect;
  /** El centro del campo: donde se suelta. */
  puntoPdf: PuntoPdf;
  /** Dónde tiene que quedar el centro del campo colocado (± tolerancia). */
  rectEsperado: Rect;
  /** La línea sobre la que va el campo, si se midió. */
  linea: Rect | null;
  descripcion: string;
  /** Qué pasó al resolver, para el log. */
  nota: string;
  /** «plantilla»: la posición la declaró la plantilla al generar el documento (familia A). Ausente = por ancla (familia B). */
  origen?: "plantilla" | "ancla";
}

export type Deteccion =
  | { ok: true; colocacion: Colocacion; ancla: Candidato; descartados: Descartado[] }
  | { ok: false; motivo: string; descartados: Descartado[]; paginaIndex: number | null; tamanoPagina: { ancho: number; alto: number } | null };

const paginaDe = (idx: number, total: number): Colocacion["pagina"] => (idx === 0 ? "primera" : idx === total - 1 ? "ultima" : "otra");
const resumenDeRect = (r: Rect) => `(${Math.round(r.x)}, ${Math.round(r.y)}) ${Math.round(r.w)}×${Math.round(r.h)} pt`;

/** Lo que dice una columna debajo de un rectángulo (ítems que arrancan a la misma x, hasta `alto` pt más abajo). */
function textoDeColumna(pagina: PaginaPdf, ref: Rect, alto: number, toleranciaX = 25): string {
  return [...pagina.items, ...(pagina.ocr || [])]
    .filter((i) => Math.abs(i.x - ref.x) < toleranciaX && i.y > ref.y && i.y <= ref.y + alto)
    .sort((a, b) => a.y - b.y)
    .map((i) => i.str)
    .join(" ");
}

/** Una línea «______» de la capa de texto, por encima de un rectángulo y en su misma columna (la más cercana). */
function lineaDeTextoArriba(pagina: PaginaPdf, ref: Rect, toleranciaX = 25): Rect | null {
  const lineas = renglonesDe(pagina)
    .flatMap((r) => r.partes)
    .filter((p) => /^_{4,}\s*$/.test(p.str) && Math.abs(p.x - ref.x) < toleranciaX && p.y < ref.y)
    .sort((a, b) => b.y - a.y);
  const l = lineas[0];
  return l ? { x: l.x, y: l.y + l.h, w: l.w, h: 0 } : null;
}

/** Una línea horizontal dibujada (detectada en la imagen) justo por encima del rótulo. */
function lineaDibujadaArriba(pagina: PaginaPdf, rotulo: Rect, maxDistancia = 30): Rect | null {
  const cx = rotulo.x + rotulo.w / 2;
  const cerca = (pagina.lineas || []).filter((l) => l.y <= rotulo.y + 2 && rotulo.y - l.y <= maxDistancia && l.x <= cx && l.x + l.w >= cx).sort((a, b) => b.y - a.y);
  return cerca[0] || null;
}

/** El campo a partir del ancla elegida, según el tipo. Devuelve también la línea medida (o null). */
function campoDesde(regla: ReglaColocacion, ancla: Ancla, c: Coincidencia, pagina: PaginaPdf): { campo: Rect; linea: Rect | null; nota: string } {
  const { alto, anchoFijo } = regla.campo;
  const { dx, dy } = ancla.offset;
  const sobre = (linea: Rect): Rect => ({ x: linea.x + dx, y: linea.y - alto + dy, w: linea.w, h: alto });
  switch (ancla.tipo) {
    case "derechaDelRotulo": {
      const m = c.segmento.match(/_{3,}/);
      if (m && m.index !== undefined) {
        const linea = rectDeTramo(c.renglon, c.segmentoDesde + m.index, c.segmentoDesde + m.index + m[0].length);
        const base = { x: linea.x, y: linea.y + linea.h, w: linea.w, h: 0 };
        return { campo: sobre(base), linea: base, nota: `sobre la línea de guiones (${Math.round(linea.w)} pt) a la derecha de «${c.texto.slice(c.desde, c.hasta)}»` };
      }
      const base = { x: c.rect.x + c.rect.w + 6, y: c.rect.y + c.rect.h, w: anchoFijo, h: 0 };
      return { campo: sobre(base), linea: null, nota: `a la derecha de «${c.texto.slice(c.desde, c.hasta)}», sin línea de guiones en el renglón: ancho fijo ${anchoFijo} pt` };
    }
    case "sobreRotulo": {
      const dibujada = lineaDibujadaArriba(pagina, c.rect);
      if (dibujada) return { campo: sobre(dibujada), linea: dibujada, nota: `sobre la línea dibujada (${Math.round(dibujada.w)} pt) que tiene «${c.texto.slice(c.desde, c.hasta)}» debajo` };
      const deTexto = lineaDeTextoArriba(pagina, c.rect, Math.max(25, c.rect.w));
      if (deTexto) return { campo: sobre(deTexto), linea: deTexto, nota: `sobre la línea «____» (${Math.round(deTexto.w)} pt) que tiene «${c.texto.slice(c.desde, c.hasta)}» debajo` };
      const cx = c.rect.x + c.rect.w / 2;
      const base = { x: cx - anchoFijo / 2, y: c.rect.y - 3, w: anchoFijo, h: 0 };
      return { campo: sobre(base), linea: null, nota: `encima de «${c.texto.slice(c.desde, c.hasta)}», sin línea medible: ancho fijo ${anchoFijo} pt centrado en el rótulo` };
    }
    case "columnaDelFirmante": {
      const deTexto = lineaDeTextoArriba(pagina, c.rect);
      if (deTexto) return { campo: sobre(deTexto), linea: deTexto, nota: `sobre la línea «____» (${Math.round(deTexto.w)} pt) de la columna de «${c.texto.slice(c.desde, c.segmentoHasta).trim().slice(0, 40)}»` };
      const dibujada = lineaDibujadaArriba(pagina, c.rect, 70);
      if (dibujada) return { campo: sobre(dibujada), linea: dibujada, nota: `sobre la línea dibujada de la columna de «${c.texto.slice(c.desde, c.segmentoHasta).trim().slice(0, 40)}»` };
      const base = { x: c.rect.x, y: c.rect.y - 50, w: anchoFijo, h: 0 };
      return { campo: sobre(base), linea: null, nota: `en la columna de «${c.texto.slice(c.desde, c.segmentoHasta).trim().slice(0, 40)}», sin línea medible: ancho fijo ${anchoFijo} pt` };
    }
  }
}

/**
 * Resuelve dónde va la firma para ese archivo. Devuelve el campo (puntos PDF) con el ancla elegida y
 * TODO lo que se descartó con su motivo. Nunca devuelve una colocación para un tipo pendiente o
 * desconocido, ni sin ancla: no hay respaldo de pantalla.
 */
export function resolverColocacion(nombreArchivo: string, paginas: PaginaPdf[] | null, contexto: { nombreFirmante?: string } = {}, reglas: ReglaColocacion[] = REGLAS_BASE): Deteccion {
  const motivo = motivoPorTipo(nombreArchivo, reglas);
  if (motivo) return { ok: false, motivo, descartados: [], paginaIndex: null, tamanoPagina: null };
  const regla = reglaDe(nombreArchivo, reglas)!;
  if (!paginas || paginas.length === 0) return { ok: false, motivo: "No se pudo leer el texto del PDF: sin texto no hay ancla y no se envía.", descartados: [], paginaIndex: null, tamanoPagina: null };

  const total = paginas.length;
  const candidatas = regla.pagina === "primera" ? [paginas[0]] : regla.pagina === "ultima" ? [paginas[total - 1]] : paginas;
  const descartados: Descartado[] = [];
  const dondeSeBusco = regla.pagina === "primera" ? "en la primera página" : regla.pagina === "ultima" ? "en la última página" : `en las ${total} páginas`;

  for (const ancla of regla.anclas) {
    const patron = patronDeRotulo(ancla.rotulo);
    if (!patron) continue;
    const validos: Array<{ candidato: Candidato; coincidencia: Coincidencia; pagina: PaginaPdf; paginaIndex: number }> = [];
    for (const pagina of candidatas) {
      const paginaIndex = paginas.indexOf(pagina);
      for (const c of coincidencias(pagina, patron)) {
        // El rótulo se compara ENTERO: si el texto sigue con letras («Firma Empleado» → «Firma Empleador»), no es el rótulo.
        const ext = extenderAPalabra(c.texto, c.desde, c.hasta);
        const textoExt = c.texto.slice(ext.desde, ext.hasta);
        // Lo que se evalúa para excluir: el rótulo (extendido) y lo que le sigue hasta la próxima coincidencia del
        // renglón; en una columna, también lo que dice la columna debajo (cargo, empresa…).
        const esColumna = ancla.tipo === "columnaDelFirmante";
        const tramo = c.texto.slice(ext.desde, c.segmentoHasta) + (esColumna ? ` ${textoDeColumna(pagina, c.rect, 90)}` : "");
        // Lo que se muestra de la coincidencia: el rótulo entero o, en una columna, la aclaración completa.
        const textoBase = esColumna ? c.texto.slice(ext.desde, c.segmentoHasta).trim() : textoExt;
        const rectBase = rectDeTramo(c.renglon, ext.desde, esColumna ? c.segmentoHasta : ext.hasta);
        const base: Candidato = { pagina: pagina.numero, paginaIndex, texto: textoBase.slice(0, 60), renglon: c.texto, rect: rectBase, fuente: c.fuente, ancla: ancla.tipo, rotulo: ancla.rotulo };
        const excluida = [...ancla.excluir, ...EXCLUIR_SIEMPRE].find((e) => contienePalabra(tramo, e));
        if (excluida) {
          descartados.push({ ...base, motivo: `contiene «${excluida}»` });
          continue;
        }
        if (ext.desde !== c.desde || ext.hasta !== c.hasta) {
          descartados.push({ ...base, motivo: `«${textoExt.slice(0, 40)}» no es el rótulo «${ancla.rotulo}» entero` });
          continue;
        }
        if (ancla.tipo === "columnaDelFirmante") {
          const pf = patronDeFirmante(contexto.nombreFirmante);
          if (!pf) {
            descartados.push({ ...base, motivo: "no hay nombre de firmante para elegir la columna" });
            continue;
          }
          if (!pf.test(normalizarNombre(c.segmento))) {
            descartados.push({ ...base, motivo: `la aclaración no es la del firmante (${contexto.nombreFirmante})` });
            continue;
          }
        }
        validos.push({ candidato: base, coincidencia: c, pagina, paginaIndex });
      }
    }
    if (validos.length === 0) continue;
    validos.sort((a, b) => a.paginaIndex - b.paginaIndex || a.candidato.rect.y - b.candidato.rect.y || a.candidato.rect.x - b.candidato.rect.x);
    const enOrden = ancla.ocurrencia === "ultima" ? [...validos].reverse() : validos;
    for (const v of enOrden) {
      const { campo, linea, nota } = campoDesde(regla, ancla, v.coincidencia, v.pagina);
      const punto = centroDe(campo);
      const fallas = validarPunto(punto, regla.validaciones, { pagina: v.pagina, paginaIndex: v.paginaIndex, totalPaginas: total, nombreFirmante: contexto.nombreFirmante });
      if (fallas.length) {
        descartados.push({ ...v.candidato, motivo: `no pasa las validaciones: ${fallas.join("; ")}` });
        continue;
      }
      return {
        ok: true,
        ancla: v.candidato,
        descartados,
        colocacion: {
          tipo: regla.tipo,
          pagina: paginaDe(v.paginaIndex, total),
          paginaIndex: v.paginaIndex,
          totalPaginas: total,
          tamanoPagina: { ancho: v.pagina.ancho, alto: v.pagina.alto },
          campo,
          puntoPdf: punto,
          rectEsperado: { x: punto.x - TOLERANCIA.x, y: punto.y - TOLERANCIA.y, w: TOLERANCIA.x * 2, h: TOLERANCIA.y * 2 },
          linea,
          descripcion: regla.descripcion,
          nota: `Ancla «${v.candidato.texto.slice(0, 40)}» (${v.candidato.fuente === "ocr" ? "OCR" : "texto"}) en la página ${v.pagina.numero} de ${total}, ${nota}; campo ${resumenDeRect(campo)}.`,
        },
      };
    }
  }

  const rotulos = regla.anclas.map((a) => `«${a.rotulo}»`).join(" / ");
  const resumen = descartados
    .slice(0, 4)
    .map((d) => `«${d.texto.slice(0, 30)}» en la pág. ${d.pagina} (${d.motivo})`)
    .join("; ");
  const idx = regla.pagina === "primera" ? 0 : regla.pagina === "ultima" ? total - 1 : null;
  return {
    ok: false,
    motivo: `Ancla ${rotulos} no encontrada ${dondeSeBusco}${resumen ? `; se descartó: ${resumen}` : ""}.`,
    descartados,
    paginaIndex: idx,
    tamanoPagina: idx === null ? null : { ancho: paginas[idx].ancho, alto: paginas[idx].alto },
  };
}

/* ─────────────────── posición DECLARADA por la plantilla (25/10/2026) ─────────────────── */

/*
  DOS FAMILIAS DE DOCUMENTOS.

  A) GENERADOS POR WEPRODU DESDE UNA PLANTILLA (contratos y releases del ABM). La plantilla declara
     dónde se firma con `{{firma}}`, que se imprime como la línea `MARCA_FIRMA` («Firma: ____»). Esa
     línea se ubica EN EL MOMENTO DE GENERAR, en el PDF recién hecho, y la posición viaja con el
     documento (`DocumentoGenerado.colocacionFirma`). El bot la usa tal cual: no busca rótulos ni hace
     OCR, y no depende del nombre del archivo ni de una regla mantenida a mano.

  B) PDFs EXTERNOS (AltaAFIP de ARCA, REC_SUELDO de MEMOSOFT). No salen de ninguna plantilla: siguen
     con el catálogo de reglas por ancla de arriba, sin cambios.

  Por qué se ubica en el PDF y no en el HTML: el motor (html-pdf-node) no devuelve cajas, y con los
  saltos de página la posición en el HTML no dice en qué página cae. El PDF generado es la verdad, y
  leerlo recién hecho es leer EXACTAMENTE lo que se va a firmar.
*/

/** Alto del campo de firma de una plantilla (pt): el mismo de las reglas de contratos, validado con envíos reales. */
export const ALTO_CAMPO_PLANTILLA = 45;

/** La línea que imprime `{{firma}}`: «Firma:» seguido de la línea de guiones (`MARCA_FIRMA` en `utils/employeeDocData.ts`). */
const PATRON_MARCA_FIRMA = /Firma:\s*_{10,}/i;

/** Cuántas veces declara la plantilla dónde firmar (`{{firma}}`, con o sin espacios adentro). */
export const vecesFirmaEnPlantilla = (contenido: string): number => (String(contenido || "").match(/\{\{\s*firma\s*\}\}/gi) || []).length;

export interface MarcaDeFirma {
  /** Base 0. */
  paginaIndex: number;
  /** La línea de guiones, en puntos PDF (y desde arriba). */
  linea: Rect;
  renglon: string;
}

/** Todas las líneas de firma de la plantilla en el PDF, en orden de lectura. */
export function marcasDeFirma(paginas: PaginaPdf[]): MarcaDeFirma[] {
  const res: MarcaDeFirma[] = [];
  for (const [paginaIndex, pagina] of paginas.entries()) {
    for (const c of coincidencias(pagina, PATRON_MARCA_FIRMA)) {
      const guiones = c.texto.indexOf("_", c.desde);
      const linea = rectDeTramo(c.renglon, guiones >= 0 ? guiones : c.desde, c.hasta);
      res.push({ paginaIndex, linea: { x: linea.x, y: linea.y + linea.h, w: linea.w, h: 0 }, renglon: c.texto });
    }
  }
  return res;
}

export interface ColocacionDeclarada {
  origen: "plantilla";
  plantillaTipo: "contrato" | "release";
  plantillaId: string;
  plantillaNombre: string;
  /** La versión de la plantilla con la que se generó (sube con cada cambio de contenido). */
  plantillaVersion: number;
  /** Base 1: la página real donde cayó la firma. */
  pagina: number;
  totalPaginas: number;
  /** El campo de firma, en puntos PDF (origen arriba a la izquierda, como el resto de este módulo). */
  campo: Rect;
  linea: Rect;
  paginaSize: { w: number; h: number };
  /** SHA-256 del PDF generado: si el del Outbox no es éste, la posición no se usa. */
  sha256: string;
  avisos: string[];
  capturadaAt: Date | string;
}

/**
 * De las marcas del PDF a la posición declarada. Con varias se toma la ÚLTIMA (y se avisa), igual que
 * las reglas de contratos. El campo va SOBRE la línea de guiones, con el ancho de la línea.
 */
export function colocacionDesdeMarcas(paginas: PaginaPdf[], vecesDeclarada: number): { ok: true; pagina: number; totalPaginas: number; campo: Rect; linea: Rect; paginaSize: { w: number; h: number }; avisos: string[] } | { ok: false; motivo: string } {
  const marcas = marcasDeFirma(paginas);
  if (marcas.length === 0) return { ok: false, motivo: "la línea de firma («Firma: ____» que imprime {{firma}}) no aparece en el PDF generado" };
  const avisos: string[] = [];
  if (vecesDeclarada > 1 || marcas.length > 1) avisos.push(`La plantilla tiene ${Math.max(vecesDeclarada, marcas.length)} líneas de firma: se toma la última (página ${marcas[marcas.length - 1].paginaIndex + 1}). El bot coloca un solo campo.`);
  const m = marcas[marcas.length - 1];
  const pag = paginas[m.paginaIndex];
  const campo: Rect = { x: m.linea.x, y: m.linea.y - ALTO_CAMPO_PLANTILLA, w: m.linea.w, h: ALTO_CAMPO_PLANTILLA };
  if (campo.x < 0 || campo.y < 0 || campo.x + campo.w > pag.ancho || campo.y + campo.h > pag.alto) return { ok: false, motivo: `el campo de firma (${resumenDeRect(campo)}) se sale de la página ${m.paginaIndex + 1}` };
  if (m.paginaIndex !== 0 && m.paginaIndex !== paginas.length - 1) avisos.push(`La firma cae en la página ${m.paginaIndex + 1} de ${paginas.length}: el bot sólo coloca en la primera o la última, así que estos documentos quedan en revisión. Conviene que la línea de firma sea lo último del documento.`);
  return { ok: true, pagina: m.paginaIndex + 1, totalPaginas: paginas.length, campo, linea: m.linea, paginaSize: { w: pag.ancho, h: pag.alto }, avisos };
}

/** La detección que consume el bot, armada desde la posición declarada: sin rótulo, sin OCR. */
export function deteccionDesdeDeclarada(d: ColocacionDeclarada): Deteccion {
  const paginaIndex = d.pagina - 1;
  const tamanoPagina = { ancho: d.paginaSize.w, alto: d.paginaSize.h };
  const pagina = paginaDe(paginaIndex, d.totalPaginas);
  if (pagina === "otra") {
    return { ok: false, motivo: `La plantilla «${d.plantillaNombre}» pone la firma en la página ${d.pagina} de ${d.totalPaginas}: el bot sólo sabe colocar en la primera o la última página.`, descartados: [], paginaIndex, tamanoPagina };
  }
  const punto = centroDe(d.campo);
  const ancla: Candidato = { pagina: d.pagina, paginaIndex, texto: "Firma: ____ ({{firma}})", renglon: "", rect: d.linea, fuente: "texto", ancla: "derechaDelRotulo", rotulo: "{{firma}}" };
  return {
    ok: true,
    ancla,
    descartados: [],
    colocacion: {
      tipo: `Plantilla «${d.plantillaNombre}»`,
      pagina,
      paginaIndex,
      totalPaginas: Number(d.totalPaginas) || undefined,
      tamanoPagina,
      campo: d.campo,
      puntoPdf: punto,
      rectEsperado: { x: punto.x - TOLERANCIA.x, y: punto.y - TOLERANCIA.y, w: TOLERANCIA.x * 2, h: TOLERANCIA.y * 2 },
      linea: d.linea,
      descripcion: `Posición declarada por la plantilla «${d.plantillaNombre}» (v${d.plantillaVersion}) con {{firma}}: se capturó al generar el documento`,
      nota: `Declarada por la plantilla «${d.plantillaNombre}» v${d.plantillaVersion}: página ${d.pagina} de ${d.totalPaginas}, campo ${resumenDeRect(d.campo)}. Sin búsqueda de rótulo ni OCR.`,
      origen: "plantilla",
    },
  };
}

/**
 * POR QUÉ UNA VERIFICACIÓN GUARDADA YA NO ES EL ESTADO ACTUAL (25/10/2026). El panel mostraba el
 * resultado de días atrás como si fuera de hoy. Vale mientras el PDF del Outbox sea el mismo, las
 * reglas no hayan cambiado (si salió por regla) y la plantilla no tenga una versión nueva (si salió de
 * la plantilla). Vacío = vigente. Las anteriores a este dato no se pueden comparar: se avisa por la fecha.
 */
export function motivosDesactualizado(r: { verificadaAt?: Date | string; origen?: "plantilla" | "ancla"; contentHash?: string; reglasAt?: Date | string | null; plantillaVersion?: number } | null | undefined, actual: { contentHash?: string; reglasAt?: Date | null; plantillaVersion?: number | null }, ahora = new Date()): string[] {
  if (!r?.verificadaAt) return [];
  const m: string[] = [];
  if (r.contentHash && actual.contentHash && r.contentHash !== actual.contentHash) m.push("el PDF del Outbox cambió");
  if (r.origen !== "plantilla" && actual.reglasAt && (!r.reglasAt || new Date(actual.reglasAt).getTime() > new Date(r.reglasAt).getTime()) && new Date(actual.reglasAt).getTime() > new Date(r.verificadaAt).getTime()) m.push("las reglas de colocación cambiaron");
  if (r.origen === "plantilla" && actual.plantillaVersion && r.plantillaVersion && actual.plantillaVersion > r.plantillaVersion) m.push(`la plantilla tiene una versión nueva (v${r.plantillaVersion} → v${actual.plantillaVersion}): regenerá el documento para usarla`);
  if (!r.contentHash && ahora.getTime() - new Date(r.verificadaAt).getTime() > 24 * 3600 * 1000) m.push("es anterior a que se guardara con qué PDF se verificó");
  return m;
}
