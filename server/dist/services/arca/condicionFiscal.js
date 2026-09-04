/**
 * QUÉ CONDICIÓN FISCAL TIENE UN CUIT, según lo que devuelve el padrón de ARCA.
 *
 * Función pura: recibe el `personaReturn` ya parseado y devuelve la condición derivada. No consulta
 * nada, no toca la base y no depende del web service que haya traído los datos —
 * `ws_sr_padron_a5` y `ws_sr_constancia_inscripcion` devuelven la misma forma— así que se puede
 * cambiar de proveedor sin tocar esta regla, y se puede testear sin ARCA.
 *
 * DOS COSAS QUE PARECEN ERRORES Y NO LO SON. ARCA contesta `errorMonotributo` cuando la persona no
 * es monotributista, y `errorRegimenGeneral` cuando no tiene régimen general, con el texto «no
 * cumple con las condiciones para enviar datos». Son la RESPUESTA, no una falla: los dos juntos
 * describen a un empleado en relación de dependencia, que es el caso más común en un padrón de
 * talentos. Tratarlos como error dejaría media base marcada como consulta fallida.
 */
/** Sin acentos y en mayúsculas, para comparar descripciones que ARCA escribe de formas distintas. */
const normalizar = (texto) => String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
/** Lo que venga, como array: ARCA manda un objeto suelto cuando hay UNO y un array cuando hay varios. */
const comoArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const aNumero = (v) => {
    if (v === undefined || v === null || String(v).trim() === "")
        return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};
/**
 * ¿Este impuesto es IVA?
 *
 * Por id 30 —que es estable— y, si no vino, por la descripción normalizada. El fallback importa:
 * el id llega vacío en algunas respuestas, y sin él un responsable inscripto quedaría como
 * NO_ALCANZADO, que es exactamente al revés.
 *
 * El resto de los ids NO se hardcodea: la derivación se hace por presencia de bloque.
 */
const esIva = (imp) => imp.id === 30 || /\bIVA\b/.test(normalizar(imp.descripcion));
/** ARCA usa "AC" para activo. Cualquier otra cosa (EX, BA, NA…) no lo es. */
const estaActivo = (imp) => normalizar(imp.estado).startsWith("AC");
/** "EX" o una descripción que diga exento. */
const esExento = (imp) => normalizar(imp.estado).startsWith("EX") || /EXENTO/.test(normalizar(imp.descripcion));
const leerImpuestos = (bloque) => comoArray(bloque?.impuesto).map((i) => ({
    id: aNumero(i?.idImpuesto),
    descripcion: i?.descripcionImpuesto ? String(i.descripcionImpuesto) : undefined,
    estado: i?.estadoImpuesto ? String(i.estadoImpuesto) : undefined,
    periodo: i?.periodo !== undefined ? String(i.periodo) : undefined,
}));
const leerActividades = (bloque) => comoArray(bloque?.actividad).map((a) => ({
    id: aNumero(a?.idActividad),
    descripcion: a?.descripcionActividad ? String(a.descripcionActividad) : undefined,
    nomenclador: aNumero(a?.nomenclador),
    orden: aNumero(a?.orden),
}));
/**
 * La categoría de monotributo, en su letra.
 *
 * `descripcionCategoria` viene como texto largo, y la letra puede estar de varias formas
 * («Categoría B», «CAT. B», «B»). Se busca la última palabra de una sola letra; si no aparece,
 * se deja vacía en vez de inventar una — una categoría equivocada define mal cuánto factura alguien.
 */
const letraDeCategoria = (descripcion) => {
    const m = normalizar(descripcion).match(/\b([A-K])\b(?!.*\b[A-K]\b)/);
    return m ? m[1] : undefined;
};
/**
 * Deriva la condición fiscal desde `personaReturn`.
 *
 * El orden de las reglas es el que importa y no es alfabético: monotributo gana sobre régimen
 * general porque quien está en monotributo puede tener bloques de régimen general viejos, y lo que
 * define cómo factura hoy es el monotributo.
 */
