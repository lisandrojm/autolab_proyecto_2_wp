/**
 * ═══════════════════════════════════════════════════════════════════════
 * CÓDIGO COMPARTIDO SERVER ↔ FRONTEND (`server/src/compartido/`)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Solo código puro: nada de Node, Mongoose ni del DOM, y sin imports (ver `jornadas.ts`).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * EL CATÁLOGO DE ARCA Y LAS CATEGORÍAS DE WEPRODU: CÓMO SE COMPARAN
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Una categoría de WeProdu tiene NOMBRE propio, grupo y escala, y un CÓDIGO de ARCA que es lo que viaja
 * al alta. El código no se puede tipear: tiene que ser una fila vigente del espejo de ARCA para ese
 * convenio, y la descripción que ARCA le da a ese código tiene que corresponder al nombre.
 *
 * Esto existe porque pasó lo contrario: 41 categorías del 0634/11 quedaron con el código de otra
 * categoría de su mismo grupo (códigos consecutivos asignados a nombres en orden alfabético), y 1.400
 * contratos declararon ante ARCA una categoría que no era la suya. El CSV y ARCA estaban bien; nada
 * comparaba la base contra ellos.
 *
 * Las reglas viven ACÁ, una sola vez: las usan el script de corrección, la validación del ABM, el
 * estado que muestra la pantalla, el chequeo del alta y la sincronización contra ARCA.
 */
/** Las columnas del CSV, en orden. El export las escribe así. */
export const COLUMNAS_CSV_ARCA = ["tabla", "alcance", "codigo", "codigo_padded", "largo_campo_txt", "descripcion", "filtro_padre"];
/**
 * Parser de CSV con comillas (las descripciones traen comas y alguna comilla doblada). Tolera BOM y
 * CRLF. Devuelve filas crudas; `filasCsvArca` las tipa.
 */
export function parsearCsv(texto) {
    const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
    const filas = [];
    let campo = "";
    let fila = [];
    let enComillas = false;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (enComillas) {
            if (c === '"') {
                if (t[i + 1] === '"') {
                    campo += '"';
                    i++;
                }
                else
                    enComillas = false;
            }
            else
                campo += c;
        }
        else if (c === '"')
            enComillas = true;
        else if (c === ",") {
            fila.push(campo);
            campo = "";
        }
        else if (c === "\n") {
            fila.push(campo);
            filas.push(fila);
            fila = [];
            campo = "";
        }
        else if (c !== "\r")
            campo += c;
    }
    if (campo !== "" || fila.length > 0) {
        fila.push(campo);
        filas.push(fila);
    }
    return filas;
}
export function filasCsvArca(texto) {
    const [cab, ...datos] = parsearCsv(texto);
    const i = (n) => {
        const k = (cab || []).map((h) => h.trim()).indexOf(n);
        if (k < 0)
            throw new Error(`Al CSV le falta la columna «${n}»`);
        return k;
    };
    const [iT, iA, iC, iP, iL, iD, iF] = COLUMNAS_CSV_ARCA.map(i);
    return datos
        .filter((f) => f.length > 1)
        .map((f) => ({ tabla: f[iT], alcance: f[iA], codigo: f[iC], codigoPadded: f[iP], largo: Number(f[iL]) || 0, descripcion: f[iD], filtroPadre: f[iF] || "" }));
}
// ───────────────────────────────────────────────────────────────── nombres
/**
 * Compara por significado: sin acentos, mayúsculas, sin el «- GRUPO N» de ARCA, sin puntuación y sin
 * diferencias de espaciado. Es la ÚNICA normalización: antes había una por script y no coincidían.
 */
