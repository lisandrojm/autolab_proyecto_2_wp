import htmlPdf from "html-pdf-node";
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
 * Reemplaza `{{variable}}` (y también `{variable}`) por su valor dentro del HTML.
 * Reemplaza todas las claves presentes en `data` (aunque estén vacías); el resto queda intacto.
 */
export function replaceDocVariables(html, data) {
    let result = html || "";
    for (const [key, rawValue] of Object.entries(data || {})) {
        // Una variable conocida pero SIN valor (ej. una persona sin piso/depto) se reemplaza por vacío.
        // Solo quedan visibles las que no existen en `data`, que son las que hay que corregir.
        const value = rawValue == null ? "" : String(rawValue);
        // Escapamos la clave por si tuviera caracteres especiales de regex.
        const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const escaped = escapeHtml(value);
        // Primero la llave doble (sintaxis oficial) y después la simple (compatibilidad con los Word).
        result = result.replace(new RegExp(`\\{\\{${safeKey}\\}\\}`, "g"), escaped);
        result = result.replace(new RegExp(`\\{${safeKey}\\}`, "g"), escaped);
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
/** Envuelve el HTML del editor en un documento completo con estilos base para el PDF. */
function wrapHtml(bodyHtml) {
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
  </style></head><body>${bodyHtml || ""}</body></html>`;
}
/**
 * Construye el PDF final: reemplaza las variables en el contenido y lo renderiza.
 * Devuelve el Buffer listo para enviar en la respuesta.
 */
export async function buildDocPdf(content, data) {
    const html = wrapHtml(neutralizeHandlebars(replaceDocVariables(content, data)));
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
        empresaRepresentanteLegalNombre: "María González",
        empresaRepresentanteLegalEmail: "legales@2030.com",
        // Otros
        fecha: new Date().toLocaleDateString("es-AR"),
    };
}
