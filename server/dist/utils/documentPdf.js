import htmlPdf from "html-pdf-node";
import path from "path";
import fs from "fs";
import { MARCA_FIRMA } from "./employeeDocData.js";
/**
 * Generación del PDF de un documento (Release / Contrato) a partir del contenido redactado en la plataforma.
 *
 * El contenido se guarda como HTML (editor con formato) y usa variables de llave doble
 * `{{variable}}`, igual que las plantillas PDF.
 * Por compatibilidad también se acepta la llave simple `{variable}`, que es la sintaxis de los
 * .docx de Word que se venían subiendo (así se puede pegar ese texto sin reescribir las variables).
 * Las variables desconocidas quedan visibles para detectar las que faltan mapear; las conocidas
 * pero vacías (campos opcionales) se reemplazan por vacío.
 */
/** Escapa texto plano para insertarlo dentro del HTML sin romperlo. */
function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/**
 * ¿El HTML del editor tiene texto real? El editor devuelve "<p></p>" cuando está vacío, que como
 * string es truthy → hay que mirar el texto sin etiquetas. Sirve para no generar/descargar PDFs vacíos.
 */
export function htmlHasText(html) {
    return !!html && html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
}
/** La clase que pinta los valores que salieron de una variable. Solo se usa en las previsualizaciones. */
export const CLASE_VARIABLE_SIMULADA = "wp-var-sim";
/**
 * Reemplaza `{{variable}}` (y también `{variable}`) por su valor dentro del HTML.
 * Reemplaza todas las claves presentes en `data` (aunque estén vacías); el resto queda intacto.
 *
 * `resaltar` envuelve cada valor reemplazado para poder pintarlo. Es SOLO para las previsualizaciones
 * con datos de ejemplo: sirve para ver de un vistazo qué parte del texto sale de una variable y qué
 * está escrito a mano, que es justo lo que un contrato ya armado no deja distinguir. En los
 * documentos reales va apagado — un contrato que se firma no puede salir con medias frases en color.
 */
export function replaceDocVariables(html, data, opciones) {
    let result = html || "";
    for (const [key, rawValue] of Object.entries(data || {})) {
        // Una variable conocida pero SIN valor (ej. una persona sin piso/depto) se reemplaza por vacío.
        // Solo quedan visibles las que no existen en `data`, que son las que hay que corregir.
        const value = rawValue == null ? "" : String(rawValue);
        // Escapamos la clave por si tuviera caracteres especiales de regex.
        const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const escaped = escapeHtml(value);
        /*
          El envoltorio se arma con el valor YA escapado, y el nombre de la variable va en un `title`
          —también escapado— para poder saber cuál era sin ensuciar el texto. Un valor vacío igual se
          envuelve: así una variable que resolvió a nada se distingue de una que nadie escribió.
        */
        const reemplazo = opciones?.resaltar ? `<span class="${CLASE_VARIABLE_SIMULADA}" title="{{${escapeHtml(key)}}}">${escaped}</span>` : escaped;
        // Primero la llave doble (sintaxis oficial) y después la simple (compatibilidad con los Word).
        result = result.replace(new RegExp(`\\{\\{${safeKey}\\}\\}`, "g"), reemplazo);
        result = result.replace(new RegExp(`\\{${safeKey}\\}`, "g"), reemplazo);
    }
    return result;
}
/**
 * `html-pdf-node` compila el HTML con Handlebars, así que cualquier `{{...}}` que haya quedado
 * sin reemplazar rompe la generación del PDF. Se convierten a entidades para que Handlebars no las
 * interprete y sigan viéndose literales en el documento (útil para detectar variables mal escritas).
 */
function neutralizeHandlebars(html) {
    return html.replace(/\{\{/g, "&#123;&#123;").replace(/\}\}/g, "&#125;&#125;");
}
/** Lee una imagen del storage (path o URL con /storage/) y la devuelve como data URI base64. */
/**
 * El mime real de una imagen a partir de su extensión.
 *
 * NO ALCANZA CON `image/${ext}`, que es lo que había: para un SVG daba `image/svg` —el mime es
 * `image/svg+xml`— y Chromium no renderiza un data URI con el tipo equivocado. El logo se subía sin
 * error, se veía en la pantalla (que usa el archivo, no el data URI) y desaparecía en el PDF, que es
 * el único lugar donde el membrete importa.
 */
