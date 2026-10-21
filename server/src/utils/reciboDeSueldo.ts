import { cuitEsValido } from "./constanciaPdf.js";

/**
 * LECTURA DE UN RECIBO DE SUELDO a partir del texto de sus páginas (módulo Recibos de sueldo, 20/10/2026).
 *
 * El PDF que se sube es una sábana: todos los recibos del mes, uno atrás del otro, de a dos páginas por
 * persona. Acá se lee lo que identifica a cada uno —el CUIL de la persona, su nombre, el período, el
 * legajo, el neto— con expresiones tolerantes al formato, porque el texto que devuelve el extractor
 * trae saltos de línea y espacios donde el recibo tenía columnas.
 *
 * El CUIL es el dato fuerte: con él se busca a la persona en la plataforma. Lo demás es informativo y
 * puede faltar sin que el recibo quede inválido. Lo que NO se pudo leer queda vacío, nunca inventado,
 * y el texto crudo se guarda entero para poder verlo (y exportarlo) cuando algo no cierra.
 *
 * Puro, sin base ni PDF: se testea con texto.
 */

export interface DatosRecibo {
  /** El CUIL de la persona (11 dígitos, prefijo de persona física), o "". */
  cuil: string;
  /** El CUIT de la empleadora (prefijo 30/33/34), o "". */
  empleadorCuit: string;
  nombre: string;
  /** "YYYY-MM", o "". */
  periodo: string;
  legajo: string;
  neto: string;
  /** Todos los CUIL/CUIT válidos que aparecen, en orden: para revisar cuando el fuerte no es el esperado. */
  cuitsEncontrados: string[];
}

const PREFIJOS_PERSONA = ["20", "23", "24", "25", "26", "27"];
const PREFIJOS_EMPRESA = ["30", "33", "34"];

const MESES: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** El dígito verificador (módulo 11) de los diez primeros dígitos de un CUIT/CUIL. */
export function digitoVerificador(diez: string): string {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(diez[i]), 0);
  const resto = suma % 11;
  return String(resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto);
}

/**
 * Todos los números de 11 dígitos (con o sin guiones) que son un CUIT/CUIL válido, sin repetir.
 *
 * También «20-37008740-» o «27-21471133-.»: el OCR suele perder el último dígito, que queda pegado al
 * borde de la celda. Ese dígito es el verificador y sale de los otros diez, así que se recalcula: el
 * CUIL completo es único para esos diez dígitos, no se inventa nada.
 */
export function cuitsDelTexto(texto: string): string[] {
  const vistos = new Set<string>();
  const res: string[] = [];
  const re = /(?<!\d)(\d{2})\s*-?\s*(\d{8})\s*-?\s*(\d)(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const d = `${m[1]}${m[2]}${m[3]}`;
    if (!vistos.has(d) && cuitEsValido(d)) {
      vistos.add(d);
      res.push(d);
    }
  }
  const reSinVerificador = /(?<!\d)([23]\d)-(\d{8})-(?!\d)/g;
  while ((m = reSinVerificador.exec(texto))) {
    const diez = `${m[1]}${m[2]}`;
    const d = `${diez}${digitoVerificador(diez)}`;
    if (!vistos.has(d) && cuitEsValido(d)) {
      vistos.add(d);
      res.push(d);
    }
  }
  return res;
}

/**
 * El período del recibo como "YYYY-MM". Acepta «Período: 08/2026», «PERIODO 2026/08», «Agosto 2026»,
 * «AGOSTO/2026», «08-2026» y «2026-08». Toma el primero que encuentra con rótulo; sin rótulo, el primer
 * «mes año» en letras, que es lo que un recibo suele poner en el título.
 */
export function periodoDelTexto(textoCrudo: string): string {
  const texto = sinTildes(textoCrudo).replace(/\s+/g, " ");
  // «PERIODO LIQUIDADO SEPTIEMBRE 2026» manda sobre cualquier otro período del recibo (el del depósito de aportes es el mes anterior).
  const liquidado = /per[ií]odo\s+liquidado\s*:?\s*([A-Za-z0-9\/\-\. ]{4,25})/i.exec(texto);
  const conRotulo = /(?:per[ií]odo|periodo|mes)\s*(?:de\s+(?:pago|liquidacion|liquidaci[oó]n)\s*)?:?\s*([A-Za-z0-9\/\-\. ]{4,25})/i.exec(texto);
  const candidatos = [liquidado?.[1] || "", conRotulo?.[1] || "", texto];
  for (const c of candidatos) {
    if (!c) continue;
    // Todos los «palabra año» hasta dar con un mes: «ORIGINAL 2030» (la empleadora se llama 2030 S.R.L.) no es un período.
    const reLetras = /\b([A-Za-z]{4,10})\b\s*(?:de\s*)?[\/\-\s]?\s*(20\d{2})\b/gi;
    let letras: RegExpExecArray | null;
    while ((letras = reLetras.exec(c))) {
      const mes = MESES[letras[1].toLowerCase()];
      if (mes) return `${letras[2]}-${mes}`;
    }
    const mmAaaa = /(?<!\d)(0[1-9]|1[0-2])\s*[\/\-\.]\s*(20\d{2})(?!\d)/.exec(c);
    if (mmAaaa) return `${mmAaaa[2]}-${mmAaaa[1]}`;
    const aaaaMm = /(?<!\d)(20\d{2})\s*[\/\-\.]\s*(0[1-9]|1[0-2])(?!\d)/.exec(c);
    if (aaaaMm) return `${aaaaMm[1]}-${aaaaMm[2]}`;
  }
  return "";
}

