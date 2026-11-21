/**
 * EXPORTAR A EXCEL LA TABLA QUE ESTÁ EN PANTALLA (16/11/2026).
 *
 * Toda tabla del panel va en `TablaConEncabezadoFijo`, que ofrece el botón «Excel»: en vez de escribir un
 * export por pantalla (son más de cien tablas, cada una con sus columnas), se lee la tabla YA DIBUJADA y
 * se arma la planilla con lo que el usuario está viendo: mismas columnas, mismo orden, mismos filtros.
 *
 * Consecuencia: sale lo que está dibujado. En una tabla paginada, la página que se está mirando.
 *
 * Qué se lee de cada celda:
 *  · El texto, con un salto de línea entre bloques (nombre arriba, aclaración abajo).
 *  · De un campo editable, su valor; de un desplegable, la opción elegida; de una casilla, Sí / No.
 *  · Si la celda es sólo un ícono (un tilde, un candado), su `title` o `aria-label`.
 *  · Nada de lo marcado con `data-no-exportar`, ni lo oculto (`sr-only`, `hidden`).
 * Qué columnas NO salen: «Acciones» (`col-acciones` o con ese título), las que quedan vacías enteras y la
 * de las casillas para tildar filas (sin título y con nada más que la casilla en cada fila).
 *
 * Los números con formato argentino («1.234,50», «$ 12.000») salen como número, para poder sumarlos.
 * Lo que empieza con cero (un código «0634») o es una tira de 10 dígitos o más (un CUIL, un CBU) queda como texto.
 */

const BLOQUES = new Set(["DIV", "P", "LI", "UL", "OL", "TR", "H1", "H2", "H3", "H4", "H5", "H6", "SECTION", "ARTICLE", "LABEL"]);

function oculto(el: Element): boolean {
  if (el.hasAttribute("data-no-exportar") || el.hasAttribute("hidden")) return true;
  const clases = el.classList;
  return clases.contains("sr-only") || clases.contains("hidden");
}

function leer(nodo: Node, partes: string[]): void {
  if (nodo.nodeType === Node.TEXT_NODE) {
    partes.push(nodo.textContent || "");
    return;
  }
  if (nodo.nodeType !== Node.ELEMENT_NODE) return;
  const el = nodo as HTMLElement;
  const etiqueta = el.tagName.toUpperCase();
  if (etiqueta === "SVG" || etiqueta === "SCRIPT" || etiqueta === "STYLE" || oculto(el)) return;
  if (etiqueta === "BR") {
    partes.push("\n");
    return;
  }
  if (etiqueta === "INPUT") {
    const input = el as HTMLInputElement;
    if (input.type === "checkbox" || input.type === "radio") partes.push(input.checked ? "Sí" : "No");
    else if (input.type !== "hidden" && input.type !== "file" && input.type !== "password") partes.push(input.value);
    return;
  }
  if (etiqueta === "TEXTAREA") {
    partes.push((el as HTMLTextAreaElement).value);
    return;
  }
  if (etiqueta === "SELECT") {
    const select = el as HTMLSelectElement;
    partes.push(Array.from(select.selectedOptions).map((o) => o.textContent || "").join(", "));
    return;
  }
  const bloque = BLOQUES.has(etiqueta);
  if (bloque) partes.push("\n");
  for (const hijo of Array.from(el.childNodes)) leer(hijo, partes);
  if (bloque) partes.push("\n");
}