export const normalizarNombre = (s) => String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s*-\s*GRUPO\s*\d+\s*$/, "")
    .replace(/[^A-Z0-9Ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/**
 * Equivalencias declaradas a mano, nombre local normalizado → nombre de ARCA normalizado.
 *
 * Van EXPLÍCITAS y no como una comparación más laxa (prefijo, distancia de edición): aflojar el
 * criterio emparejaría también «Asistente de Cámara» con «Asistente de Cámara Especializado / Grip»,
 * y lo que se decide con esto es el código que viaja a ARCA. Cada línea es auditable.
 */
export const ALIAS_NOMBRES = {
    // Typo local: le falta la «r». Su código correcto es 035291.
    "TECNICO DE MANTENIMIENTO ELECTONICO": "TECNICO DE MANTENIMIENTO ELECTRONICO",
    // Aclaración agregada localmente; ARCA dice solo «CADETE».
    "CADETE MAYOR DE 18 ANOS": "CADETE",
    // Rename deliberado: «SIN CATEGORIAS» no se entiende, «Excluido de convenio» sí.
    "EXCLUIDO DE CONVENIO": "SIN CATEGORIAS",
};
/** El nombre local como se compara contra ARCA: normalizado y con el alias aplicado. */
export const nombreComparable = (nombreLocal) => {
    const n = normalizarNombre(nombreLocal);
    return ALIAS_NOMBRES[n] || n;
};
/**
 * La descripción de ARCA partida en nombre y grupo. Dos formas:
 *   sufijo   0634/11  «DIRECTOR DE PROGRAMAS - GRUPO 1»          → grupo 1
 *   prefijo  0131/75  «1ª CATEGORIA - ASISTENTE DE DIRECCION»     → grupo 1, llamado «1ª CATEGORIA»
 * El ordinal se acepta por code point (ª º °) para que un re-guardado con otro encoding no lo rompa.
 */
export function partirDescripcion(descripcion) {
    const d = String(descripcion || "").trim();
    const sufijo = /^(.*?)\s*-\s*GRUPO\s*(\d+)\s*$/i.exec(d);
    if (sufijo)
        return { nombre: sufijo[1].trim(), grupo: Number(sufijo[2]), nombreGrupo: "" };
    const prefijo = /^((\d+)\s*[ªº°]?\s*CATEGORIA)\s*-\s*(.+)$/i.exec(d);
    if (prefijo)
        return { nombre: prefijo[3].trim(), grupo: Number(prefijo[2]), nombreGrupo: prefijo[1].trim() };
    return { nombre: d, grupo: null, nombreGrupo: "" };
}
export const grupoDeDescripcion = (descripcion) => partirDescripcion(descripcion).grupo;
export const TEXTO_ESTADO_CATEGORIA = {
    ok: "Coincide con ARCA",
    nombre_distinto: "El nombre no coincide con lo que ARCA dice de ese código",
    grupo_distinto: "ARCA ubica ese código en otro grupo",
    no_existe_en_arca: "ARCA no tiene ese código para este convenio",
    no_vigente: "ARCA dejó de publicar ese código",
};
/**
 * El estado de una categoría contra el espejo de ARCA.
 *
 * `confirmacion` es la de una persona que ya revisó un `nombre_distinto` y lo aceptó: vale solo si
 * confirmó la MISMA descripción que hoy publica ARCA. Si ARCA la cambia, la confirmación cae sola.
 */
export function estadoCategoria(o) {
    const f = o.fila;
    if (!f)
        return { estado: "no_existe_en_arca", confirmada: false, descripcionArca: "", grupoArca: null };
    const { grupo: grupoArca } = partirDescripcion(f.descripcion);
    const base = { descripcionArca: f.descripcion, grupoArca };
    if (!f.vigente)
        return { estado: "no_vigente", confirmada: false, ...base };
    if (grupoArca != null && o.grupoNumero != null && grupoArca !== o.grupoNumero)
        return { estado: "grupo_distinto", confirmada: false, ...base };
    if (nombreComparable(o.nombre) !== normalizarNombre(partirDescripcion(f.descripcion).nombre)) {
        const confirmada = !!o.confirmacion && normalizarNombre(o.confirmacion.descripcionArca || "") === normalizarNombre(f.descripcion);
        return { estado: "nombre_distinto", confirmada, ...base };
    }
    return { estado: "ok", confirmada: false, ...base };
}
/** ¿Se puede declarar ante ARCA con este estado? `ok`, o `nombre_distinto` que alguien confirmó. */
export const estadoPermiteAlta = (e) => e.estado === "ok" || (e.estado === "nombre_distinto" && e.confirmada);
/**
 * EMPAREJA cada categoría de un convenio con la fila de ARCA que corresponde a su NOMBRE.
 *
 * La regla: el nombre manda, el código se corrige. Exige que el grupo de ARCA coincida con el de la
 * categoría (el grupo es correcto: de él sale la escala). Lo que no empareja de forma única NO se
 * adivina: va a `sinMatch` / `ambiguas` / `grupoDistinto`, y con eso el script se detiene.
 *
 * `colisiones` = dos categorías terminarían con el mismo código. Con eso tampoco se aplica nada.
 */
export function emparejarCategorias(categorias, oficiales) {
    const porNombre = new Map();
    for (const o of oficiales) {
        const k = normalizarNombre(partirDescripcion(o.descripcion).nombre);
        porNombre.set(k, [...(porNombre.get(k) || []), o]);
    }
    const cambios = [];
    const correctas = [];
    const sinMatch = [];
    const ambiguas = [];
    const grupoDistinto = [];
    for (const c of categorias) {
        // Un código repetido en el catálogo (el CSV trae una línea duplicada) es UN candidato, no dos.
        const unicos = [...new Map((porNombre.get(nombreComparable(c.nombre)) || []).map((o) => [o.codigo, o])).values()];
        // El mismo nombre en varios grupos (0131/75: «1ª CATEGORIA - UTILERO», «2ª CATEGORIA - UTILERO»…):
        // desempata el grupo de la categoría, que es correcto. Si aun así queda más de uno, es ambiguo.
        const delGrupo = unicos.length > 1 && c.grupoNumero != null ? unicos.filter((o) => partirDescripcion(o.descripcion).grupo === c.grupoNumero) : unicos;
        const candidatos = delGrupo.length > 0 ? delGrupo : unicos;
        if (candidatos.length === 0) {
            sinMatch.push(c);
            continue;
        }
        if (candidatos.length > 1) {
            // Varias filas de ARCA con ese nombre y sin grupo que desempate (0131/75: la «Nª CATEGORIA» es
            // la categoría de la emisora, no un grupo de escala). Si el código ACTUAL es una de ellas, la
            // categoría es consistente —su código dice lo mismo que su nombre— y no se toca. Si no, no se
            // puede saber cuál le corresponde: ambigua, no se adivina.
            const actual = candidatos.find((x) => x.codigo === c.codigoArca);
            if (actual)
                correctas.push({ id: c.id, codigo: actual.codigo, descripcionArca: actual.descripcion });
            else
                ambiguas.push({ ...c, candidatos: candidatos.map((x) => x.codigo) });
            continue;
        }
        const o = candidatos[0];
        const grupoArca = partirDescripcion(o.descripcion).grupo;
        if (grupoArca != null && c.grupoNumero != null && grupoArca !== c.grupoNumero) {
            grupoDistinto.push({ ...c, codigoArcaCorrecto: o.codigo, grupoArca });
            continue;
        }
        if (o.codigo === c.codigoArca)
            correctas.push({ id: c.id, codigo: o.codigo, descripcionArca: o.descripcion });
        else
            cambios.push({ id: c.id, nombre: c.nombre, convenio: c.convenio, grupo: c.grupoNumero, de: c.codigoArca, a: o.codigo, descripcionArca: o.descripcion, contratos: c.contratos });
    }
    // Código final de cada categoría: el nuevo si cambia, el actual si no. Dos con el mismo = colisión.
    const final = new Map();
    const quedan = (c) => cambios.find((x) => x.id === c.id)?.a ?? c.codigoArca;
    for (const c of categorias) {
        const k = quedan(c);
        if (!k)
            continue;
        final.set(k, [...(final.get(k) || []), c.nombre]);
    }
    const colisiones = [...final.entries()].filter(([, ns]) => ns.length > 1).map(([codigo, nombres]) => ({ codigo, nombres }));
    return { cambios, correctas, sinMatch, ambiguas, grupoDistinto, colisiones };
}
export const claveCatalogo = (f) => `${f.tabla}|${f.filtroPadre || ""}|${f.codigo}`;
/** Espacios colapsados y recortados: ARCA y el CSV difieren en espaciado sin cambiar el texto. */
export const textoComparable = (s) => String(s || "").replace(/\s+/g, " ").trim();
/**
 * Lo que cambió entre el espejo (solo las filas VIGENTES de las tablas leídas) y una lectura de ARCA.
 *
 * `tablasLeidas`: solo se comparan esas. Una tabla que no se pudo leer NO significa que ARCA dejó de
 * publicar todo: sin esto, una lectura incompleta daría de baja el catálogo entero.
 * `filtrosLeidos` (opcional, por tabla): para las tablas que dependen de la empleadora, los padres que
 * esa empleadora ve (sus convenios). Una categoría de un convenio que esta empleadora no tiene no
 * «dejó de publicarse»: simplemente no se ve desde acá.
 */
export function calcularDiff(espejoVigente, leido, tablasLeidas, filtrosLeidos = {}) {
    const alcanza = (f) => tablasLeidas.includes(f.tabla) && (!filtrosLeidos[f.tabla] || filtrosLeidos[f.tabla].includes(f.filtroPadre || ""));
    const antes = new Map(espejoVigente.filter(alcanza).map((f) => [claveCatalogo(f), f]));
    const ahora = new Map(leido.filter(alcanza).map((f) => [claveCatalogo(f), f]));
    const diff = { nuevos: [], dejaronDePublicarse: [], descripcionCambiada: [] };
    for (const [k, f] of ahora) {
        const previo = antes.get(k);
        if (!previo)
            diff.nuevos.push(f);
        else if (textoComparable(previo.descripcion) !== textoComparable(f.descripcion))
            diff.descripcionCambiada.push({ ...f, descripcionAnterior: previo.descripcion });
    }
    for (const [k, f] of antes)
        if (!ahora.has(k))
            diff.dejaronDePublicarse.push(f);
    return diff;
}
/**
 * Hash estable de una tabla (FNV-1a sobre las filas ordenadas, espacios normalizados). Sirve para
 * saber si una lectura cambió algo sin comparar fila por fila, y para registrar qué se leyó.
 */
export function hashTabla(filas) {
    const lineas = filas.map((f) => `${f.filtroPadre || ""}|${f.codigo}|${textoComparable(f.descripcion)}`).sort();
    let h = 0x811c9dc5;
    for (const ch of lineas.join("\n")) {
        h ^= ch.codePointAt(0);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}
// ───────────────────────────────────────────────────────────────── export del CSV
/**
 * Regenera el CSV del repo con su formato exacto: BOM, encabezado sin comillas, campos entre comillas
 * salvo el largo, CRLF entre filas y sin salto final. Las filas van en el orden que traen.
 *
 * Así actualizar el CSV desde el espejo es un commit revisable (un diff de líneas), no una edición a mano.
 */
export function exportarCsvArca(filas) {
    const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lineas = [COLUMNAS_CSV_ARCA.join(","), ...filas.map((f) => [q(f.tabla), q(f.alcance), q(f.codigo), q(f.codigoPadded), String(f.largo), q(f.descripcion), q(f.filtroPadre)].join(","))];
    return "﻿" + lineas.join("\r\n");
}
