import { normalizarCuit } from "./constanciaPdf.js";
const MESES = { ENERO: "01", FEBRERO: "02", MARZO: "03", ABRIL: "04", MAYO: "05", JUNIO: "06", JULIO: "07", AGOSTO: "08", SEPTIEMBRE: "09", SETIEMBRE: "09", OCTUBRE: "10", NOVIEMBRE: "11", DICIEMBRE: "12" };
const RE_INICIO = /^\s*(ORIGINAL|COPIA|DUPLICADO)\s{2,}APELLIDO\s+Y\s+NOMBRES/i;
const RE_IMPORTE = /-?\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)/g;
/** El contenido del archivo como texto: Latin-1 (lo que exporta MEMOSOFT); si fuera UTF-8 válido, como UTF-8. */
export function decodificarTxt(buffer) {
    const utf8 = buffer.toString("utf8");
    return utf8.includes("�") ? buffer.toString("latin1") : utf8;
}
/** Los bloques del TXT, uno por hoja, en orden. */
export function bloquesDelTxt(contenido) {
    const lineas = contenido.replace(/\r/g, "").split("\n");
    const bloques = [];
    let actual = null;
    for (const l of lineas) {
        const m = RE_INICIO.exec(l);
        if (m) {
            if (actual)
                bloques.push({ tipo: actual.tipo, texto: actual.lineas.join("\n") });
            actual = { tipo: m[1].toUpperCase(), lineas: [l] };
        }
        else if (actual)
            actual.lineas.push(l);
    }
    if (actual)
        bloques.push({ tipo: actual.tipo, texto: actual.lineas.join("\n") });
    return bloques.map((b) => ({ ...b, texto: b.texto.replace(/\s+$/, "") }));
}
/**
 * Los recibos: cada «ORIGINAL» abre uno y las hojas que siguen (la «COPIA») se le suman. Devuelve los
 * índices de bloque (base 0), que son los índices de página del PDF.
 */
export function agruparBloques(bloques) {
    const grupos = [];
    bloques.forEach((b, i) => {
        if (b.tipo === "ORIGINAL" || grupos.length === 0)
            grupos.push([i]);
        else
            grupos[grupos.length - 1].push(i);
    });
    return grupos;
}
const colapsar = (s) => s.replace(/\s+/g, " ").trim();
/** Partes de una línea separadas por huecos de columna (3+ espacios). */
const partes = (s) => s
    .split(/\s{3,}/)
    .map((x) => x.trim())
    .filter(Boolean);
/** La línea que sigue a la primera que cumple `re`, o "". */
function lineaDebajoDe(lineas, re) {
    const i = lineas.findIndex((l) => re.test(l));
    return i >= 0 && i + 1 < lineas.length ? lineas[i + 1] : "";
}
/** El último importe de la línea que tiene el rótulo. */
function importeDeLinea(lineas, re) {
    const l = lineas.find((x) => re.test(x));
    const m = l?.match(RE_IMPORTE);
    return m ? m[m.length - 1] : "";
}
/**
 * La fila de totales: los importes van debajo de los rótulos, alineados a la derecha de su columna, y
 * alguno puede faltar (NO REMUNERATIVO vacío). Cada importe va a la columna cuyo rótulo termina más
 * cerca de donde termina el importe.
 */
