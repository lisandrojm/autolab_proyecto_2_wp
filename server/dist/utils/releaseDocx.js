import HTMLtoDOCX from "html-to-docx";
/**
 * Generación del .docx de un Release a partir del contenido redactado en la plataforma.
 *
 * El contenido se guarda como HTML (editor con formato) y usa variables de llave doble
 * `{{variable}}`, igual que las plantillas PDF.
 * Por compatibilidad también se acepta la llave simple `{variable}`, que es la sintaxis de los
 * .docx de Word que se venían subiendo (así se puede pegar ese texto sin reescribir las variables).
 * Las variables sin valor quedan visibles para detectar las que faltan mapear
 * (mismo criterio que el nullGetter de `releaseFiller.ts`).
 */
/** Escapa texto plano para insertarlo dentro del HTML sin romperlo. */
function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/**
 * Reemplaza `{{variable}}` (y también `{variable}`) por su valor dentro del HTML.
 * Solo reemplaza las claves presentes en `data` con valor no vacío; el resto queda intacto.
 */
export function replaceReleaseVariables(html, data) {
    let result = html || "";
    for (const [key, rawValue] of Object.entries(data || {})) {
        const value = rawValue == null ? "" : String(rawValue);
        if (value === "")
            continue; // sin valor → se deja la variable visible
        // Escapamos la clave por si tuviera caracteres especiales de regex.
        const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const escaped = escapeHtml(value);
        // Primero la llave doble (sintaxis oficial) y después la simple (compatibilidad con los Word).
        result = result.replace(new RegExp(`\\{\\{${safeKey}\\}\\}`, "g"), escaped);
        result = result.replace(new RegExp(`\\{${safeKey}\\}`, "g"), escaped);
    }
    return result;
}
/** Envuelve el HTML del editor en un documento completo con estilos base para el .docx. */
function wrapHtml(bodyHtml) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>
    body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.4; }
    p { margin: 0 0 8pt 0; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #000; padding: 4pt; vertical-align: top; }
  </style></head><body>${bodyHtml || ""}</body></html>`;
}
/**
 * Construye el .docx final: reemplaza las variables en el contenido y lo convierte a Word.
 * Devuelve el Buffer listo para enviar en la respuesta.
 */
export async function buildReleaseDocx(content, data) {
    const html = wrapHtml(replaceReleaseVariables(content, data));
    const result = await HTMLtoDOCX(html, null, {
        table: { row: { cantSplit: true } },
        footer: false,
        pageNumber: false,
        margins: { top: 1134, right: 1134, bottom: 1134, left: 1134 }, // ~2cm en twips
    });
    return Buffer.isBuffer(result) ? result : Buffer.from(result);
}
/**
 * Valores de ejemplo para la previsualización del release desde el editor
 * (equivalente a getDummyVariables de las plantillas PDF).
 */
export function getReleaseDummyVariables() {
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
