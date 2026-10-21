import { cuitEsValido } from "./constanciaPdf.js";
const PREFIJOS_PERSONA = ["20", "23", "24", "25", "26", "27"];
const PREFIJOS_EMPRESA = ["30", "33", "34"];
const MESES = {
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
const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Todos los números de 11 dígitos (con o sin guiones) que son un CUIT/CUIL válido, sin repetir. */
export function cuitsDelTexto(texto) {
    const vistos = new Set();
    const res = [];
    const re = /(?<!\d)(\d{2})\s*-?\s*(\d{8})\s*-?\s*(\d)(?!\d)/g;
    let m;
    while ((m = re.exec(texto))) {
        const d = `${m[1]}${m[2]}${m[3]}`;
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
export function periodoDelTexto(textoCrudo) {
    const texto = sinTildes(textoCrudo).replace(/\s+/g, " ");
    const conRotulo = /(?:per[ií]odo|periodo|mes)\s*(?:de\s+(?:pago|liquidacion|liquidaci[oó]n)\s*)?:?\s*([A-Za-z0-9\/\-\. ]{4,25})/i.exec(texto);
    const candidatos = [conRotulo?.[1] || "", texto];
    for (const c of candidatos) {
        if (!c)
            continue;
        const letras = /\b([A-Za-z]{4,10})\b\s*(?:de\s*)?[\/\-\s]?\s*(20\d{2})\b/i.exec(c);
        if (letras && MESES[letras[1].toLowerCase()])
            return `${letras[2]}-${MESES[letras[1].toLowerCase()]}`;
        const mmAaaa = /(?<!\d)(0[1-9]|1[0-2])\s*[\/\-\.]\s*(20\d{2})(?!\d)/.exec(c);
        if (mmAaaa)
            return `${mmAaaa[2]}-${mmAaaa[1]}`;
        const aaaaMm = /(?<!\d)(20\d{2})\s*[\/\-\.]\s*(0[1-9]|1[0-2])(?!\d)/.exec(c);
        if (aaaaMm)
            return `${aaaaMm[1]}-${aaaaMm[2]}`;
    }
    return "";
}
/** El valor que sigue a un rótulo («Legajo: 123»), hasta el fin de línea o el próximo rótulo. */
function valorDespuesDe(texto, rotulos) {
    const m = rotulos.exec(texto);
    if (!m)
        return "";
    const resto = texto.slice(m.index + m[0].length).replace(/^[\s:.\-]+/, "");
    // Corta en el salto de línea, en un hueco de columna (3+ espacios) o en el siguiente rótulo conocido
    // de la misma línea. No en «cualquier palabra seguida de dos puntos»: eso partía «JUAN MANUEL Legajo:»
    // en el espacio equivocado y dejaba el nombre a la mitad.
    const corte = resto.search(/\r?\n|\s{3,}|\s+(?:Legajo|CUIL|CUIT|DNI|Fecha|Categor[ií]a|Sector|Per[ií]odo|Periodo|Puesto|Cargo|Convenio|Sueldo|Obra\s+Social)\b/i);
    return (corte >= 0 ? resto.slice(0, corte) : resto).trim();
}
/** El nombre de la persona, por los rótulos habituales de un recibo. "" si no hay rótulo reconocible. */
export function nombreDelTexto(texto) {
    const v = valorDespuesDe(texto, /(?:apellido\s*y\s*nombres?|nombres?\s*y\s*apellidos?|empleado|trabajador|nombre)\s*:?/i);
    // Un nombre no tiene dígitos: si lo que sigue al rótulo es un número, el rótulo era otra cosa.
    const limpio = v.replace(/\s+/g, " ").trim();
    if (!limpio || /\d{3,}/.test(limpio))
        return "";
    return limpio.slice(0, 80);
}
export function legajoDelTexto(texto) {
    const v = valorDespuesDe(texto, /legajo\s*(?:n[°ºo.]*)?\s*:?/i);
    return /^[A-Za-z0-9\-\/]{1,15}$/.test(v.split(" ")[0] || "") ? v.split(" ")[0] : "";
}
export function netoDelTexto(texto) {
    const t = texto.replace(/\s+/g, " ");
    const m = /(?:neto\s*a\s*(?:cobrar|pagar)|total\s*neto|importe\s*neto|neto)\s*:?\s*\$?\s*([\d.]{1,15},\d{2}|[\d,]{1,15}\.\d{2})/i.exec(t);
    return m ? m[1] : "";
}
/** Lee todo lo que se pueda del texto de un recibo (una o varias páginas concatenadas). */
export function leerRecibo(textoCrudo) {
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
export function agruparPaginas(textosPorPagina, paginasPorRecibo = 2) {
    const cuilDe = textosPorPagina.map((t) => leerRecibo(t).cuil);
    if (!cuilDe.some(Boolean)) {
        const grupos = [];
        for (let i = 0; i < textosPorPagina.length; i += paginasPorRecibo)
            grupos.push(textosPorPagina.slice(i, i + paginasPorRecibo).map((_, j) => i + j));
        return grupos;
    }
    const grupos = [];
    for (let i = 0; i < textosPorPagina.length; i++) {
        const cuil = cuilDe[i];
        const abierto = grupos[grupos.length - 1];
        if (!abierto) {
            grupos.push({ cuil, paginas: [i] });
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
