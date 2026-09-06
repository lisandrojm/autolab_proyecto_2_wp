/**
 * SEÑALES DE UN ACUERDO, leídas de su texto plano. NO LEE IMPORTES.
 *
 * La capa 3 va a extraer escalas y aplicarlas: eso es escribir, en un campo que termina en el TXT de
 * alta temprana como retribución pactada. Estas señales son lo que hace que esa capa se pueda
 * construir sin miedo, porque contestan antes las tres preguntas que un número solo no contesta:
 *
 *   1. ¿este acuerdo es de un convenio que usamos?
 *   2. ¿desde cuándo rige?
 *   3. ¿los importes son mensuales, o por jornada?
 *
 * Módulo puro y sin dependencias: se prueba con un string, sin base ni PDF. Lo usan el script de
 * extracción y sus tests.
 *
 * REGLA QUE ATRAVIESA TODO: ninguna señal viaja sin el fragmento del que salió. Una detección sin su
 * origen no se puede verificar sin volver a abrir el PDF, que es exactamente el trabajo que esto
 * viene a evitar.
 */
/** Cuánto texto alrededor de la coincidencia se guarda como prueba. */
const CONTEXTO = 60;
const fragmentoDe = (texto, indice, largo) => texto
    .slice(Math.max(0, indice - CONTEXTO), indice + largo + CONTEXTO)
    .replace(/\s+/g, " ")
    .trim();
/**
 * "131/75" → "0131/75". Los PDF escriben el número sin ceros a la izquierda y el catálogo con ellos.
 *
 * Sin esto, comparar lo mencionado contra lo asignado da siempre «ninguno coincide», que es una
 * respuesta tranquilizadoramente falsa: parecería que ningún acuerdo es nuestro.
 */
export const normalizarConvenio = (codigo) => {
    const m = /^\s*(\d{1,4})\s*\/\s*(\d{1,2})\s*$/.exec(codigo);
    if (!m)
        return codigo.trim();
    return `${m[1].padStart(4, "0")}/${m[2].padStart(2, "0")}`;
};
/**
 * El número de convenio SOLO cuenta si viene precedido por «CCT» o «Convenio Colectivo».
 *
 * Sin ese ancla, `\d{3}/\d{2}` levanta fechas: estos acuerdos están llenos de «25/10/2022» y de
 * artículos «14/75». El prefijo no es una precaución teórica — es lo único que separa un convenio de
 * una fecha en un texto plano sin estructura.
 *
 * Las variantes salen del corpus real: «CCT 131/75», «CCT: 634/11», «CCT N° 634/11», «CCT. 131/75»,
 * «Convenio Colectivo de Trabajo N° 131/75».
 */
const RE_CONVENIO = /(?:C\.?C\.?T\.?|convenios?\s+colectivos?(?:\s+de\s+trabajo)?)\s*(?:n[°º]?|nro\.?|:)?\s*(\d{2,4}\s*\/\s*\d{2})/gi;
export const conveniosMencionados = (texto) => {
    const vistos = new Map();
    for (const m of texto.matchAll(RE_CONVENIO)) {
        const codigo = normalizarConvenio(m[1]);
        if (vistos.has(codigo))
            continue;
        vistos.set(codigo, { valor: codigo, fragmento: fragmentoDe(texto, m.index ?? 0, m[0].length) });
    }
    return [...vistos.values()];
};
/**
 * El período de vigencia, tal como lo escribe el acuerdo.
 *
 * «PERIODO JULIO - AGOSTO 2025» es la forma del SATSAID y la que se coteja contra el texto del
 * enlace. Los tarifarios de actores no la usan: ponen «VALOR JULIO/2026» arriba de la columna, así
 * que se acepta también esa forma. No se interpreta a fechas acá — eso es de la capa 3, y hacerlo
 * antes de que exista quien lo consuma es inventar un contrato.
 */
