/**
 * SUBIDA MASIVA DE RECIBOS (pedido del 21/10/2026): se eligen de una vez todas las sábanas PDF del mes y
 * los TXT que MEMOSOFT exporta con ellas, y acá se decide qué TXT va con qué PDF.
 *
 *   1. Por nombre: «99_PRODUCTORA_REC_SUELDO_2026_PERIODO_09_MES.pdf» con el «.txt» del mismo nombre
 *      (sin importar mayúsculas, tildes, espacios ni el « (1)» que agrega el navegador al bajar dos veces).
 *   2. Por tamaño: el TXT trae una hoja por página del PDF, así que un TXT va con el ÚNICO PDF sin pareja
 *      que tiene tantas páginas como hojas trae él. Si hay varios, desempata el que más palabras del
 *      nombre comparte; si sigue empatado, queda sin pareja (no se adivina).
 *   3. Si se subieron un solo PDF y un solo TXT, van juntos aunque no coincidan: la subida después
 *      verifica hojas contra páginas y explica el problema, en vez de decir sólo «sin pareja».
 *
 * Puro: recibe nombres y tamaños, devuelve los pares. Se testea sin archivos.
 */
const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** El nombre comparable: sin extensión, sin « (1)», sin tildes, en minúsculas y con un solo separador. */
export function nombreBase(archivo) {
    return sinTildes(archivo)
        .toLowerCase()
        .replace(/\.(pdf|txt)$/i, "")
        .replace(/\s*\(\d+\)\s*$/, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}
const palabras = (archivo) => new Set(nombreBase(archivo).split(" ").filter((p) => p.length > 1));
const comunes = (a, b) => {
    const pb = palabras(b);
    return [...palabras(a)].filter((p) => pb.has(p)).length;
};
export function emparejarSabanas(pdfs, txts) {
    const pares = [];
    const pdfsLibres = [...pdfs];
    const txtsLibres = [...txts];
    const tomar = (lista, x) => lista.splice(lista.indexOf(x), 1);
    // 1. Por nombre.
    for (const t of [...txtsLibres]) {
        const mismos = pdfsLibres.filter((p) => nombreBase(p.nombre) === nombreBase(t.nombre));
        if (mismos.length !== 1)
            continue;
        pares.push({ pdf: mismos[0].nombre, txt: t.nombre, por: "nombre" });
        tomar(pdfsLibres, mismos[0]);
        tomar(txtsLibres, t);
    }
    // 2. Por cantidad de páginas. Un TXT y un PDF del mismo tamaño van juntos si son los únicos de ese
    // tamaño; si hay varios, cada uno con el que más palabras del nombre comparte, siempre que sea el
    // mejor para los dos lados. Si no, quedan sin pareja.
    const mejorDe = (x, opciones) => {
        const puntajes = opciones.map((o) => comunes(x.nombre, o.nombre));
        const mejor = Math.max(0, ...puntajes);
        return mejor > 0 && puntajes.filter((v) => v === mejor).length === 1 ? opciones[puntajes.indexOf(mejor)] : null;
    };
    let avanzo = true;
    while (avanzo) {
        avanzo = false;
        for (const t of [...txtsLibres]) {
            const candidatos = pdfsLibres.filter((p) => p.paginas === t.hojas);
            const rivales = txtsLibres.filter((o) => o.hojas === t.hojas);
            let elegido = null;
            if (candidatos.length === 1 && rivales.length === 1)
                elegido = candidatos[0];
            else if (candidatos.length > 0) {
                const pdf = mejorDe(t, candidatos);
                if (pdf && mejorDe(pdf, rivales) === t)
                    elegido = pdf;
            }
            if (!elegido)
                continue;
            pares.push({ pdf: elegido.nombre, txt: t.nombre, por: "paginas" });
            tomar(pdfsLibres, elegido);
            tomar(txtsLibres, t);
            avanzo = true;
        }
    }
    // 3. Sobra uno de cada uno: van juntos (la subida verifica hojas contra páginas).
    // Sólo si se subieron un PDF y un TXT: en una subida masiva, los sobrantes de distinto tamaño son de liquidaciones distintas.
    if (pdfs.length === 1 && txts.length === 1 && pdfsLibres.length === 1 && txtsLibres.length === 1) {
        pares.push({ pdf: pdfsLibres[0].nombre, txt: txtsLibres[0].nombre, por: "unicos" });
        pdfsLibres.length = 0;
        txtsLibres.length = 0;
    }
    return {
        pares,
        pdfsSinTxt: pdfsLibres.map((p) => p.nombre),
        txtsSinPdf: txtsLibres.map((t) => {
            const mismoTamano = pdfsLibres.filter((p) => p.paginas === t.hojas).length;
            const motivo = t.hojas === 0 ? "No es un TXT de recibos de MEMOSOFT." : mismoTamano > 1 ? `Hay ${mismoTamano} PDF de ${t.hojas} páginas y ninguno se llama como el TXT: no se puede saber cuál es.` : `Ningún PDF tiene ${t.hojas} páginas ni se llama como el TXT.`;
            return { nombre: t.nombre, motivo };
        }),
    };
}