const limpiar = (texto: string): string =>
  texto
    .replace(/ /g, " ")
    .split("\n")
    .map((linea) => linea.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

/** El texto de una celda (ver arriba). */
export function textoDeCelda(celda: Element): string {
  const partes: string[] = [];
  for (const hijo of Array.from(celda.childNodes)) leer(hijo, partes);
  const texto = limpiar(partes.join(""));
  if (texto) return texto;
  // Sólo un ícono: lo que dice al pasarle el mouse.
  const conTitulo = celda.querySelector("[title]:not([data-no-exportar]), [aria-label]:not([data-no-exportar])");
  return limpiar(conTitulo?.getAttribute("title") || conTitulo?.getAttribute("aria-label") || "");
}

/** «1.234,50», «$ 12.000», «-3,5», «45» → número; lo demás (y lo que no conviene tocar) queda como texto. */
export function valorDeCelda(texto: string): string | number {
  const t = texto.replace(/^\$\s*/, "").replace(/^-\s*\$\s*/, "-");
  if (!/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(t)) return texto;
  const entera = t.replace(/^-/, "").split(",")[0].replace(/\./g, "");
  // Un código con ceros adelante o una tira larga de dígitos (CUIL, CBU, teléfono) no es una cantidad.
  if ((entera.length > 1 && entera.startsWith("0")) || (entera.length >= 10 && !t.includes(".")) || entera.length >= 15) return texto;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : texto;
}

export interface TablaLeida {
  /** Las filas, encabezado incluido, ya sin las columnas que no salen. */
  filas: (string | number)[][];
  /** Cuántas filas son de encabezado. */
  filasDeEncabezado: number;
  /** Las celdas combinadas (colSpan / rowSpan), con los índices de la planilla. */
  combinadas: { s: { r: number; c: number }; e: { r: number; c: number } }[];
}

/** Lee una `<table>` del DOM: grilla con `colSpan` y `rowSpan` resueltos, sin «Acciones» ni columnas vacías. */
export function leerTabla(tabla: HTMLTableElement): TablaLeida {
  const filasDom = Array.from(tabla.rows);
  const filasDeEncabezado = tabla.tHead ? tabla.tHead.rows.length : 0;
  const grilla: (string | number)[][] = [];
  const ocupadas: boolean[][] = [];
  const combinadas: TablaLeida["combinadas"] = [];
  const fuera = new Set<number>();
  // Por columna: ¿todo lo que tiene es una casilla suelta (o nada)? Es la de tildar filas, no un dato.
  const soloCasillas: boolean[] = [];
  const casillaSuelta = (celda: Element) => celda.querySelectorAll("input[type=checkbox]").length === 1 && !limpiar(celda.textContent || "");

  filasDom.forEach((fila, r) => {
    grilla[r] = grilla[r] || [];
    ocupadas[r] = ocupadas[r] || [];
    let c = 0;
    for (const celda of Array.from(fila.cells)) {
      while (ocupadas[r][c]) c++;
      const ancho = Math.max(1, celda.colSpan || 1);
      const alto = Math.max(1, Math.min(celda.rowSpan || 1, filasDom.length - r));
      const esEncabezado = r < filasDeEncabezado;
      const texto = textoDeCelda(celda);
      if (ancho === 1 && (celda.classList.contains("col-acciones") || (esEncabezado && /^acciones?$/i.test(texto)))) fuera.add(c);
      grilla[r][c] = esEncabezado ? texto : valorDeCelda(texto);
      if (ancho === 1) {
        if (!casillaSuelta(celda) && texto !== "") soloCasillas[c] = false;
        else if (casillaSuelta(celda) && soloCasillas[c] !== false) soloCasillas[c] = true;
      }
      for (let dr = 0; dr < alto; dr++) {
        ocupadas[r + dr] = ocupadas[r + dr] || [];
        for (let dc = 0; dc < ancho; dc++) ocupadas[r + dr][c + dc] = true;
      }
      if (ancho > 1 || alto > 1) combinadas.push({ s: { r, c }, e: { r: r + alto - 1, c: c + ancho - 1 } });
      c += ancho;
    }
  });

  const columnas = grilla.reduce((m, f) => Math.max(m, f.length), 0);
  // Una columna sin nada en ninguna fila (las casillas de tildar, una de íconos sin título) no aporta.
  for (let c = 0; c < columnas; c++) if (soloCasillas[c] === true || grilla.every((f) => f[c] === undefined || f[c] === "")) fuera.add(c);

  const quedan = Array.from({ length: columnas }, (_, c) => c).filter((c) => !fuera.has(c));
  // Una celda combinada que empieza en una columna que se va («Total: …» a todo el ancho): su texto pasa a la primera que queda.
  for (const m of combinadas) {
    if (!fuera.has(m.s.c)) continue;
    const primera = quedan.find((c) => c > m.s.c && c <= m.e.c);
    if (primera !== undefined) grilla[m.s.r][primera] = grilla[m.s.r][m.s.c];
  }
  const nueva = new Map(quedan.map((c, i) => [c, i]));
  const filas = grilla.map((f) => quedan.map((c) => f[c] ?? ""));
  const combinadasFinal = combinadas
    .map((m) => {
      const dentro = quedan.filter((c) => c >= m.s.c && c <= m.e.c);
      return dentro.length ? { s: { r: m.s.r, c: nueva.get(dentro[0])! }, e: { r: m.e.r, c: nueva.get(dentro[dentro.length - 1])! } } : null;
    })
    .filter((m): m is NonNullable<typeof m> => !!m && (m.e.c > m.s.c || m.e.r > m.s.r));
  return { filas, filasDeEncabezado, combinadas: combinadasFinal };
}

/** «Gestionar Equipo · Proyecto Ñandú» → «gestionar-equipo-proyecto-nandu». */
export const nombreDeArchivo = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/** De qué es la tabla, para nombrar el archivo: el título del modal que la contiene o el de la pantalla. */
function tituloDeLaTabla(tabla: HTMLElement): string {
  const modal = tabla.closest('[role="dialog"]');
  const titulo = modal?.querySelector("h2, h3")?.textContent || document.querySelector("main h1, h1")?.textContent || document.title || "";
  return titulo.trim();
}

/** Arma el .xlsx con la tabla y lo descarga. Devuelve cuántas filas de datos salieron. */
export async function exportarTablaAExcel(tabla: HTMLTableElement, nombre?: string): Promise<number> {
  const { filas, filasDeEncabezado, combinadas } = leerTabla(tabla);
  // La librería pesa: se baja recién cuando alguien exporta.
  const XLSX = await import("xlsx");
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  if (combinadas.length) hoja["!merges"] = combinadas;
  const columnas = filas.reduce((m, f) => Math.max(m, f.length), 0);
  hoja["!cols"] = Array.from({ length: columnas }, (_, c) => ({
    wch: Math.min(60, Math.max(8, ...filas.map((f) => String(f[c] ?? "").split("\n").reduce((m, l) => Math.max(m, l.length), 0) + 2))),
  }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Datos");
  const base = nombreDeArchivo(nombre || tituloDeLaTabla(tabla)) || "tabla";
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  XLSX.writeFile(libro, `${base}-${hoy}.xlsx`);
  return Math.max(0, filas.length - filasDeEncabezado);
}