const MIME_POR_EXTENSION = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    ico: "image/x-icon",
    avif: "image/avif",
    tif: "image/tiff",
    tiff: "image/tiff",
};
const mimeDeImagen = (ext) => MIME_POR_EXTENSION[ext] || `image/${ext}`;
function imagePathToDataUri(url) {
    if (!url)
        return null;
    try {
        let absolutePath = url;
        if (url.includes("/storage/")) {
            absolutePath = path.join(process.cwd(), url.substring(url.indexOf("/storage/")));
        }
        else if (url.startsWith("/")) {
            absolutePath = path.join(process.cwd(), url);
        }
        if (fs.existsSync(absolutePath)) {
            const bitmap = fs.readFileSync(absolutePath);
            const base64 = bitmap.toString("base64");
            const ext = path.extname(absolutePath).substring(1).toLowerCase();
            return `data:${mimeDeImagen(ext)};base64,${base64}`;
        }
    }
    catch (e) {
        console.error("Error loading image for membrete:", e);
    }
    return null;
}
/** Encabezado del membrete: logo (o razón social) a la izquierda + datos de la empresa a la derecha. */
function buildMembreteHeader(m) {
    const logoUri = imagePathToDataUri(m.logoUrl);
    const logo = logoUri ? `<img src="${logoUri}" style="max-height: 70px; max-width: 220px; object-fit: contain;" />` : `<div style="font-size: 18pt; font-weight: bold; color: #222;">${escapeHtml(m.razonSocial || "")}</div>`;
    return `<div class="membrete-header">
    <div class="membrete-logo">${logo}</div>
    <div class="membrete-empresa">
      ${m.razonSocial ? `<strong>${escapeHtml(m.razonSocial)}</strong><br/>` : ""}
      ${m.cuit ? `CUIT: ${escapeHtml(m.cuit)}<br/>` : ""}
      ${m.domicilio ? `${escapeHtml(m.domicilio)}` : ""}
    </div>
  </div>`;
}
/** Pie de firma de la empresa: imagen de firma (o línea) + aclaración + cargo. */
function buildFirmaFooter(m) {
    const firmaUri = imagePathToDataUri(m.signatureUrl);
    const firma = firmaUri ? `<img src="${firmaUri}" style="max-height: 90px; object-fit: contain;" />` : `<div style="border-top: 1px solid #000; display: inline-block; padding-top: 4px; min-width: 200px;">Firma</div>`;
    return `<div class="membrete-firma">
    ${firma}
    <div class="membrete-firma-info">
      ${m.firmanteNombre ? `<strong>${escapeHtml(m.firmanteNombre)}</strong><br/>` : ""}
      ${m.firmanteCargo ? `${escapeHtml(m.firmanteCargo)}` : ""}
    </div>
  </div>`;
}
/** Mapea una Company (empresa elegida) al membrete del documento. */
export function empresaToMembrete(empresa) {
    const e = empresa || {};
    const domicilio = [[e.domicilioCalle, e.domicilioNumero].filter(Boolean).join(" "), e.domicilioPisoDepto, e.localidad, e.provincia].filter(Boolean).join(", ");
    return {
        logoUrl: e.logoUrl,
        signatureUrl: e.signatureUrl,
        razonSocial: e.razonSocial,
        cuit: e.cuit,
        domicilio,
        firmanteNombre: e.firmanteNombre,
        firmanteCargo: e.firmanteCargo,
    };
}
/** Estilos extra para el membrete/firma (se inyectan solo cuando el documento lleva membrete). */
const MEMBRETE_STYLES = `
  .membrete-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #eee; padding-bottom: 12pt; margin-bottom: 16pt; }
  .membrete-empresa { text-align: right; font-size: 9pt; color: #555; line-height: 1.4; }
  .membrete-firma { margin-top: 40pt; text-align: center; page-break-inside: avoid; }
  .membrete-firma-info { margin-top: 4pt; font-size: 9pt; color: #555; }
`;
/** Envuelve el HTML del editor en un documento completo con estilos base para el PDF. */
function wrapHtml(bodyHtml, membrete, resaltarVariables) {
    const header = membrete ? buildMembreteHeader(membrete) : "";
    const footer = membrete ? buildFirmaFooter(membrete) : "";
    const extraStyles = membrete ? MEMBRETE_STYLES : "";
    return `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
    body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #222; margin: 0; }
    p { margin: 0 0 10pt 0; }
    /* break-after: avoid mantiene el título pegado al contenido que sigue (evita que quede solo
       al final de una página, ej. el título del contrato solo en la página 1). */
    h1 { font-size: 14pt; margin: 0 0 10pt 0; break-inside: avoid; break-after: avoid; }
    h2 { font-size: 13pt; margin: 0 0 10pt 0; break-inside: avoid; break-after: avoid; }
    ul, ol { margin: 0 0 10pt 0; padding-left: 24pt; }
    /* En tablas largas (contratos de varias páginas) NO se puede evitar el corte: forzar
       break-inside: auto en tabla/filas/celdas para que fluyan y corten de forma natural entre
       páginas. Con "avoid" el motor empuja la tabla entera a la página siguiente y deja huecos. */
    table { border-collapse: collapse; width: 100%; margin: 0 0 10pt 0; break-inside: auto; }
    tr, td, th { break-inside: auto; }
    td, th { border: 1px solid #999; padding: 5pt; vertical-align: top; }
    hr { border: none; border-top: 1px solid #ccc; margin: 10pt 0; }
    ${extraStyles}
    ${resaltarVariables
        ? /*
            NARANJA ROJIZO, y no un fondo ni un subrayado: el PDF de preview se lee como un contrato,
            así que la marca tiene que distinguirse sin romper el párrafo. El color aguanta la
            impresión en escala de grises como un gris más oscuro, que sigue leyéndose.
          */
            `.${CLASE_VARIABLE_SIMULADA} { color: #c2410c; font-weight: 600; }`
        : ""}
  </style></head><body>${header}${bodyHtml || ""}${footer}</body></html>`;
}
/**
 * Construye el PDF final: reemplaza las variables en el contenido y lo renderiza.
 * Devuelve el Buffer listo para enviar en la respuesta.
 */
export async function buildDocPdf(content, data, membrete, opciones) {
    const html = wrapHtml(neutralizeHandlebars(replaceDocVariables(content, data, { resaltar: opciones?.resaltarVariables })), membrete, opciones?.resaltarVariables);
    const options = {
        format: "A4",
        margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
        printBackground: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    };
    return (await htmlPdf.generatePdf({ content: html }, options));
}
/**
 * Valores de ejemplo para la previsualización del documento desde el editor
 * (equivalente a getDummyVariables de las plantillas PDF).
 */
export function getDummyDocVariables() {
    return {
        // Persona
        nombre: "Juan",
        apellido: "Pérez",
        nombreCompleto: "Juan Pérez",
        // Sin esto, "Previsualizar" dejaba {{firma}} sin reemplazar y parecía una variable rota.
        firma: MARCA_FIRMA,
        dni: "30.123.456",
        documento: "30.123.456",
        cuit: "20-30123456-3",
        email: "juan.perez@ejemplo.com",
        fechaDeNacimiento: "15/04/1990",
        fechaNacimiento: "15/04/1990",
        estadoCivil: "Soltero/a",
        telefono: "11 5555-5555",
        direccion: "Av. Siempre Viva",
        calle: "Av. Siempre Viva",
        altura: "742",
        pisoDepto: "4B",
        localidad: "CABA",
        codigoPostal: "1425",
        // Contrato / proyecto
        nombreProyecto: "426_LN+",
        nombreCliente: "REELSHORT",
        rolFrame: "Musicalizador",
        nombreRolFrame: "Musicalizador",
        nombreContrato: "Jornada 2030 SRL",
        nombreSede: "La corte",
        sede: "La corte",
        nombreCargo: "Musicalizador",
        cargo: "Musicalizador",
        nombreArea: "TECNICA",
        area: "TECNICA",
        nombreTurno: "Mañana",
        turno: "Mañana",
        fechaAltaContrato: "16/03/2026",
        fechaBajaContrato: "16/03/2026",
        cantidadJornadas: "30",
        // Empresa (se resuelve desde la empresa seteada en el proyecto)
        empresa: "2030 S.R.L.",
        razonSocial: "2030 S.R.L.",
        empresaRazonSocial: "2030 S.R.L.",
        empresaCuit: "30-71234567-9",
        empresaDomicilio: "Av. Corrientes 1234, Piso 5",
        empresaLocalidad: "CABA",
        empresaProvincia: "Buenos Aires",
        empresaCodigoPostal: "1043",
        empresaFirmanteNombre: "María González",
        empresaFirmanteDni: "27.987.654",
        empresaFirmanteCargo: "Apoderada",
        empresaFirmanteEmail: "maria.gonzalez@ejemplo.com",
        empresaRepresentanteLegalNombre: "María González",
        empresaRepresentanteLegalEmail: "legales@2030.com",
        // Otros
        fecha: new Date().toLocaleDateString("es-AR"),
    };
}
