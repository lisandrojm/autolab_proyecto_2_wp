import JSZip from "jszip";
import { MESES } from "../utils/planillaJornaleros.js";
/*
  LA PLANILLA DE JORNALEROS SOBRE SU PLANTILLA, A NIVEL XML.

  La plantilla (`server/plantillas/jornaleros.xlsx`) es la planilla de septiembre de 2026 sin sus
  datos: estilos, anchos, el Resumen Ejecutivo con sus tres gráficos y todas sus fórmulas. Se trabaja
  sobre el XML del .xlsx y no con una librería de planillas porque exceljs y openpyxl pierden los
  gráficos al abrir un archivo: el Resumen saldría sin ellos.

  Qué se toca:
    · Reporte: una fila por jornada (valores; E y J con sus fórmulas de siempre). Sin las columnas
      CONTROL TRELLO y la del legajo repetido (pedido del 29/10/2026): la plantilla ya no las tiene,
      y el control del Resumen que leía la de Trello se sacó.
    · SUBTOTAL: las mismas filas, que leen del Reporte, con «Total <persona>» y «Total general»
      con =SUBTOTAL(9, …) (no duplica los parciales).
    · LIQUIDACION: era una tabla dinámica (B:E). Se reemplaza por valores —una fila por persona y
      categoría— y las columnas calculadas siguen siendo las fórmulas del archivo, con los rangos del
      mes. N° y nombre de categoría van como valor: buscarlos por nombre de persona (como hacía la
      planilla) le daría a quien trabajó en dos categorías la escala de la primera.
    · Resumen Ejecutivo: el mes (D4) y las categorías de la tabla 1. Lo demás son fórmulas.
  Excel recalcula todo al abrir (`fullCalcOnLoad`); los valores en caché se borran para que ningún
  visor muestre los de septiembre.

  Los estilos (`s`) son los índices de `styles.xml` de la plantilla; los atributos de fila, los de
  sus filas modelo. Si se reemplaza la plantilla hay que revisarlos.
*/
const HOJA = { resumen: "xl/worksheets/sheet1.xml", reporte: "xl/worksheets/sheet2.xml", subtotal: "xl/worksheets/sheet3.xml", liquidacion: "xl/worksheets/sheet4.xml" };
/** Filas vacías con fórmulas que se dejan debajo del «Total general» de LIQUIDACION (como la plantilla). */
const FILAS_LIBRES_LIQUIDACION = 24;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** "YYYY-MM-DD" → número de serie de Excel. */
const serial = (fecha) => {
    const [y, m, d] = fecha.split("-").map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
};
const celda = (ref, s, v) => {
    const st = s === undefined ? "" : ` s="${s}"`;
    if (v === null)
        return `<c r="${ref}"${st}/>`;
    if ("f" in v)
        return `<c r="${ref}"${st}><f>${esc(v.f)}</f></c>`;
    if ("n" in v)
        return `<c r="${ref}"${st}><v>${v.n}</v></c>`;
    if ("d" in v)
        return `<c r="${ref}"${st}><v>${serial(v.d)}</v></c>`;
    return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(v.t)}</t></is></c>`;
};
const fila = (r, attrs, celdas) => `<row r="${r}"${attrs}>${celdas.map(([col, s, v]) => celda(`${col}${r}`, s, v)).join("")}</row>`;
const texto = (s) => (s ? { t: s } : null);
// ── Hojas ──────────────────────────────────────────────────────────────────
/** Reemplaza las filas de `<sheetData>` desde `desde` en adelante; las anteriores (encabezados) quedan. */
const reemplazarFilas = (xml, desde, nuevas) => {
    const ini = xml.indexOf("<sheetData>") + "<sheetData>".length;
    const fin = xml.indexOf("</sheetData>");
    const viejas = xml.slice(ini, fin).match(/<row [\s\S]*?<\/row>|<row [^>]*\/>/g) || [];
    const quedan = viejas.filter((r) => Number(/ r="(\d+)"/.exec(r)[1]) < desde);
    return xml.slice(0, ini) + quedan.join("") + nuevas.join("") + xml.slice(fin);
};
const conRef = (xml, etiqueta, ref) => xml.replace(new RegExp(`<${etiqueta} ref="[^"]*"`), `<${etiqueta} ref="${ref}"`);
function hojaReporte(xml, p) {
    const filas = p.reporte.map((f, i) => {
        const r = i + 2;
        return fila(r, ` spans="1:12" x14ac:dyDescent="0.3"`, [
            ["A", 23, texto(f.legajo)],
            ["B", undefined, texto(f.apellido)],
            ["C", undefined, texto(f.nombre)],
            ["D", undefined, texto(f.rol)],
            ["E", 16, { f: `CONCATENATE(B${r}," ",C${r})` }],
            ["F", 23, f.categoriaNumero == null ? null : { n: f.categoriaNumero }],
            ["G", 16, texto(f.categoriaNombre)],
            ["H", 23, { n: 1 }],
            ["I", 66, { n: f.sueldoJornada }],
            ["J", 66, { f: `+I${r}*H${r}` }],
            ["K", 24, { d: f.fecha }],
            ["L", 24, { d: f.fecha }],
        ]);
    });
    const ultima = p.reporte.length + 1;
    let out = reemplazarFilas(xml, 2, filas);
    out = out.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:L${Math.max(ultima, 1)}"/>`);
    out = conRef(out, "autoFilter", `A1:L${Math.max(ultima, 1)}`).replace(/<sortState[\s\S]*?<\/sortState>/, "");
    return out;
}
/** SUBTOTAL: devuelve el XML y la última fila escrita (la del «Total general»). */
function hojaSubtotal(xml, p) {
    const filas = [];
    const COLS_A_L = [["A", 23], ["B", undefined], ["C", undefined], ["D", undefined], ["E", 16], ["F", 23], ["G", 16], ["H", 23], ["I", 66], ["J", 66], ["K", 24], ["L", 24]];
    const RELLENO = "O P Q R S T U V W X Y Z AA AB AC AD AE AF AG AH AI AJ AK AL AM AN AO AP AQ AR AS AT AU AV AW AX AY AZ BA BB BC".split(" ");
    let r = 2;
    let i = 0;
    while (i < p.reporte.length) {
        const desde = r;
        const clave = p.reporte[i].clave;
        while (i < p.reporte.length && p.reporte[i].clave === clave) {
            const fuente = i + 2; // la fila del Reporte
            filas.push(fila(r, ` spans="1:55" outlineLevel="2" x14ac:dyDescent="0.3"`, COLS_A_L.map(([col, s]) => {
                const f = col === "H" || col === "I" ? `Reporte!${col}${fuente}` : col === "J" ? `+I${r}*H${r}` : `IF(Reporte!${col}${fuente}="","",Reporte!${col}${fuente})`;
                return [col, s, { f }];
            })));
            i++;
            r++;
        }
        filas.push(fila(r, ` spans="1:55" s="4" customFormat="1" outlineLevel="1" x14ac:dyDescent="0.3"`, [
            ["A", 27, null],
            ["E", 28, { f: `"Total "&E${desde}` }],
            ["F", 27, null],
            ["G", 28, null],
            ["H", 27, { f: `SUBTOTAL(9,H${desde}:H${r - 1})` }],
            ["I", 67, { f: `SUBTOTAL(9,I${desde}:I${r - 1})` }],
            ["J", 67, { f: `SUBTOTAL(9,J${desde}:J${r - 1})` }],
            ["K", 29, null],
            ["L", 29, null],
            ["M", 27, null],
            ["N", 27, null],
            ...RELLENO.map((c) => [c, 31, null]),
        ]));
        r++;
    }
    filas.push(fila(r, ` spans="1:55" s="4" customFormat="1" x14ac:dyDescent="0.3"`, [
        ["A", 5, null],
        ["E", 7, { t: "Total general" }],
        ["F", 5, null],
        ["G", 7, null],
        ["H", 5, { f: `SUBTOTAL(9,H2:H${r - 1})` }],
        ["I", 68, { f: `SUBTOTAL(9,I2:I${r - 1})` }],
        ["J", 68, { f: `SUBTOTAL(9,J2:J${r - 1})` }],
        ["K", 8, null],
        ["L", 8, null],
        ["M", 5, null],
        ["N", 5, null],
        ...RELLENO.map((c) => [c, 31, null]),
    ]));
    let out = reemplazarFilas(xml, 2, filas);
    out = out.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:BC${r}"/>`);
    out = conRef(out, "autoFilter", `A1:L${r - 1}`).replace(/<sortState[\s\S]*?<\/sortState>/, "");
    return { xml: out, ultima: r };
}
function hojaLiquidacion(xml, p) {
    const ultimaReporte = Math.max(p.reporte.length + 1, 2);
    const total = 5 + p.liquidacion.length;
    const hasta = total + FILAS_LIBRES_LIQUIDACION;
    const finEscala = 3 + Math.max(p.escala.length, 1);
    const rep = (col) => `Reporte!$${col}$2:$${col}$${ultimaReporte}`;
    const sinFila = (r) => `OR($B${r}="",OR($B${r}="Total general",$B${r}="Total Result"),NOT(ISNUMBER($D${r})))`;
    const calculada = (col, r, expr) => ({ f: `IF(OR($B${r}="",NOT(ISNUMBER($D${r}))),"",IF(OR($B${r}="Total general",$B${r}="Total Result"),SUM(${col}$4:${col}${r - 1}),${expr}))` });
    const escalaDe = (r, k) => ({ f: `IF(${sinFila(r)},"",IFERROR(VLOOKUP($F${r},$AI$4:$AL$${finEscala},${k},FALSE),0))` });
    const filas = [];
    for (let r = 4; r <= hasta; r++) {
        const dato = r >= 5 && r < total ? p.liquidacion[r - 5] : null;
        const esTotal = r === total;
        const esc_ = p.escala[r - 4];
        const [sB, sCD, sE] = r === 4 ? [119, 0, 122] : dato ? [116, 117, 118] : esTotal ? [35, 88, 118] : [32, 34, 81];
        const celdas = [
            ["A", 80, { f: `IF(${sinFila(r)},"",IFERROR(INDEX(${rep("A")},MATCH($B${r},${rep("E")},0))&"",""))` }],
        ];
        if (r === 4) {
            celdas.push(["B", 119, { t: "APELLIDO & NOMBRE" }], ["C", 120, { t: "Q PERSONAS" }], ["D", 121, { t: "Q JORNADAS" }], ["E", 122, { t: "NETO PACTADO" }]);
        }
        else if (dato) {
            celdas.push(["B", sB, { t: dato.clave }], ["C", sCD, { n: dato.contratos }], ["D", sCD, { n: dato.jornadas }], ["E", sE, { n: dato.netoPactado }]);
        }
        else if (esTotal) {
            celdas.push(["B", sB, { t: "Total general" }], ["C", sCD, { n: p.totales.contratos }], ["D", sCD, { n: p.totales.jornadas }], ["E", sE, { n: p.totales.netoPactado }]);
        }
        else {
            celdas.push(["B", sB, null], ["C", sCD, null], ["D", sCD, null], ["E", sE, null]);
        }
        celdas.push(["F", 18, dato ? (dato.categoriaNumero == null ? null : { n: dato.categoriaNumero }) : { f: `IF(${sinFila(r)},"",IFERROR(VLOOKUP($B${r},Reporte!$E$2:$F$${ultimaReporte},2,FALSE),""))` }], ["G", 19, dato ? texto(dato.categoriaNombre) : { f: `IF(${sinFila(r)},"",IFERROR(VLOOKUP($B${r},Reporte!$E$2:$G$${ultimaReporte},3,FALSE),""))` }], ["H", 80, escalaDe(r, 2)], ["I", 80, escalaDe(r, 3)], ["J", 80, escalaDe(r, 4)], ["K", 17, null], ["L", 16, calculada("L", r, `+D${r}`)], ["M", 82, calculada("M", r, `+L${r}*J${r}`)], ["N", 82, calculada("N", r, `+M${r}*0.1`)], ["O", 82, null], ["P", 82, null], ["Q", 82, null], ["R", 82, calculada("R", r, `SUM(M${r}:Q${r})/12`)], ["S", 83, calculada("S", r, `SUM(M${r}:R${r})`)], ["T", 82, null], ["U", 82, calculada("U", r, `(S${r})*19%*-1`)], ["V", 82, null], ["W", 83, calculada("W", r, `+S${r}+U${r}`)], ["X", 83, null], ["Y", 83, calculada("Y", r, `+W${r}-X${r}`)], ["Z", 84, calculada("Z", r, `+E${r}`)], ["AA", 85, calculada("AA", r, `+Z${r}-W${r}`)], ["AB", 86, null], ["AC", 82, calculada("AC", r, `(+M${r}+N${r})`)], ["AD", 82, calculada("AD", r, `+AC${r}*19%`)], ["AE", 82, calculada("AE", r, `+AC${r}-AD${r}`)], ["AF", 82, calculada("AF", r, `+AE${r}-Z${r}`)]);
        if (esc_)
            celdas.push(["AI", 18, { n: esc_.numero }], ["AJ", 80, { n: esc_.basico }], ["AK", 80, { n: esc_.sattsaid }], ["AL", 80, { n: esc_.jornal }]);
        const attrs = r === 4 ? ` spans="1:38" ht="16.2" thickBot="1" x14ac:dyDescent="0.35"` : ` spans="1:38" x14ac:dyDescent="0.3"`;
        filas.push(fila(r, attrs, celdas));
    }
    const [, m] = p.mes.split("-").map(Number);
    let out = reemplazarFilas(xml, 4, filas);
    // B1: «TOTAL JORNALEROS <MES>»; C1: personas distintas (una persona puede tener dos filas).
    out = out.replace(/<c r="B1"([^>]*?) t="s"><v>\d+<\/v><\/c>/, `<c r="B1"$1 t="inlineStr"><is><t>TOTAL JORNALEROS ${MESES[m - 1]}</t></is></c>`);
    out = out.replace(/<c r="C1"([^>]*)><f>[^<]*<\/f>(<v>[^<]*<\/v>)?<\/c>/, `<c r="C1"$1><f>${esc(`SUMPRODUCT((B5:B${total - 1}<>"")/COUNTIF(B5:B${total - 1},B5:B${total - 1}&""))`)}</f></c>`);
    out = out.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:AL${hasta}"/>`);
    out = conRef(out, "autoFilter", `A3:J${total - 1}`);
    // La tabla dinámica y los comentarios de septiembre (eran sobre filas de ese mes) no van.
    out = out.replace(/<legacyDrawing [^>]*\/>/, "");
    return { xml: out, total };
}
function hojaResumen(xml, p) {
    let out = xml.replace(/(<c r="D4"[^>]*>)<v>[^<]*<\/v>/, `$1<v>${serial(`${p.mes}-01`)}</v>`);
    for (let i = 0; i < 9; i++) {
        const r = 14 + i;
        const cat = p.categoriasResumen[i];
        out = out.replace(new RegExp(`<c r="B${r}"( s="\\d+")?[^>]*?(/>|>[\\s\\S]*?</c>)`), `<c r="B${r}"$1${cat?.numero != null ? `><v>${cat.numero}</v></c>` : "/>"}`);
        out = out.replace(new RegExp(`<c r="C${r}"( s="\\d+")?[^>]*?(/>|>[\\s\\S]*?</c>)`), cat ? `<c r="C${r}"$1 t="inlineStr"><is><t>${esc(cat.nombre)}</t></is></c>` : `<c r="C${r}"$1/>`);
    }
    return out;
}
// ── Libro ──────────────────────────────────────────────────────────────────
/** Quita los valores en caché de las celdas con fórmula: se recalculan al abrir. */
const sinCache = (xml) => xml.replace(/<c ([^>]*?)>(<f\b[^>]*\/>|<f\b[^>]*>[\s\S]*?<\/f>)<v>[\s\S]*?<\/v><\/c>/g, (_m, attrs, f) => `<c ${attrs.replace(/ t="(str|e|b|n)"/, "")}>${f}</c>`);
/** Rehace `sharedStrings.xml` con sólo los textos que siguen en uso (los de septiembre se van). */
async function compactarTextos(zip, hojas) {
    const sstXml = await zip.file("xl/sharedStrings.xml").async("string");
    const items = sstXml.match(/<si>[\s\S]*?<\/si>/g) || [];
    const xmls = await Promise.all(hojas.map((h) => zip.file(h).async("string")));
    const usados = [];
    const nuevo = new Map();
    const re = /<c ([^>]*?\bt="s"[^>]*)><v>(\d+)<\/v><\/c>/g;
    for (const x of xmls)
        for (const m of x.matchAll(re)) {
            const i = Number(m[2]);
            if (!nuevo.has(i)) {
                nuevo.set(i, usados.length);
                usados.push(i);
            }
        }
    hojas.forEach((h, k) => zip.file(h, xmls[k].replace(re, (_m, attrs, i) => `<c ${attrs}><v>${nuevo.get(Number(i))}</v></c>`)));
    const cabeza = sstXml.slice(0, sstXml.indexOf("<sst")).concat(sstXml.match(/<sst[^>]*>/)[0].replace(/ count="\d+"/, "").replace(/ uniqueCount="\d+"/, ""));
    zip.file("xl/sharedStrings.xml", `${cabeza.replace(/>$/, ` count="${usados.length}" uniqueCount="${usados.length}">`)}${usados.map((i) => items[i]).join("")}</sst>`);
}
export async function generarXlsxJornaleros(plantilla, p) {
    const zip = await JSZip.loadAsync(plantilla);
    const leer = (n) => zip.file(n).async("string");
    const reporte = hojaReporte(await leer(HOJA.reporte), p);
    const subtotal = hojaSubtotal(await leer(HOJA.subtotal), p);
    const liquidacion = hojaLiquidacion(await leer(HOJA.liquidacion), p);
    const resumen = hojaResumen(await leer(HOJA.resumen), p);
    zip.file(HOJA.reporte, sinCache(reporte));
    zip.file(HOJA.subtotal, sinCache(subtotal.xml));
    zip.file(HOJA.liquidacion, sinCache(liquidacion.xml));
    zip.file(HOJA.resumen, sinCache(resumen));
    // Fuera: la tabla dinámica, su caché (con los datos de septiembre), los comentarios y la cadena de cálculo.
    for (const n of Object.keys(zip.files))
        if (/^xl\/(pivotTables|pivotCache)\/|^xl\/comments\d*\.xml$|^xl\/drawings\/vmlDrawing\d*\.vml$|^xl\/calcChain\.xml$/.test(n))
            zip.remove(n);
    const relsLiq = "xl/worksheets/_rels/sheet4.xml.rels";
    if (zip.file(relsLiq)) {
        const rels = (await leer(relsLiq)).replace(/<Relationship [^>]*(pivotTable|comments|vmlDrawing)[^>]*\/>/g, "");
        if (/<Relationship /.test(rels))
            zip.file(relsLiq, rels);
        else
            zip.remove(relsLiq);
    }
    zip.file("xl/_rels/workbook.xml.rels", (await leer("xl/_rels/workbook.xml.rels")).replace(/<Relationship [^>]*(pivotCacheDefinition|calcChain)[^>]*\/>/g, ""));
    zip.file("[Content_Types].xml", (await leer("[Content_Types].xml")).replace(/<Override [^>]*PartName="\/xl\/(pivotTables|pivotCache|comments|calcChain)[^>]*\/>/g, ""));
    const ultimaReporte = Math.max(p.reporte.length + 1, 1);
    let wb = await leer("xl/workbook.xml");
    wb = wb.replace(/<pivotCaches>[\s\S]*?<\/pivotCaches>/, "");
    // Con función: en un texto de reemplazo, el «$1» de «$A$1» se leería como el grupo 1.
    const filtro = (hoja, rango) => {
        wb = wb.replace(new RegExp(`(<definedName name="_xlnm\\._FilterDatabase" localSheetId="${hoja}" hidden="1">)[^<]*`), (_m, abre) => abre + rango);
    };
    filtro(3, `LIQUIDACION!$A$3:$J$${liquidacion.total - 1}`);
    filtro(1, `Reporte!$A$1:$L$${ultimaReporte}`);
    filtro(2, `SUBTOTAL!$A$1:$L$${subtotal.ultima - 1}`);
    wb = wb.replace(/<calcPr([^>]*?)\/>/, (_m, a) => `<calcPr${a.replace(/ fullCalcOnLoad="\d"/, "")} fullCalcOnLoad="1"/>`);
    // Abre en el Resumen.
    wb = wb.replace(/ activeTab="\d+"/, "");
    zip.file("xl/workbook.xml", wb);
    // Cada hoja abre arriba de todo (la plantilla guardó la vista donde la dejó quien la armó).
    for (const h of Object.values(HOJA)) {
        let x = (await leer(h)).replace(/ tabSelected="1"/g, "").replace(/(<sheetView [^>]*?) topLeftCell="[^"]*"/, "$1").replace(/<selection [^>]*\/>/, `<selection activeCell="A1" sqref="A1"/>`);
        if (h === HOJA.resumen)
            x = x.replace(/<sheetView /, `<sheetView tabSelected="1" `);
        zip.file(h, x);
    }
    await compactarTextos(zip, Object.values(HOJA));
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