/** El valor que sigue a un rótulo («Legajo: 123»), hasta el fin de línea o el próximo rótulo. */
function valorDespuesDe(texto: string, rotulos: RegExp): string {
  const m = rotulos.exec(texto);
  if (!m) return "";
  const resto = texto.slice(m.index + m[0].length).replace(/^[\s:.\-]+/, "");
  // Corta en el salto de línea, en un hueco de columna (3+ espacios) o en el siguiente rótulo conocido
  // de la misma línea. No en «cualquier palabra seguida de dos puntos»: eso partía «JUAN MANUEL Legajo:»
  // en el espacio equivocado y dejaba el nombre a la mitad.
  const corte = resto.search(/\r?\n|\s{3,}|\s+(?:Legajo|CUIL|CUIT|DNI|Fecha|Categor[ií]a|Sector|Per[ií]odo|Periodo|Puesto|Cargo|Convenio|Sueldo|Obra\s+Social)\b/i);
  return (corte >= 0 ? resto.slice(0, corte) : resto).trim();
}

/**
 * «APELLIDO, Nombres 00070»: la línea del recibo que trae el nombre y, al final, el legajo. Es lo que
 * queda cuando los rótulos no están en el texto (OCR de un recibo de MEMOSOFT: los rótulos van en
 * gris y el OCR no los lee). El apellido en mayúsculas seguido de coma lo distingue de un concepto.
 */
// El legajo puede faltar (el OCR a veces no lo lee) y la línea puede terminar en una coma suelta.
const RE_APELLIDO_NOMBRE = /(?:^|\s)([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ' ]{1,40}),\s+([A-Za-zÁÉÍÓÚÑáéíóúñ' ]{2,50}?)(?:\s+(\d{3,8}))?[.,;:]*\s*$/gm;
// Siglas que aparecen como «SIGLA, lo que sigue» en el pie del recibo y no son nadie.
const NO_SON_APELLIDO = new Set(["SIPA", "ART", "ANSES", "AFIP", "ARCA", "INSSJP", "SCVO", "CUIL", "CUIT"]);

/** Las líneas «APELLIDO, Nombres [legajo]» del texto; primero las que traen legajo, que son la caja de datos. */
function lineasApellidoNombre(texto: string): Array<{ apellido: string; nombres: string; legajo: string }> {
  const res: Array<{ apellido: string; nombres: string; legajo: string }> = [];
  for (const m of texto.matchAll(RE_APELLIDO_NOMBRE)) {
    const apellido = m[1].trim();
    if (NO_SON_APELLIDO.has(apellido) || apellido.split(" ").length > 4) continue;
    res.push({ apellido, nombres: m[2].trim(), legajo: m[3] || "" });
  }
  return res.sort((a, b) => Number(!!b.legajo) - Number(!!a.legajo));
}

/**
 * El nombre de la persona. Primero la línea «APELLIDO, Nombres [legajo]» (es como viene en la caja de
 * datos, y no depende de que el rótulo quede al lado del valor); si no hay, lo que sigue a un rótulo
 * («Apellido y Nombre: …»), siempre que parezca un nombre.
 */
export function nombreDelTexto(texto: string): string {
  const l = lineasApellidoNombre(texto)[0];
  if (l) return `${l.apellido}, ${l.nombres}`.slice(0, 80);
  // Con bordes de palabra: «empleado» no puede matchear dentro de «empleador» («…del empleador incluye SIPA…»).
  const v = valorDespuesDe(texto, /\b(?:apellido\s*y\s*nombres?|nombres?\s*y\s*apellidos?|empleado|trabajador|nombre)\b\s*:?/i);
  const limpio = v.replace(/\s+/g, " ").trim();
  // Un nombre: «APELLIDO, Nombres» o al menos dos palabras con mayúscula inicial; sin dígitos. Si lo que sigue al rótulo es
  // otra cosa (el rótulo de al lado en una tabla, un importe), el rótulo no era el del nombre.
  const pareceNombre = /^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ' ]+,\s*[A-Za-zÁÉÍÓÚÑáéíóúñ' ]+$/.test(limpio) || /^(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+){1,4}[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(limpio);
  return pareceNombre ? limpio.slice(0, 80) : "";
}