function filaDeTotales(lineas) {
    const i = lineas.findIndex((l) => /REMUNERATIVO\s+NO\s+REMUNERATIVO\s+DESCUENTOS/i.test(l));
    if (i < 0 || i + 1 >= lineas.length)
        return {};
    const rotulos = ["REMUNERATIVO", "NO REMUNERATIVO", "DESCUENTOS", "SUELDO NETO", "OTROS", "NETO A COBRAR"];
    const cab = lineas[i];
    const fines = [];
    let desde = 0;
    for (const r of rotulos) {
        const p = cab.indexOf(r, desde);
        fines.push(p < 0 ? -1 : p + r.length);
        if (p >= 0)
            desde = p + r.length;
    }
    const res = {};
    for (const m of lineas[i + 1].matchAll(RE_IMPORTE)) {
        const fin = (m.index || 0) + m[0].length;
        let mejor = -1;
        let dist = Infinity;
        fines.forEach((f, k) => {
            if (f >= 0 && Math.abs(f - fin) < dist && !res[rotulos[k]]) {
                dist = Math.abs(f - fin);
                mejor = k;
            }
        });
        if (mejor >= 0)
            res[rotulos[mejor]] = m[0];
    }
    return res;
}
/** Las líneas de conceptos («1101  Previsional  Contribución  …  286.619,41»), con la sección en la que están. */
function conceptosDe(lineas) {
    const res = [];
    let seccion = "";
    for (const l of lineas) {
        const t = l.trim();
        if (/^(CONTRIBUCIONES EMPRESA|OTROS CONCEPTOS EMPRESA|REMUNERATIVO|NO REMUNERATIVO|DESCUENTOS|OTROS)$/i.test(t)) {
            seccion = t.toUpperCase();
            continue;
        }
        const m = /^\s*(\d{4})\s{2,}(.*)$/.exec(l);
        if (!m)
            continue;
        const importes = [...m[2].matchAll(RE_IMPORTE)];
        if (importes.length === 0) {
            // «0005 Presentismo» sin importe (el recibo lo dejó vacío): se lista igual.
            res.push({ codigo: m[1], concepto: colapsar(m[2]), unidad: "", monto: "", seccion });
            continue;
        }
        const monto = importes[importes.length - 1];
        const antes = m[2].slice(0, monto.index);
        const unidad = importes.length > 1 ? importes[0][0] : "";
        const concepto = colapsar(unidad ? antes.slice(0, antes.indexOf(unidad)) : antes);
        res.push({ codigo: m[1], concepto, unidad, monto: monto[0], seccion });
    }
    return res;
}
/** Los datos de un recibo a partir de su bloque «ORIGINAL» (la copia repite lo mismo). */
export function leerBloque(texto) {
    const lineas = texto.replace(/\r/g, "").split("\n");
    // «2030 S.R.L.      STOLTZING, Micaela Sol      00070»: la empresa, el nombre y el legajo al final.
    // Es la línea de debajo del rótulo «LEGAJO» (el nombre puede venir sin coma: «AQUINO Alan Gabriel»).
    const lineaNombre = lineaDebajoDe(lineas, /^\s*LEGAJO\s*$/i) || lineas.find((l, i) => i > 0 && /,\s*\S/.test(l) && /\d{3,8}\s*$/.test(l)) || "";
    const mNombre = /^\s*(.+?)\s{3,}(.+?)\s+(\d{3,8})\s*$/.exec(lineaNombre);
    const lCuil = lineaDebajoDe(lineas, /C\.U\.I\.L\.\s+BASICO/i);
    const mCuil = /(\d{2}-?\d{8}-?\d)\s+([\d.,]+)\s+(\d{2}\/\d{2}\/\d{4}|\s*\/\s*\/)?\s*(.*)$/.exec(lCuil.trim());
    const lCuit = lineas.find((l) => /C\.U\.I\.T\.\s*:/i.test(l)) || "";
    const mCuit = /C\.U\.I\.T\.\s*:\s*(\d{2}-?\d{8}-?\d)(.*)$/i.exec(lCuit);
    const sectorYModalidad = partes(mCuit?.[2] || "");
    const lCat = lineas.find((l) => /BANCO\s+DEPOSITO/i.test(l) && /PERIODO\s+F\.DEPOSITO/i.test(l)) || "";
    const catYTarea = partes(lCat.replace(/^.*BANCO\s+DEPOSITO/i, ""));
    const lDep = lineas.find((l) => /PERIODO\s+LIQUIDADO/i.test(l)) || "";
    const mDep = /^\s*(\d{2}\/\d{4})?\s*(\d{2}\/\d{2}\/\d{4})?\s*(.*?)\s{3,}PERIODO\s+LIQUIDADO\s+(.*)$/i.exec(lDep);
    const periodoTexto = colapsar(mDep?.[4] || "");
    const mPer = /([A-Z]+)\s+(\d{4})/i.exec(periodoTexto);
    const periodo = mPer && MESES[mPer[1].toUpperCase()] ? `${mPer[2]}-${MESES[mPer[1].toUpperCase()]}` : "";
    const lPago = lineaDebajoDe(lineas, /FORMA\s+DE\s+PAGO/i);
    const mPago = /^\s*(.+?)\s{3,}(\d{2}\/\d{2}\/\d{4})/.exec(lPago);
    const totales = filaDeTotales(lineas);
    const cuil = normalizarCuit(mCuil?.[1] || "") || "";
    const empleadorCuit = normalizarCuit(mCuit?.[1] || "") || "";
    return {
        cuil,
        empleadorCuit,
        empresa: colapsar(mNombre?.[1] || ""),
        nombre: colapsar(mNombre?.[2] || ""),
        legajo: mNombre?.[3] || "",
        basico: mCuil?.[2] || "",
        ingreso: mCuil?.[3] && /\d/.test(mCuil[3]) ? mCuil[3] : "",
        antiguedad: colapsar(mCuil?.[4] || ""),
        sector: sectorYModalidad[0] || "",
        modalidad: sectorYModalidad.slice(1).join(" "),
        categoria: catYTarea[0] || "",
        tarea: catYTarea.slice(1).join(" "),
        periodoDeposito: mDep?.[1] || "",
        fechaDeposito: mDep?.[2] || "",
        bancoDeposito: colapsar(mDep?.[3] || ""),
        periodo,
        periodoTexto,
        costoTotal: importeDeLinea(lineas, /COSTO\s+TOTAL\s+EMPLEADOR/i),
        contribucionesEmpleador: importeDeLinea(lineas, /SUBTOTAL\s+CONTRIBUCIONES\s+EMPLEADOR/i),
        sueldoBruto: importeDeLinea(lineas, /SUELDO\s+BRUTO\s+[\d.]/i),
        remunerativo: totales["REMUNERATIVO"] || "",
        noRemunerativo: totales["NO REMUNERATIVO"] || "",
        descuentos: totales["DESCUENTOS"] || "",
        sueldoNeto: totales["SUELDO NETO"] || "",
        otros: totales["OTROS"] || "",
        neto: totales["NETO A COBRAR"] || "",
        formaPago: colapsar(mPago?.[1] || ""),
        fechaPago: mPago?.[2] || "",
        numeroRecibo: /RECIBO\s+N\S*\s*(\d+)/i.exec(texto)?.[1] || "",
        conceptos: conceptosDe(lineas),
        cuitsEncontrados: [cuil, empleadorCuit].filter(Boolean),
    };
}
/** Todo el TXT: un recibo por persona, con sus hojas (índices base 0) y lo leído de su «ORIGINAL». */
export function leerTxtDeRecibos(contenido) {
    const bloques = bloquesDelTxt(contenido);
    const recibos = agruparBloques(bloques).map((hojas) => ({
        hojas,
        texto: hojas.map((i) => bloques[i].texto).join("\n\n----- página siguiente -----\n\n"),
        datos: leerBloque(bloques[hojas[0]].texto),
    }));
    return { bloques, recibos };
}