const PATRONES_PERIODO = [
    /per[ií]odo\s*:?\s*([A-ZÁÉÍÓÚÑ]+(?:\s*[-–/y]\s*[A-ZÁÉÍÓÚÑ]+)*\s*(?:de\s*)?\d{4})/i,
    /\b([A-ZÁÉÍÓÚÑ]{4,}\s*\/\s*\d{4})\b/,
];
/**
 * TODOS los períodos que nombra el documento, no el primero.
 *
 * Un acuerdo del SATSAID trae varios: «ACUERDO SALARIAL 2022-2023 (PRIMER TRAMO: OCTUBRE-NOVIEMBRE-
 * DICIEMBRE 2022)» tiene adentro una sección por mes, cada una con su propio «PERIODO OCTUBRE 2022».
 * Quedarse con el primero y compararlo contra el enlace daba «no coinciden» en 7 de 31 publicaciones
 * —todas correctas—, porque el enlace anuncia el rango entero y el PDF encabeza un tramo.
 */
export const periodosMencionados = (texto) => {
    const vistos = new Map();
    for (const base of PATRONES_PERIODO) {
        const re = new RegExp(base.source, base.flags.includes("g") ? base.flags : base.flags + "g");
        for (const m of texto.matchAll(re)) {
            const valor = m[1].replace(/\s+/g, " ").trim().toUpperCase();
            if (!vistos.has(valor))
                vistos.set(valor, { valor, fragmento: fragmentoDe(texto, m.index ?? 0, m[0].length) });
        }
    }
    return [...vistos.values()];
};
/** El primero, que es el que se muestra como etiqueta. La comparación usa todos. */
export const periodoMencionado = (texto) => periodosMencionados(texto)[0] || null;
/**
 * El número de expediente del Ministerio (GDE): «RE-2026-43103223-APN-DTD#JGM».
 *
 * Es lo que identifica al acuerdo ante el organismo, y el único dato del PDF que permite cotejar
 * contra el Boletín Oficial sin depender del nombre del archivo. Aparece también en la forma corta
 * «EX-2022-114248312-», sin la parte de la repartición.
 */