/** El legajo: el de la línea «APELLIDO, Nombres legajo» o, si no, lo que sigue al rótulo «Legajo» siempre que traiga un número. */
export function legajoDelTexto(texto: string): string {
  const deLaLinea = lineasApellidoNombre(texto)[0]?.legajo;
  if (deLaLinea) return deLaLinea;
  const v = (valorDespuesDe(texto, /\blegajo\s*(?:n[°ºo.]*)?\s*:?/i).split(" ")[0] || "").trim();
  // En una tabla el rótulo «LEGAJO» puede quedar seguido del rótulo de al lado («INGRESO»): un legajo tiene dígitos.
  return /^[A-Za-z0-9\-\/]{1,15}$/.test(v) && /\d/.test(v) ? v : "";
}

/** «Mart n Fernando» → el OCR perdió una tilde: se deja un comodín para comparar nombres sin tildes. */
export const normalizarNombre = (s: string): string =>
  sinTildes(String(s || ""))
    .toUpperCase()
    .replace(/[^A-Z ,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function netoDelTexto(texto: string): string {
  const t = texto.replace(/\s+/g, " ");
  const m = /(?:neto\s*a\s*(?:cobrar|pagar)|total\s*neto|importe\s*neto|neto)\s*:?\s*\$?\s*([\d.]{1,15},\d{2}|[\d,]{1,15}\.\d{2})/i.exec(t);
  return m ? m[1] : "";
}

/** Lee todo lo que se pueda del texto de un recibo (una o varias páginas concatenadas). */
export function leerRecibo(textoCrudo: string): DatosRecibo {
  const texto = String(textoCrudo || "");
  const cuits = cuitsDelTexto(texto);
  return {
    cuil: cuits.find((c) => PREFIJOS_PERSONA.includes(c.slice(0, 2))) || "",
    empleadorCuit: cuits.find((c) => PREFIJOS_EMPRESA.includes(c.slice(0, 2))) || "",
    nombre: nombreDelTexto(texto),
    periodo: periodoDelTexto(texto),
    legajo: legajoDelTexto(texto),
    neto: netoDelTexto(texto),
    cuitsEncontrados: cuits,
  };
}

/**
 * CÓMO SE PARTE LA SÁBANA EN RECIBOS. Cada página se lee por su cuenta; una página con CUIL propio
 * empieza un recibo nuevo salvo que sea el mismo CUIL del recibo abierto y a éste le falten páginas
 * (`paginasPorRecibo`, normalmente 2: la segunda hoja repite el CUIL). Una página sin CUIL se pega al
 * recibo abierto (la segunda hoja a veces no lo trae). Si ninguna página tiene CUIL —un PDF escaneado,
 * sin texto— se parte a ciegas de a `paginasPorRecibo`, para que al menos se pueda revisar a mano.
 *
 * Devuelve los grupos como índices de página (base 0).
 */
export function agruparPaginas(textosPorPagina: string[], paginasPorRecibo = 2): number[][] {
  const cuilDe = textosPorPagina.map((t) => leerRecibo(t).cuil);
  // «ORIGINAL» arriba de la hoja abre un recibo; «COPIA»/«DUPLICADO» nunca (es la segunda hoja de MEMOSOFT).
  const original = textosPorPagina.map((t) => /^\s*ORIGINAL\b/i.test(t));
  const copia = textosPorPagina.map((t) => /^\s*(COPIA|DUPLICADO)\b/i.test(t));
  if (!cuilDe.some(Boolean)) {
    const grupos: number[][] = [];
    for (let i = 0; i < textosPorPagina.length; i += paginasPorRecibo) grupos.push(textosPorPagina.slice(i, i + paginasPorRecibo).map((_, j) => i + j));
    return grupos;
  }
  const grupos: { cuil: string; paginas: number[] }[] = [];
  for (let i = 0; i < textosPorPagina.length; i++) {
    const cuil = cuilDe[i];
    const abierto = grupos[grupos.length - 1];
    if (!abierto) {
      grupos.push({ cuil, paginas: [i] });
      continue;
    }
    if (original[i] && !copia[i]) {
      grupos.push({ cuil, paginas: [i] });
      continue;
    }
    if (copia[i] && abierto.paginas.length < paginasPorRecibo) {
      abierto.paginas.push(i);
      continue;
    }
    if (!cuil) {
      abierto.paginas.push(i);
      continue;
    }
    if (abierto.cuil === cuil && abierto.paginas.length < paginasPorRecibo) {
      abierto.paginas.push(i);
      continue;
    }
    if (!abierto.cuil && abierto.paginas.length < paginasPorRecibo) {
      // Una primera hoja sin CUIL seguida de la hoja que sí lo trae: es el mismo recibo.
      abierto.cuil = cuil;
      abierto.paginas.push(i);
      continue;
    }
    grupos.push({ cuil, paginas: [i] });
  }
  return grupos.map((g) => g.paginas);
}
