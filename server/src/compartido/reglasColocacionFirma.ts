/**
 * DÓNDE VA LA FIRMA EN CADA TIPO DE DOCUMENTO (bot de Dropbox Sign, 22/10/2026). Módulo DECLARATIVO y
 * puro: una tabla de reglas por tipo, anclada al TEXTO del PDF (los PDF los genera la propia app, con
 * texto real), con la receta de pantalla validada a mano como respaldo. Agregar un tipo = agregar
 * una entrada acá + un fixture + un test; el motor no conoce tipos.
 *
 * Coordenadas: PUNTOS PDF, con `y` medido DESDE ARRIBA de la página (así «sobre la línea» es `y`
 * menor). La conversión a píxeles de pantalla es `pdfAPantalla`, con la caja de la página renderizada
 * en el editor.
 *
 * Estrategia (la ejecuta el motor): 1) ANCLA: se busca el texto en la página objetivo y se calcula el
 * punto; 2) FALLBACK: si no hay ancla, la receta de pantalla (viewport 1457×812, zoom «Ajustar al
 * ancho»), y se deja constancia; 3) si no hay nada o la verificación falla dos veces → requiere_revision.
 */

export interface ItemTexto {
  str: string;
  x: number;
  /** Desde arriba de la página. */
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
}

export interface PuntoPdf {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Validacion =
  | { tipo: "enMitadIzquierda" }
  | { tipo: "enMitadDerecha" }
  | { tipo: "enPrimeraPagina" }
  | { tipo: "enUltimaPagina" }
  /** El campo no puede quedar a menos de `distanciaMin` puntos de ningún texto que matchee. */
  | { tipo: "lejosDeTexto"; patron: RegExp; distanciaMin: number }
  /** El campo tiene que quedar a lo sumo a `distanciaMax` puntos de un texto que matchee. `"FIRMANTE"` = el nombre del firmante. */
  | { tipo: "textoCercano"; patron: RegExp | "FIRMANTE"; distanciaMax: number };

export interface Ancla {
  /** Texto a buscar en la página objetivo. `"ACLARACION_FIRMANTE"` busca «Aclaración: <nombre del firmante>». */
  patron: RegExp | "ACLARACION_FIRMANTE";
  posicion: "sobreLineaDerecha" | "centroCeldaDerecha" | "sobreLineaIzquierda";
  /** Ajuste fino en puntos PDF respecto del punto que da la posición. */
  offset: { dx: number; dy: number };
}

export interface FallbackPantalla {
  scroll: { enX: number; enY: number; direccion: "arriba" | "abajo"; ticks: number } | null;
  soltarEn: { x: number; y: number };
}

export interface ReglaColocacion {
  tipo: string;
  patronNombre: RegExp;
  /** `pendiente` = reconocido pero sin regla: requiere_revision, nunca se envía. */
  estado: "activo" | "pendiente";
  /** Motivo que ve el usuario cuando está pendiente. */
  motivoPendiente?: string;
  pagina: "primera" | "ultima" | "paginaDelAncla";
  ancla?: Ancla;
  validaciones: Validacion[];
  fallback?: FallbackPantalla;
  /** Qué se espera ver, para quien lea el log. */
  descripcion: string;
}

/** Viewport con el que se validaron los fallbacks. El motor lo exige. */
export const VIEWPORT = { width: 1457, height: 812 } as const;
/** Dónde está el ítem «Firma» del panel izquierdo del editor, en ese viewport. */
export const ORIGEN_FIRMA = { x: 69, y: 504 } as const;
/** Tolerancia (puntos PDF) del rectángulo donde tiene que caer el campo colocado. */
export const TOLERANCIA = { x: 70, y: 40 } as const;

export const REGLAS_COLOCACION: ReglaColocacion[] = [
  {
    tipo: "AltaAFIP",
    patronNombre: /_AltaAFIP_/i,
    estado: "activo",
    pagina: "primera",
    ancla: { patron: /Firma empleado y fecha de notificaci[oó]n/i, posicion: "centroCeldaDerecha", offset: { dx: 0, dy: 0 } },
    validaciones: [
      { tipo: "enPrimeraPagina" },
      { tipo: "enMitadDerecha" },
      { tipo: "textoCercano", patron: /Firma empleado y fecha de notificaci[oó]n/i, distanciaMax: 120 },
      { tipo: "lejosDeTexto", patron: /Fecha de alta telef[oó]nica/i, distanciaMin: 40 },
    ],
    fallback: { scroll: { enX: 680, enY: 500, direccion: "abajo", ticks: 3 }, soltarEn: { x: 900, y: 478 } },
    descripcion: "ARCA «Constancia del Trabajador / Alta», página 1: la celda vacía «Firma empleado y fecha de notificación» (la página 2, talón del empleador, no se firma)",
  },
  {
    tipo: "Contrato_Jornada",
    patronNombre: /_Contrato_Jornada(_|\.pdf$)/i,
    estado: "activo",
    pagina: "ultima",
    ancla: { patron: /^\s*·?\s*Firma:/, posicion: "sobreLineaDerecha", offset: { dx: 0, dy: 0 } },
    validaciones: [
      { tipo: "enUltimaPagina" },
      { tipo: "textoCercano", patron: /Firma:/, distanciaMax: 150 },
      { tipo: "lejosDeTexto", patron: /Aclaraci[oó]n/i, distanciaMin: 12 },
    ],
    fallback: { scroll: { enX: 680, enY: 450, direccion: "arriba", ticks: 4 }, soltarEn: { x: 543, y: 280 } },
    descripcion: "«CONTRATO DE PLAZO FIJO - JORNADA», última página: sobre la línea «Firma: ____» (mitad superior)",
  },
  {
    tipo: "Contrato_Plazo-fijo",
    patronNombre: /_Contrato_Plazo-fijo/i,
    estado: "activo",
    pagina: "ultima",
    ancla: { patron: /^\s*·?\s*Firma:/, posicion: "sobreLineaDerecha", offset: { dx: 0, dy: 0 } },
    validaciones: [
      { tipo: "enUltimaPagina" },
      { tipo: "textoCercano", patron: /Firma:/, distanciaMax: 150 },
      { tipo: "lejosDeTexto", patron: /Aclaraci[oó]n/i, distanciaMin: 12 },
    ],
    fallback: { scroll: { enX: 680, enY: 450, direccion: "abajo", ticks: 3 }, soltarEn: { x: 543, y: 446 } },
    descripcion: "«CONTRATO PLAZO FIJO 6X6» (y variantes), última página: sobre la línea «Firma: ____» (mitad inferior)",
  },
  {
    tipo: "Release",
    patronNombre: /_Release_(?!Servicios)/i,
    estado: "activo",
    pagina: "ultima",
    ancla: { patron: "ACLARACION_FIRMANTE", posicion: "sobreLineaIzquierda", offset: { dx: 0, dy: 0 } },
    validaciones: [
      { tipo: "enUltimaPagina" },
      { tipo: "enMitadIzquierda" },
      { tipo: "lejosDeTexto", patron: /Pellegrini|FZERO|Socio Gerente/i, distanciaMin: 60 },
      { tipo: "textoCercano", patron: "FIRMANTE", distanciaMax: 90 },
    ],
    fallback: { scroll: null, soltarEn: { x: 465, y: 418 } },
    descripcion: "«ACUERDO DE TITULARIDAD DE LA OBRA», última página: la línea de firma de la columna IZQUIERDA (la del empleado), sobre «Aclaración: <EMPLEADO>». La derecha es del empleador y no se toca",
  },
  {
    tipo: "REC_SUELDO",
    patronNombre: /_REC_SUELDO_/i,
    estado: "pendiente",
    motivoPendiente: "Falta definir posición de firma del recibo",
    pagina: "ultima",
    validaciones: [],
    descripcion: "Recibo de sueldo: falta relevar cuántas copias trae el PDF, cuál se firma y el ancla («Recibí conforme» / «Firma del empleado»)",
  },
];

/** La regla que matchea el nombre de archivo, o `null`. `Release_Servicios` no matchea `Release`. */
export function reglaDe(nombreArchivo: string): ReglaColocacion | null {
  const n = String(nombreArchivo || "");
  return REGLAS_COLOCACION.find((r) => r.patronNombre.test(n)) || null;
}

/** Por qué un archivo no se puede enviar por su tipo, o `null` si tiene regla activa. */
export function motivoPorTipo(nombreArchivo: string): string | null {
  const r = reglaDe(nombreArchivo);
  if (!r) return "Tipo de documento sin regla de colocación de la firma: el nombre no matchea ningún patrón conocido (AltaAFIP, Contrato_Jornada, Contrato_Plazo-fijo, Release, REC_SUELDO).";
  if (r.estado === "pendiente") return `Tipo ${r.tipo}: ${r.motivoPendiente || "falta definir posición de firma"}`;
  return null;
}

/* ─────────────────────────── geometría ─────────────────────────── */

const sinTildes = (s: string) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalizarNombre = (s: string) => sinTildes(s).toUpperCase().replace(/\s+/g, " ").trim();

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

/** Los ítems de una página que matchean un patrón (por ítem, y también por línea: ítems vecinos a la misma altura unidos). */
export function buscarTexto(pagina: PaginaPdf, patron: RegExp): ItemTexto[] {
  const directos = pagina.items.filter((i) => patron.test(i.str));
  if (directos.length) return directos;
  // Por línea: pdfjs a veces parte una frase en varios ítems. Misma línea = `y` a menos de 3 pt del primero del grupo.
  const lineas: ItemTexto[][] = [];
  for (const i of [...pagina.items].sort((a, b) => a.y - b.y)) {
    const grupo = lineas[lineas.length - 1];
    if (grupo && Math.abs(grupo[0].y - i.y) <= 3) grupo.push(i);
    else lineas.push([i]);
  }
  const res: ItemTexto[] = [];
  for (const items of lineas) {
    const ordenados = [...items].sort((a, b) => a.x - b.x);
    const texto = ordenados.map((i) => i.str).join(" ");
    if (patron.test(texto)) {
      const x = Math.min(...ordenados.map((i) => i.x));
      const der = Math.max(...ordenados.map((i) => i.x + i.w));
      res.push({ str: texto, x, y: Math.min(...ordenados.map((i) => i.y)), w: der - x, h: Math.max(...ordenados.map((i) => i.h)) });
    }
  }
  return res;
}

/* ─────────────────────────── validaciones ─────────────────────────── */

export interface ContextoValidacion {
  pagina: PaginaPdf;
  paginaIndex: number;
  totalPaginas: number;
  nombreFirmante?: string;
}

const patronDeFirmante = (nombre?: string): RegExp | null => {
  const n = normalizarNombre(nombre || "");
  if (!n) return null;
  // Las palabras del nombre en cualquier orden y con cualquier espacio en el medio (el PDF puede traer «ETHEL INES PARRINELLO» y la base «ETHEL PARRINELLO»).
  const palabras = n.split(" ").filter((p) => p.length > 1);
  return new RegExp(palabras.map((p) => `(?=.*${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`).join("") + ".*", "i");
};

/** Aplica las validaciones a un punto. Devuelve las que fallan (vacío = ok). */
export function validarPunto(punto: PuntoPdf, validaciones: Validacion[], ctx: ContextoValidacion): string[] {
  const fallas: string[] = [];
  const itemsNorm = ctx.pagina.items.map((i) => ({ ...i, str: sinTildes(i.str) }));
  for (const v of validaciones) {
    switch (v.tipo) {
      case "enMitadIzquierda":
        if (punto.x > ctx.pagina.ancho / 2) fallas.push("el punto cae en la mitad derecha de la página");
        break;
      case "enMitadDerecha":
        if (punto.x < ctx.pagina.ancho / 2) fallas.push("el punto cae en la mitad izquierda de la página");
        break;
      case "enPrimeraPagina":
        if (ctx.paginaIndex !== 0) fallas.push("no es la primera página");
        break;
      case "enUltimaPagina":
        if (ctx.paginaIndex !== ctx.totalPaginas - 1) fallas.push("no es la última página");
        break;
      case "lejosDeTexto": {
        const cerca = itemsNorm.filter((i) => v.patron.test(i.str)).map((i) => distanciaARect(punto, i));
        if (cerca.some((d) => d < v.distanciaMin)) fallas.push(`queda a menos de ${v.distanciaMin} pt de «${v.patron.source}»`);
        break;
      }
      case "textoCercano": {
        const patron = v.patron === "FIRMANTE" ? patronDeFirmante(ctx.nombreFirmante) : v.patron;
        if (!patron) {
          fallas.push("no hay nombre de firmante para verificar la cercanía");
          break;
        }
        const dist = itemsNorm.filter((i) => patron.test(normalizarNombre(i.str)) || patron.test(i.str)).map((i) => distanciaARect(punto, i));
        if (!dist.length || Math.min(...dist) > v.distanciaMax) fallas.push(`queda a más de ${v.distanciaMax} pt de «${v.patron === "FIRMANTE" ? ctx.nombreFirmante : v.patron.source}»`);
        break;
      }
    }
  }
  return fallas;
}

/* ─────────────────────────── resolución ─────────────────────────── */

export interface Colocacion {
  tipo: string;
  estrategia: "ancla" | "fallback";
  /** `pagina` dice a cuál ir aunque no se conozca el total (fallback sin texto); `paginaIndex` cuando se conoce. */
  pagina: "primera" | "ultima";
  paginaIndex: number | null;
  /** Tamaño de la página objetivo (para convertir a pantalla). */
  tamanoPagina: { ancho: number; alto: number } | null;
  /** Dónde soltar, en puntos PDF (estrategia ancla). */
  puntoPdf: PuntoPdf | null;
  /** Dónde tiene que quedar el campo, en puntos PDF (ancla ± tolerancia). */
  rectEsperado: Rect | null;
  /** La receta de pantalla (estrategia fallback, o respaldo si la caja de la página no se puede medir). */
  fallback: FallbackPantalla | null;
  validaciones: Validacion[];
  descripcion: string;
  /** Qué pasó al resolver, para el log. */
  nota: string;
}

export type ResultadoColocacion = { ok: true; colocacion: Colocacion } | { ok: false; motivo: string };

/** El punto donde soltar a partir del ítem ancla, según la posición declarada. */
function puntoDesdeAncla(ancla: Ancla, item: ItemTexto, pagina: PaginaPdf): PuntoPdf {
  const { dx, dy } = ancla.offset;
  switch (ancla.posicion) {
    case "sobreLineaDerecha":
      // A la derecha de «Firma:», sobre la línea punteada de esa misma fila.
      return { x: item.x + item.w + 45 + dx, y: item.y + item.h / 2 + dy };
    case "centroCeldaDerecha":
      // La celda está ARRIBA del rótulo: centrado horizontalmente, apenas por encima del texto.
      return { x: item.x + item.w / 2 + dx, y: item.y - 16 + dy };
    case "sobreLineaIzquierda": {
      // La línea «______» inmediatamente superior, en la misma columna; si no está, 50 pt arriba.
      const lineas = pagina.items.filter((i) => /^_{5,}\s*$/.test(i.str) && Math.abs(i.x - item.x) < 25 && i.y < item.y).sort((a, b) => b.y - a.y);
      const linea = lineas[0];
      return linea ? { x: linea.x + linea.w / 2 + dx, y: linea.y + linea.h / 2 - 3 + dy } : { x: item.x + item.w / 2 + dx, y: item.y - 50 + dy };
    }
  }
}

/** El ítem ancla en la página, según la regla y el firmante. */
function buscarAncla(regla: ReglaColocacion, pagina: PaginaPdf, nombreFirmante?: string): ItemTexto | null {
  const ancla = regla.ancla!;
  if (ancla.patron === "ACLARACION_FIRMANTE") {
    const aclaraciones = buscarTexto(pagina, /Aclaraci[oó]n:/i);
    const patron = patronDeFirmante(nombreFirmante);
    const conNombre = patron ? aclaraciones.filter((i) => patron.test(normalizarNombre(i.str.replace(/Aclaraci[oó]n:/i, "")))) : [];
    if (conNombre.length === 1) return conNombre[0];
    // Sin nombre que coincida: la de la columna izquierda, si hay una sola ahí.
    const izquierda = aclaraciones.filter((i) => i.x < pagina.ancho / 2);
    return izquierda.length === 1 ? izquierda[0] : null;
  }
  const encontrados = buscarTexto(pagina, ancla.patron);
  return encontrados.length >= 1 ? encontrados[0] : null;
}

/**
 * Resuelve dónde va la firma para ese archivo. `paginas` puede venir vacío (no se pudo leer el PDF):
 * ahí sólo queda el fallback. Nunca devuelve una colocación para un tipo pendiente o desconocido.
 */
export function resolverColocacion(nombreArchivo: string, paginas: PaginaPdf[] | null, contexto: { nombreFirmante?: string } = {}): ResultadoColocacion {
  const motivo = motivoPorTipo(nombreArchivo);
  if (motivo) return { ok: false, motivo };
  const regla = reglaDe(nombreArchivo)!;
  const base = { tipo: regla.tipo, pagina: regla.pagina === "primera" ? ("primera" as const) : ("ultima" as const), validaciones: regla.validaciones, descripcion: regla.descripcion, fallback: regla.fallback || null };

  const conFallback = (nota: string, paginaIndex: number | null, tamano: { ancho: number; alto: number } | null): ResultadoColocacion =>
    regla.fallback ? { ok: true, colocacion: { ...base, estrategia: "fallback", paginaIndex, tamanoPagina: tamano, puntoPdf: null, rectEsperado: null, nota } } : { ok: false, motivo: `${nota} Y el tipo ${regla.tipo} no tiene receta de pantalla de respaldo.` };

  if (!paginas || paginas.length === 0) return conFallback("No se pudo leer el texto del PDF: se usa la receta de pantalla.", null, null);

  const total = paginas.length;
  const candidatas = regla.pagina === "primera" ? [paginas[0]] : regla.pagina === "ultima" ? [paginas[total - 1]] : paginas;
  for (const pagina of candidatas) {
    const paginaIndex = paginas.indexOf(pagina);
    if (!regla.ancla) continue;
    const item = buscarAncla(regla, pagina, contexto.nombreFirmante);
    if (!item) continue;
    const punto = puntoDesdeAncla(regla.ancla, item, pagina);
    const fallas = validarPunto(punto, regla.validaciones, { pagina, paginaIndex, totalPaginas: total, nombreFirmante: contexto.nombreFirmante });
    if (fallas.length) return { ok: false, motivo: `El ancla «${item.str.trim().slice(0, 40)}» da un punto que no pasa las validaciones: ${fallas.join("; ")}.` };
    return {
      ok: true,
      colocacion: {
        ...base,
        estrategia: "ancla",
        paginaIndex,
        tamanoPagina: { ancho: pagina.ancho, alto: pagina.alto },
        puntoPdf: punto,
        rectEsperado: { x: punto.x - TOLERANCIA.x, y: punto.y - TOLERANCIA.y, w: TOLERANCIA.x * 2, h: TOLERANCIA.y * 2 },
        nota: `Ancla «${item.str.trim().slice(0, 40)}» en la página ${pagina.numero} de ${total}.`,
      },
    };
  }
  const idx = regla.pagina === "primera" ? 0 : total - 1;
  const p = paginas[idx];
  return conFallback(`No apareció el ancla del tipo ${regla.tipo} en el texto del PDF: se usa la receta de pantalla.`, idx, { ancho: p.ancho, alto: p.alto });
}
