import { createHash } from "node:crypto";
import { FuenteParitaria } from "../models/FuenteParitaria.js";
import { PublicacionParitaria } from "../models/PublicacionParitaria.js";
import { guardarPdf } from "./archivoParitariaService.js";
/**
 * Vigilancia de paritarias: detectar que salió un PDF nuevo.
 *
 * SOLO DETECTA. No abre los PDF, no lee importes y no toca ninguna escala ni categoría. Baja la
 * página de la entidad, mira qué enlaces hay, y registra los que no había visto antes.
 *
 * QUIÉNES SON DEL OTRO LADO
 *
 * Sitios públicos de entidades gremiales de los que dependemos, no una API. Por eso el `User-Agent`
 * dice quién los está visitando y deja un mail de contacto: si molestamos, que puedan avisar en vez
 * de bloquear. Y por eso se revisa UNA VEZ POR DÍA — las paritarias se publican sin aviso previo,
 * así que no hay nada que ganar consultando más seguido, y sí algo que perder.
 */
/** Quién los está visitando. Ser anónimo con un sitio del que dependemos no tiene ninguna ventaja. */
const USER_AGENT = "WeProdu/1.0 (vigilancia de paritarias; contacto: lisandrojm@gmail.com)";
/** Ninguna página de listado tarda esto. Pasado el plazo es `error_red`, no una espera más larga. */
const TIMEOUT_MS = 20000;
/**
 * Caída de enlaces que se considera sospechosa aunque no sea a cero.
 *
 * De diez a uno es tan malo como de diez a cero: significa que el patrón dejó de matchear o que la
 * página se reorganizó. Un 30% es holgado —una entidad puede archivar acuerdos viejos— pero atrapa
 * el derrumbe.
 */
const CAIDA_SOSPECHOSA = 0.3;
/** Texto de un enlace, sin etiquetas ni entidades HTML: es contra esto que corren los patrones. */
const limpiarTexto = (html) => html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
/**
 * Todos los `<a href>` a un PDF, con su texto.
 *
 * Se parsea con una expresión y no con un DOM completo a propósito: la entrada es HTML de terceros
 * que puede estar mal formado —y el del SATSAID lo está—, y un parser estricto fallaría entero donde
 * esto extrae lo que hay. Lo que se busca es una lista de enlaces, no la estructura del documento.
 *
 * Se DEDUPLICA por URL. La página del SATSAID tiene tres secciones (223/75, 131/75, 634/11) que
 * cuelgan literalmente los mismos archivos, así que sin esto el mismo acuerdo entraría dos veces.
 */
