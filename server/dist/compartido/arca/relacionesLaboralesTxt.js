/**
 * LECTURA DEL TXT DE «CONSULTAS DE RELACIONES LABORALES» DE ARCA (Simplificación Registral).
 *
 * No confundir con `afipTxt.ts`: ese GENERA el archivo de altas masivas que se le manda a ARCA;
 * este LEE el que ARCA entrega en `ArchivoConsultaRel.aspx` cuando se consulta por fecha de ingreso
 * de movimientos, por CUIL, por mes, etc. Es un listado de ancho fijo con una fila de encabezado y
 * una fila por relación laboral, 30 por página.
 *
 * EL LAYOUT SALE DEL ENCABEZADO, no de números escritos a mano. Cada columna empieza donde empieza
 * su rótulo en la primera fila y termina donde empieza el siguiente; la última llega al final de la
 * fila. Si ARCA ensanchara una columna, el parser se acomoda solo. Los rótulos sí son fijos
 * (`COLUMNAS`): son la única fuente de qué columnas hay y en qué orden.
 *
 * CÓMO VIENEN LOS BYTES (comprobado sobre los 182 archivos guardados en Dropbox, 2010–2026): es
 * UTF-8, pero con secuencias rotas. «TELEVISIÓN» llega como `C3 1D` (la Ó perdió su segundo byte) y
 * «3ª» como `EF BF BD` (ya era U+FFFD cuando ARCA lo escribió). El ancho fijo está en CARACTERES del
 * texto original: decodificar como latin-1 corre las columnas un lugar por cada acento, y un
 * decodificador UTF-8 estándar emite dos caracteres por la Ó rota (U+FFFD y un 0x1D) y también las
 * corre. `decodificarTxtRelaciones` consume los bytes que el byte inicial anuncia aunque la
 * continuación sea inválida y emite UN solo U+FFFD: cada carácter original sigue ocupando un lugar y
 * las filas miden exactamente lo que mide el encabezado (1020 en todos los archivos vistos).
 *
 * Lo que se perdió no se inventa: una «Ó» rota queda como U+FFFD en el valor, y la fila cruda viaja
 * en `rawLinea` para auditar. Para comparar textos (obra social, convenio) está `claveTexto`, que
 * ignora acentos, mayúsculas y esos caracteres perdidos.
 *
 * NUNCA TIRA. Una fila que no se entiende (CUIL que no son 11 dígitos, fecha de inicio inválida)
 * va a `descartes` con su texto crudo y el motivo; el resto se lee igual.
 */
/** Los rótulos del encabezado, en el orden en que ARCA los escribe. Única fuente del layout. */
export const COLUMNAS = [
    { clave: "cuil", rotulo: "CUIL" },
    { clave: "apellidoNombre", rotulo: "APELLIDO Y NOMBRE" },
    { clave: "obraSocial", rotulo: "OBRA SOCIAL" },
    { clave: "modalidadContrato", rotulo: "MODAL. CONTRATO" },
    { clave: "actividadLaboral", rotulo: "ACTIVIDAD LABORAL" },
    { clave: "puestoDesempenado", rotulo: "PUESTO DESEMP." },
    { clave: "retribucionPactada", rotulo: "RETRIB. PACTADA" },
    { clave: "modLiquidacion", rotulo: "MOD. LIQ." },
    { clave: "trabajadorAgropecuario", rotulo: "TRAB. AGROP." },
    { clave: "fechaInicio", rotulo: "FECHA INICIO" },
    { clave: "fechaFin", rotulo: "FECHA DE FIN" },
    { clave: "situacionBaja", rotulo: "SITUACION De BAJA" },
    { clave: "convenioColectivo", rotulo: "CONVENIO COLECTIVO" },
    { clave: "categoria", rotulo: "CATEGORIA" },
    { clave: "tipoServicio", rotulo: "TIPO SERVICIO" },
];
const ES_ENCABEZADO = /^CUIL\s/;
/**
 * UTF-8 tolerante: cada secuencia anunciada por su byte inicial ocupa UN carácter, válida o no.
 * Ver el comentario del archivo. Trabaja sobre `Uint8Array` para no depender de `Buffer` (el
 * código compartido también lo compila el frontend).
 */
