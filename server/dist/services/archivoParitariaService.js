import fs from "node:fs/promises";
import path from "node:path";
/**
 * EL ARCHIVO DE UNA PUBLICACIÓN: los bytes tal como se bajaron.
 *
 * POR QUÉ NO ALCANZA CON LA URL
 *
 * La `url` que guardamos apunta al sitio del gremio, y los gremios reorganizan sus webs. El día que
 * muevan o repongan ese PDF desaparece la única prueba de qué decía el acuerdo con el que se liquidó
 * — y acá el importe no es un dato interno: viaja al TXT de alta temprana como retribución pactada.
 * Tiene que poder respaldarse con el documento que lo originó, no con un enlace que quizás siga vivo.
 *
 * EL NOMBRE DEL ARCHIVO ES SU HASH, y eso no es un detalle de implementación:
 *
 *   · la identidad de una publicación ya es `(fuente, url, hash)`, así que el archivo y el registro
 *     comparten clave y no pueden desincronizarse;
 *   · dos publicaciones del mismo PDF ocupan un solo archivo;
 *   · si el gremio repone el PDF con otro contenido es otra publicación Y otro archivo, y el
 *     anterior sigue existiendo. Que es exactamente el caso que esto viene a atrapar.
 *
 * DÓNDE VIVE
 *
 * Bajo `storage/`, que es la convención del proyecto. Es la MISMA carpeta que sirve
 * `express.static("/storage")`, así que un archivo acá es legible sin token si alguien adivina la
 * ruta. Se acepta a sabiendas: son PDF que cualquiera baja del sitio del sindicato sin autenticarse,
 * no hay dato de nadie adentro. La descarga igual pasa por un endpoint con token, que es lo que
 * devuelve el nombre original y deja rastro.
 *
 * VOLUMEN: hoy 33 publicaciones de ~1 MB. Un gremio publica unas 6 por año; con 60 entidades
 * cargadas son ~360 PDF al año. No hay problema de escala que resolver todavía.
 */
/** Raíz de archivos del proyecto. `storage/` es lo que ya usan clientAssets, orders y projects. */
const RAIZ = path.join(process.cwd(), "storage");
const SUBCARPETA = "paritarias";
export const rutaAbsoluta = (ruta) => path.join(RAIZ, ruta);
/** Tope del nombre sugerido, extensión incluida. */
const MAX_NOMBRE = 120;
/**
 * Lo que rompe un nombre de archivo en Windows o en un encabezado `Content-Disposition`.
 *
 * La barra invertida se escribe con su código: puesta como literal, se la come cualquier paso de
 * escapado en el camino, y ya nos pasó en este mismo archivo.
 */
const PROHIBIDOS = ["<", ">", ":", String.fromCharCode(34), "/", String.fromCharCode(92), "|", "?", "*", "%"];
/**
 * El nombre con el que colgaba en la página.
 *
 * Se preserva porque es el que la persona reconoce —«acuerdo-salarial-2026.pdf»— y porque a veces es
 * el único lugar donde figura de qué acuerdo se trata.
 *
 * SOLO ES UNA ETIQUETA: el archivo en disco se llama por su hash, así que un nombre malicioso no
 * puede escribir en ningún lado. Se sanea igual porque viaja en un encabezado HTTP y termina como
 * nombre de archivo en la máquina de quien descarga.
 */
/**
 * Reemplaza lo que rompe un nombre de archivo, dejando el resto tal cual.
 *
 * Es UNA lista explícita de caracteres prohibidos, recorrida a mano, y no una clase de caracteres en
 * un regex: la versión anterior tenía un byte NUL adentro de la clase y no se podía revisar leyendo
 * el archivo. Un saneador que no se puede leer no se puede auditar.
 *
 * `espacio` decide qué pasa con los espacios: en el nombre sugerido de una descarga molestan (rompen
 * `Content-Disposition` sin comillas), pero en un nombre legible de Dropbox son justamente el punto.
 */
export const sanearNombre = (base, espacio = "_") => {
    let limpio = "";
    for (const ch of base) {
        const codigo = ch.codePointAt(0) ?? 0;
        if (codigo < 32)
            limpio += "_";
        else if (ch === " ")
            limpio += espacio;
        else
            limpio += PROHIBIDOS.includes(ch) ? "_" : ch;
    }
    // Sin puntos al principio: ningún nombre sugerido empieza con «..».
    return limpio.replace(/^[.]+/, "");
};
export const nombreDesdeUrl = (url) => {
    let base = "documento.pdf";
    try {
        base = decodeURIComponent(new URL(url).pathname.split("/").pop() || base);
    }
    catch {
        /* URL rara: se queda el default. No vale la pena fallar por el nombre. */
    }
    const sinPuntos = sanearNombre(base);
    // El tope cuenta la extensión. Cortar a 120 y después agregar «.pdf» devolvía 124, que es un tope
    // que no es el que dice ser.
    if (sinPuntos.toLowerCase().endsWith(".pdf"))
        return sinPuntos.slice(0, MAX_NOMBRE) || "documento.pdf";
    return `${sinPuntos.slice(0, MAX_NOMBRE - 4) || "documento"}.pdf`;
};
/**
 * Guarda los bytes y devuelve los metadatos. Si el archivo ya está, NO lo reescribe.
 *
 * No reescribir no es una optimización: el archivo es la evidencia de lo que se bajó, y volver a
 * escribirlo sobre sí mismo es la única forma de perderlo si la segunda descarga vino cortada.
 */
export const guardarPdf = async (fuenteId, hash, bytes, url, contentType) => {
    // El `hash` y el `fuenteId` se validan porque arman una ruta: los dos vienen de adentro, pero una
    // ruta construida con datos sin verificar es como se escribe fuera de la carpeta.
    if (!/^[0-9a-f]{64}$/.test(hash))
        throw new Error(`Hash inválido para el archivo: ${hash}`);
    if (!/^[0-9a-fA-F]{24}$/.test(String(fuenteId)))
        throw new Error(`Id de fuente inválido: ${fuenteId}`);
    const relativa = path.posix.join(SUBCARPETA, String(fuenteId), `${hash}.pdf`);
    const absoluta = rutaAbsoluta(relativa);
    await fs.mkdir(path.dirname(absoluta), { recursive: true });
    let tamano;
    try {
        tamano = (await fs.stat(absoluta)).size;
    }
    catch {
        await fs.writeFile(absoluta, bytes);
        tamano = bytes.length;
    }
    return {
        ruta: relativa,
        nombreOriginal: nombreDesdeUrl(url),
        contentType: contentType && contentType.includes("pdf") ? contentType : "application/pdf",
        bytes: tamano,
        descargadoEl: new Date(),
    };
};
/** `true` si el archivo sigue estando donde dice el registro. */
export const existeArchivo = async (ruta) => {
    if (!ruta)
        return false;
    try {
        await fs.access(rutaAbsoluta(ruta));
        return true;
    }
    catch {
        return false;
    }
};
/**
 * Borra el archivo de una publicación.
 *
 * NO se llama para una publicación que derivó en una escala aplicada: ese archivo es el respaldo del
 * importe que se declaró ante ARCA y no se borra nunca. Hoy todavía no existe la capa de aplicación,
 * así que la regla vive en quien llama; cuando exista, el guard va acá.
 */
export const borrarArchivo = async (ruta) => {
    if (!ruta)
        return false;
    try {
        await fs.unlink(rutaAbsoluta(ruta));
        return true;
    }
    catch {
        return false;
    }
};