export function extraerEnlacesPdf(html, urlBase) {
    const encontrados = new Map();
    for (const m of html.matchAll(/<a[^>]+href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        let url;
        try {
            // Los href relativos son la norma; resolverlos contra la página es lo que los vuelve
            // descargables y, sobre todo, comparables entre revisiones.
            url = new URL(m[1], urlBase).toString();
        }
        catch {
            continue;
        }
        if (!encontrados.has(url))
            encontrados.set(url, { url, texto: limpiarTexto(m[2]) });
    }
    return [...encontrados.values()];
}
/** Compila un patrón del ABM. Uno inválido no puede tirar la revisión: se trata como «no filtra». */
const compilar = (patron, porDefecto) => {
    const p = String(patron || "").trim();
    if (!p)
        return porDefecto;
    try {
        return new RegExp(p, "i");
    }
    catch {
        return porDefecto;
    }
};
/**
 * Los enlaces que son una escala, según los patrones de la fuente.
 *
 * Se prueba contra el texto Y el nombre del archivo juntos porque el dato útil está en uno o en el
 * otro según la página: en Actores el texto dice «Cuadro escala salarial» y el archivo también; en el
 * SATSAID el texto dice «Descargar» y lo único que distingue es el nombre.
 */
export function filtrarEnlaces(enlaces, fuente) {
    const incluir = compilar(fuente.patronIncluir, null);
    const excluir = compilar(fuente.patronExcluir, null);
    return enlaces.filter((e) => {
        const contra = `${e.texto} ${decodeURIComponent(e.url.split("/").pop() || "")}`;
        if (incluir && !incluir.test(contra))
            return false;
        if (excluir && excluir.test(contra))
            return false;
        return true;
    });
}
/**
 * Revisa UNA fuente. Nunca lanza: devuelve el resultado y lo deja registrado en la fuente.
 *
 * Que no lance es la razón por la que una fuente caída no frena a las otras. La rutina diaria las
 * recorre en serie y cada una se cuida sola.
 */
export async function revisarFuente(fuenteId) {
    const fuente = await FuenteParitaria.findById(fuenteId);
    if (!fuente)
        throw new Error(`No existe la fuente ${fuenteId}`);
    /*
      Una fuente `manual` no se raspa, y forzarla por acá sería peor que no poder revisarla.
  
      El buscador oficial del Ministerio es un formulario: bajarlo devolvería una página sin ningún
      `<a href>` a un PDF, o sea `sin_enlaces` — que en este sistema significa «la fuente se quedó
      ciega» y pinta el banner de rojo. Estaría gritando por un error que no existe, todos los días,
      hasta que nadie mire más el banner. Se frena acá y se dice por qué.
    */
    if (fuente.tipo === "manual") {
        throw new Error(`«${fuente.nombre}» es una fuente de consulta manual: se registra dónde mirar, pero no se raspa. No hay nada que revisar automáticamente.`);
    }
    const base = { fuenteId: String(fuente._id), nombre: fuente.nombre, resultado: "ok", enlaces: 0, nuevas: 0, lineaBase: !fuente.ultimaRevision };
    const cerrar = async (r) => {
        fuente.ultimaRevision = new Date();
        fuente.ultimoResultado = r.resultado;
        fuente.ultimoError = r.error || "";
        // El contador de referencia SOLO se actualiza cuando la revisión encontró algo: si se guardara
        // también el cero, la próxima comparación sería contra cero y la ceguera dejaría de detectarse.
        if (r.resultado === "ok" && r.enlaces > 0)
            fuente.enlacesUltimaExitosa = r.enlaces;
        await fuente.save();
        return r;
    };
    // ── 1. Bajar la página ──────────────────────────────────────────────────────
    let html;
    try {
        const res = await fetch(fuente.url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok)
            return cerrar({ ...base, resultado: "error_red", error: `La página respondió ${res.status}.` });
        html = await res.text();
    }
    catch (e) {
        const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
        return cerrar({ ...base, resultado: "error_red", error: timeout ? `No respondió en ${TIMEOUT_MS / 1000} segundos.` : `No se pudo alcanzar la página: ${e?.message || e}` });
    }
    // ── 2. Extraer y filtrar ────────────────────────────────────────────────────
    let candidatos;
    try {
        candidatos = filtrarEnlaces(extraerEnlacesPdf(html, fuente.url), fuente);
    }
    catch (e) {
        return cerrar({ ...base, resultado: "error_parseo", error: `No se pudo leer el HTML: ${e?.message || e}` });
    }
    /*
      CERO ENLACES NO ES «NO HAY NOVEDADES»: ES UN ERROR.
  
      Una fuente que venía devolviendo treinta y de golpe devuelve ninguno no se quedó sin acuerdos:
      cambió de estructura, o el patrón dejó de servir. El HTTP dio 200 y todo parece bien, y ese es
      exactamente el modo de falla peligroso — el mismo que esta semana hizo que una consulta sobre una
      colección mal escrita devolviera cero y se leyera como «no urge».
    */
    if (candidatos.length === 0) {
        return cerrar({ ...base, resultado: "sin_enlaces", enlaces: 0, error: "La página respondió bien pero no quedó ningún enlace. O cambió de estructura, o el patrón dejó de matchear." });
    }
    /* Y la caída sin llegar a cero, que es la misma ceguera a medias. */
    const antes = fuente.enlacesUltimaExitosa;
    const aviso = antes && antes > 0 && candidatos.length < antes * CAIDA_SOSPECHOSA ? `Pasó de ${antes} enlaces a ${candidatos.length}. Puede que la página haya cambiado.` : undefined;
    // ── 3. Registrar lo que no estaba ───────────────────────────────────────────
    const conocidas = new Set((await PublicacionParitaria.find({ fuente: fuente._id }).select("url hash").lean()).map((p) => `${p.url}|${p.hash}`));
    /*
      LA PRIMERA REVISIÓN ES LÍNEA DE BASE, NO NOVEDAD.
  
      `ultimaRevision` en null significa que esta fuente nunca se revisó. Todo lo que encuentre ahora
      ya estaba publicado antes de que la vigiláramos, así que se registra como VISTO. Sin esto, dar de
      alta el SATSAID reportaría treinta acuerdos viejos como novedad y el primer aviso sería puro
      ruido.
  
      Es una condición sobre un campo que ya existe, y no un modo especial ni un botón aparte: sirve
      igual para las tres fuentes de hoy que para la que agreguen el mes que viene, sin tocar código.
    */
    const esLineaBase = base.lineaBase;
    let nuevas = 0;
    for (const enlace of candidatos) {
        let hash;
        let bytes;
        let contentType = null;
        try {
            const res = await fetch(enlace.url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
            if (!res.ok)
                continue;
            bytes = Buffer.from(await res.arrayBuffer());
            contentType = res.headers.get("content-type");
            hash = createHash("sha256").update(bytes).digest("hex");
        }
        catch {
            // Un PDF que no baja no invalida la revisión: se lo saltea y se lo va a reintentar mañana.
            // Registrarlo sin hash sería registrar algo de lo que no sabemos si cambió.
            continue;
        }
        if (conocidas.has(`${enlace.url}|${hash}`))
            continue;
        /*
          EL ARCHIVO SE GUARDA, NO SE DESCARTA.
    
          Ya estaba bajado —hace falta entero para hashearlo— así que guardarlo no cuesta una request
          más. Lo que cambia es que deja de existir una publicación cuya única prueba es un enlace al
          sitio del gremio, que es lo que se pierde el día que reorganicen la web.
    
          Si el guardado falla, la publicación se registra IGUAL con el motivo anotado: perder el aviso
          de que salió un acuerdo porque no se pudo escribir un archivo sería cambiar un problema chico
          por uno grande.
        */
        let archivo;
        let archivoError = "";
        try {
            archivo = await guardarPdf(String(fuente._id), hash, bytes, enlace.url, contentType);
        }
        catch (e) {
            archivoError = `No se pudo guardar el PDF: ${e?.message || e}`;
            console.error(`[PARITARIAS] ${archivoError} (${enlace.url})`);
        }
        try {
            await PublicacionParitaria.create({
                fuente: fuente._id,
                url: enlace.url,
                textoEnlace: enlace.texto,
                hash,
                vista: esLineaBase,
                detectadaEl: new Date(),
                archivo,
                archivoError,
                /*
                  Nace en «pendiente», no sin el campo.
        
                  Es la diferencia entre «todavía no se espejó» y «nadie lo intentó nunca»: sin el estado
                  escrito, una publicación sin copia en Dropbox se ve igual que una de antes de que el espejo
                  existiera. `npm run paritarias-dropbox` levanta exactamente lo que esté en pendiente.
                */
                dropbox: { path: "", estado: "pendiente", motivo: "Todavía no se espejó." },
            });
            nuevas++;
        }
        catch (e) {
            // Choque contra el índice único: otra corrida la creó en el medio. No es un error.
            if (e?.code !== 11000)
                throw e;
        }
    }
    return cerrar({ ...base, resultado: "ok", enlaces: candidatos.length, nuevas: esLineaBase ? 0 : nuevas, lineaBase: esLineaBase, aviso });
}
/**
 * Revisa todas las fuentes activas, en serie.
 *
 * En serie y no en paralelo por cortesía: son tres sitios chicos de entidades gremiales y no hay
 * ningún apuro que justifique golpearlos a la vez. Que una falle no frena a las siguientes — eso lo
 * garantiza `revisarFuente`, que nunca lanza.
 */
export async function revisarTodas() {
    // Las `manual` quedan afuera de la rutina: no son fuentes apagadas, son fuentes que no se raspan.
    // Meterlas acá las reportaría como `sin_enlaces` todos los días.
    const fuentes = await FuenteParitaria.find({ activa: true, tipo: { $ne: "manual" } })
        .select("_id")
        .lean();
    const out = [];
    for (const f of fuentes) {
        try {
            out.push(await revisarFuente(String(f._id)));
        }
        catch (e) {
            console.error(`[PARITARIAS] Falló la revisión de ${f._id}:`, e?.message || e);
        }
    }
    return out;
}
/** Una fuente está CIEGA cuando su última revisión no encontró nada o falló: puede haber salido algo. */
export const fuenteConProblema = (f) => !!f.ultimoResultado && f.ultimoResultado !== "ok";