const RE_EXPEDIENTE = /\b(?:RE|EX|IF|DI)-\d{4}-\d{6,}(?:-+\s*-?APN-[A-Z0-9#]+)?/;
export const expediente = (texto) => {
    const m = RE_EXPEDIENTE.exec(texto);
    if (!m)
        return null;
    return { valor: m[0].replace(/\s+/g, "").replace(/-+$/, ""), fragmento: fragmentoDe(texto, m.index, m[0].length) };
};
/**
 * LA SEÑAL QUE MÁS IMPORTA: el documento dice que sus importes no son mensuales.
 *
 * El tarifario de publicidad de la Asociación Argentina de Actores termina con «• Valores por
 * jornada». Cargar esos números como sueldo bruto mensual declararía mal la remuneración de todos
 * los actores de publicidad ante ARCA, y es un error que ninguna validación aritmética encuentra:
 * los números están bien, está mal la unidad.
 *
 * POR QUÉ «DIARIO» A SECAS NO ALCANZA PARA DISPARAR
 *
 * Medido sobre los 33 PDF guardados: «diaria/diario» aparece en 14, y en los 14 dice «Jornada
 * Diaria» o «9 Hs Diarias de Lunes a Viernes» — la duración de la jornada laboral, que no tiene nada
 * que ver con la unidad del importe. Un aviso que se enciende en el 42% de los documentos deja de
 * mirarse, y esta señal existe justamente para que cuando se encienda alguien la mire.
 *
 * Por eso «diario» solo cuenta pegado a una palabra de valor, mientras que «por jornada», «por día» y
 * «por función» disparan solos: en el mismo corpus aparecen UNA vez, en el único documento que
 * efectivamente cotiza por jornada.
 */
const PATRONES_UNIDAD = [
    /\bpor\s+jornadas?\b/i,
    /\bpor\s+d[ií]as?\b/i,
    /\bpor\s+funci[oó]n(?:es)?\b/i,
    /\b(?:valor(?:es)?|importes?|montos?|tarifas?)\s+diarios?\b/i,
];
export const unidadSospechosa = (texto) => {
    for (const re of PATRONES_UNIDAD) {
        const m = re.exec(texto);
        if (m)
            return { valor: m[0].replace(/\s+/g, " ").toLowerCase(), fragmento: fragmentoDe(texto, m.index, m[0].length) };
    }
    return null;
};
export const detectarSenales = (texto) => ({
    conveniosMencionados: conveniosMencionados(texto),
    periodoMencionado: periodoMencionado(texto),
    expediente: expediente(texto),
    unidadSospechosa: unidadSospechosa(texto),
});
export const cotejarConvenios = (mencionados, deLaFuente) => {
    if (mencionados.length === 0)
        return "sin_mencion";
    const propios = new Set(deLaFuente.map(normalizarConvenio));
    return mencionados.some((c) => propios.has(normalizarConvenio(c))) ? "coinciden" : "ajeno";
};
/** Meses en el orden del año, para comparar períodos sin depender de cómo estén escritos. */
const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
/**
 * Los meses y los años que nombra un texto.
 *
 * Los meses se buscan por sus cuatro primeras letras porque los tarifarios abrevian: «AGOS - SEPT»
 * tiene que caer en AGOSTO y SEPTIEMBRE. Cuatro letras alcanzan para que ningún mes se confunda con
 * otro (JUNI / JULI son distintos, que es el único par que se parece).
 */
const partesDePeriodo = (texto) => {
    const arriba = texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
    return {
        meses: MESES.filter((m) => arriba.includes(m.slice(0, 4))),
        anios: [...new Set([...arriba.matchAll(/\b(20\d{2})\b/g)].map((m) => m[1]))],
    };
};
/**
 * ¿El período que dice el PDF es el mismo que anuncia el enlace?
 *
 * Los enlaces del SATSAID ya traen el período —«ACUERDO SALARIAL 2025-2026 - PERIODO JULIO - AGOSTO
 * 2025»—, así que compararlo con lo que dice el PDF por dentro es gratis y detecta el caso feo: que
 * el gremio haya colgado bajo un enlace el acuerdo de otro mes. Ahí la vigencia que se cargue sale
 * mal, y ningún importe lo delata.
 *
 * `null` = no hay con qué comparar, que no es lo mismo que «no coinciden».
 */
export const coincidePeriodo = (periodosPdf, textoEnlace) => {
    const lista = (typeof periodosPdf === "string" ? [periodosPdf] : periodosPdf || []).filter(Boolean);
    if (lista.length === 0 || !textoEnlace)
        return null;
    const b = partesDePeriodo(textoEnlace);
    if (b.meses.length === 0)
        return null;
    const alguno = lista.map(partesDePeriodo).filter((x) => x.meses.length > 0);
    if (alguno.length === 0)
        return null;
    return alguno.some((a) => comparar(a, b));
};
const comparar = (a, b) => {
    /*
      LOS MESES DEL PDF TIENEN QUE ESTAR CONTENIDOS EN LOS DEL ENLACE; LOS AÑOS, INTERSECAR. Las dos
      laxitudes están medidas contra el corpus, no elegidas de antemano.
  
      · Contención y no igualdad, porque el enlace anuncia el rango completo y cada sección del PDF
        encabeza un tramo: «PERIODO ENERO A ABRIL 2025» en el enlace, «PERIODO ABRIL 2025» adentro.
        Con igualdad, 7 de 31 publicaciones correctas daban «no coinciden».
      · Intersección en los años, porque «ACUERDO SALARIAL 2025-2026 - PERIODO JULIO - AGOSTO 2025»
        nombra DOS años —el de la paritaria entera— para un período de uno solo.
  
      Lo que se sigue detectando es lo que importa: si NINGÚN período del PDF cae dentro del que anuncia
      el enlace, el gremio colgó otro documento y la vigencia que se cargue va a salir mal.
    */
    const mesesContenidos = a.meses.every((m) => b.meses.includes(m));
    const anioEnComun = a.anios.length === 0 || b.anios.length === 0 || a.anios.some((x) => b.anios.includes(x));
    return mesesContenidos && anioEnComun;
};