export function derivarCondicionFiscal(personaReturn, opts = {}) {
    const consultadoEn = (opts.consultadoEn ?? new Date()).toISOString();
    const fuente = opts.fuente ?? "ws_sr_padron_a5";
    // `datosGenerales` no siempre existe: el A13 devuelve los campos sueltos en `persona`. Se aceptan
    // las dos formas para que esta función sirva con cualquiera de los tres servicios.
    const generales = personaReturn?.datosGenerales ?? personaReturn?.persona ?? personaReturn ?? {};
    const tipoClave = generales?.tipoClave ? String(generales.tipoClave) : undefined;
    const estadoClave = generales?.estadoClave ? String(generales.estadoClave) : undefined;
    const claveInactiva = estadoClave !== undefined && normalizar(estadoClave) !== "ACTIVO";
    const base = { claveInactiva, tipoClave, estadoClave, consultadoEn, fuente };
    const mono = personaReturn?.datosMonotributo;
    const general = personaReturn?.datosRegimenGeneral;
    // ── 1. Monotributo: alcanza con que el bloque exista ──
    if (mono) {
        const cat = mono.categoriaMonotributo ?? {};
        const act = mono.actividadMonotributista ?? {};
        const letra = letraDeCategoria(cat.descripcionCategoria);
        return {
            ...base,
            tipo: "MONOTRIBUTO",
            descripcion: letra ? `Monotributo — Categoría ${letra}` : "Monotributo",
            monotributo: {
                categoriaId: aNumero(cat.idCategoria),
                categoria: letra,
                descripcionCategoria: cat.descripcionCategoria ? String(cat.descripcionCategoria) : undefined,
                periodo: cat.periodo !== undefined ? String(cat.periodo) : undefined,
                actividadPrincipal: act.idActividad
                    ? { id: aNumero(act.idActividad), descripcion: act.descripcionActividad ? String(act.descripcionActividad) : undefined, nomenclador: aNumero(act.nomenclador), orden: aNumero(act.orden) }
                    : undefined,
            },
            regimenGeneral: null,
        };
    }
    // ── 2. Régimen general: el IVA decide cuál de los tres ──
    if (general) {
        const impuestos = leerImpuestos(general);
        const autonomo = comoArray(general.categoriaAutonomo)[0];
        const bloqueGeneral = {
            impuestos,
            actividades: leerActividades(general),
            categoriaAutonomo: autonomo ? { id: aNumero(autonomo.idCategoria), descripcion: autonomo.descripcionCategoria ? String(autonomo.descripcionCategoria) : undefined, periodo: autonomo.periodo !== undefined ? String(autonomo.periodo) : undefined } : null,
        };
        const iva = impuestos.filter(esIva);
        if (iva.some(estaActivo))
            return { ...base, tipo: "RESPONSABLE_INSCRIPTO", descripcion: "Responsable Inscripto", monotributo: null, regimenGeneral: bloqueGeneral };
        if (iva.some(esExento))
            return { ...base, tipo: "EXENTO", descripcion: "Exento de IVA", monotributo: null, regimenGeneral: bloqueGeneral };
        return { ...base, tipo: "NO_ALCANZADO", descripcion: "No alcanzado por IVA", monotributo: null, regimenGeneral: bloqueGeneral };
    }
    /*
      ── 3. Sin ninguno de los dos bloques ──
  
      Con los DOS errores, ARCA está diciendo que la persona no tiene actividad registrada: es el CUIL
      de alguien en relación de dependencia. Es una respuesta completa, no una consulta a medias, y por
      eso lleva su propio tipo en vez de caer en DESCONOCIDO.
    */
    if (personaReturn?.errorMonotributo && personaReturn?.errorRegimenGeneral) {
        return { ...base, tipo: "SIN_ACTIVIDAD", descripcion: "Sin actividad registrada en ARCA", monotributo: null, regimenGeneral: null };
    }
    // Cualquier otra forma: no se afirma nada. DESCONOCIDO es «no se pudo determinar», que es distinto
    // de «no tiene» — mezclarlos haría que un problema de la consulta se lea como un dato de la persona.
    return { ...base, tipo: "DESCONOCIDO", descripcion: "No se pudo determinar la condición fiscal", monotributo: null, regimenGeneral: null };
}
/** La condición que corresponde cuando la consulta fiscal no se pudo hacer. Ver §4.2: nunca un 500. */
export function condicionFiscalFallida(motivo, opts = {}) {
    return {
        tipo: "DESCONOCIDO",
        descripcion: "No se pudo consultar la condición fiscal",
        claveInactiva: false,
        monotributo: null,
        regimenGeneral: null,
        error: motivo,
        consultadoEn: (opts.consultadoEn ?? new Date()).toISOString(),
        fuente: opts.fuente ?? "ws_sr_padron_a5",
    };
}