export function decodificarTxtRelaciones(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length;) {
        const b = bytes[i];
        if (b < 0x80) {
            out += String.fromCharCode(b);
            i += 1;
            continue;
        }
        const largo = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
        if (largo === 1) {
            out += "�";
            i += 1;
            continue;
        } // continuación suelta
        let punto = b & (largo === 2 ? 0x1f : largo === 3 ? 0x0f : 0x07);
        let valido = i + largo <= bytes.length;
        for (let k = 1; valido && k < largo; k++) {
            const c = bytes[i + k];
            if ((c & 0xc0) !== 0x80)
                valido = false;
            else
                punto = (punto << 6) | (c & 0x3f);
        }
        out += valido ? String.fromCodePoint(punto) : "�";
        i += largo;
    }
    return out;
}
/** Las franjas de columna que dicta un encabezado. `null` si le falta algún rótulo. */
export function franjasDelEncabezado(header) {
    const franjas = [];
    let buscarDesde = 0;
    for (const c of COLUMNAS) {
        // Cada rótulo se busca después del anterior: «CATEGORIA» también aparece dentro de otros textos.
        const desde = header.indexOf(c.rotulo, buscarDesde);
        if (desde < 0)
            return null;
        franjas.push({ clave: c.clave, rotulo: c.rotulo, desde, hasta: Infinity });
        buscarDesde = desde + c.rotulo.length;
    }
    for (let i = 0; i + 1 < franjas.length; i++)
        franjas[i].hasta = franjas[i + 1].desde;
    return franjas;
}
const limpiar = (s) => s.replace(/\s+/g, " ").trim();
/** "31/03/2021" → "2021-03-31". `null` si no es una fecha real del calendario. */
export function fechaDdMmAaaaAIso(texto) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
    if (!m)
        return null;
    const [, dd, mm, aaaa] = m;
    const d = Number(dd), mes = Number(mm), a = Number(aaaa);
    const fecha = new Date(Date.UTC(a, mes - 1, d));
    if (fecha.getUTCFullYear() !== a || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== d)
        return null;
    return `${aaaa}-${mm}-${dd}`;
}
/** "59334,99" → 59334.99; "1.234,50" → 1234.5. `null` si está vacío o no es un número. */
export function importeArca(texto) {
    const t = texto.trim();
    if (!t)
        return null;
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
}
/**
 * Para comparar textos de ARCA entre sí o con nuestros catálogos: sin acentos, sin dobles espacios,
 * en mayúsculas, y con «?» donde hubo un carácter que se perdió en el camino (U+FFFD).
 */
export const claveTexto = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/�/g, "?").replace(/\s+/g, " ").trim().toUpperCase();
/**
 * ¿Son el mismo texto? «PRODUCCI�N» coincide con «PRODUCCIÓN»: el carácter perdido vale por
 * cualquier otro, de un lado o del otro. Mismo largo, sin acentos, sin importar mayúsculas.
 */
export function coincideTextoArca(a, b) {
    const x = claveTexto(a), y = claveTexto(b);
    if (x.length !== y.length)
        return false;
    for (let i = 0; i < x.length; i++)
        if (x[i] !== y[i] && x[i] !== "?" && y[i] !== "?")
            return false;
    return true;
}
function leerFila(linea, franjas) {
    const campo = (clave) => {
        const f = franjas.find((x) => x.clave === clave);
        return limpiar(linea.slice(f.desde, f.hasta === Infinity ? undefined : f.hasta));
    };
    const cuil = campo("cuil");
    if (!/^\d{11}$/.test(cuil))
        return { motivo: `CUIL inválido: «${cuil}»` };
    const fechaInicio = fechaDdMmAaaaAIso(campo("fechaInicio"));
    if (!fechaInicio)
        return { motivo: `FECHA INICIO inválida: «${campo("fechaInicio")}»` };
    const finTexto = campo("fechaFin");
    const fechaFin = finTexto ? fechaDdMmAaaaAIso(finTexto) : null;
    if (finTexto && !fechaFin)
        return { motivo: `FECHA DE FIN inválida: «${finTexto}»` };
    return {
        fila: {
            cuil,
            apellidoNombre: campo("apellidoNombre"),
            obraSocial: campo("obraSocial"),
            modalidadContrato: campo("modalidadContrato"),
            actividadLaboral: campo("actividadLaboral"),
            puestoDesempenado: campo("puestoDesempenado"),
            retribucionPactada: importeArca(campo("retribucionPactada")),
            modLiquidacion: campo("modLiquidacion"),
            trabajadorAgropecuario: /^S/i.test(campo("trabajadorAgropecuario")),
            fechaInicio,
            fechaFin,
            situacionBaja: campo("situacionBaja"),
            convenioColectivo: campo("convenioColectivo"),
            categoria: campo("categoria"),
            tipoServicio: campo("tipoServicio"),
            rawLinea: linea,
        },
    };
}
/**
 * Lee el texto de una página del TXT (o de varias pegadas una tras otra: los encabezados repetidos
 * y las líneas en blanco se saltean). Devuelve las filas tipadas y lo que no se pudo leer.
 */
export function parsearTxtRelaciones(texto) {
    const lineas = texto.split(/\r?\n/);
    const header = lineas.find((l) => ES_ENCABEZADO.test(l)) || "";
    const franjas = header ? franjasDelEncabezado(header) : null;
    const filas = [];
    const descartes = [];
    if (!franjas) {
        for (const [i, l] of lineas.entries())
            if (l.trim())
                descartes.push({ linea: i + 1, motivo: header ? "El encabezado no tiene todas las columnas esperadas" : "No hay fila de encabezado", rawLinea: l });
        return { header, franjas: [], filas, descartes };
    }
    for (const [i, l] of lineas.entries()) {
        if (!l.trim() || ES_ENCABEZADO.test(l))
            continue;
        const r = leerFila(l, franjas);
        if ("fila" in r)
            filas.push(r.fila);
        else
            descartes.push({ linea: i + 1, motivo: r.motivo, rawLinea: l });
    }
    return { header, franjas, filas, descartes };
}
/** Bytes → filas, en un paso. */
export const parsearBytesRelaciones = (bytes) => parsearTxtRelaciones(decodificarTxtRelaciones(bytes));
