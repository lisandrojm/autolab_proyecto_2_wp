import { CategoriaSat } from "../models/CategoriaSat.js";
import { numeroALetras } from "./numeroALetras.js";
import { formatDateAr } from "./releaseFiller.js";
import { normalizarCuit } from "./constanciaPdf.js";
const num = (n) => (n != null && n !== "" && !isNaN(Number(n)) ? Number(n).toLocaleString("es-AR") : "");
/** "YYYY-MM-DD" → "YYYYMMDD" (token compacto, sin separadores). "" si no matchea ese formato. */
const fechaCompacta = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
    return m ? `${m[1]}${m[2]}${m[3]}` : "";
};
/**
 * Nomenclatura de archivos descargados (contratos y releases):
 *   [proyecto]_[Contrato|Release]_[nombreDoc]_[apellido]_[nombres]_[email]_[cuit]_Desde_[fechaAlta][_Hasta_[fechaBaja]]_[extra]
 *
 * - `proyecto`: número/ID externo del proyecto (ej. 426).
 * - `nombreDoc`: opcional; para releases es el nombre del release.
 * - `email`: el de la persona, para identificarla sin ambigüedad de un vistazo (dos personas pueden
 *   compartir apellido y nombre).
 * - `extra`: opcional; texto libre adicional (p. ej. "Constancia de Cuit" para identificar el trámite
 *   de origen en Firma Digital).
 * - `Desde`/`Hasta`: fecha de alta/baja del contrato, para que se entienda de un vistazo el período —
 *   se omite "Hasta" si el contrato no tiene fecha de baja. Los valores en sí son tokens compactos
 *   `YYYYMMDD` (sin separadores): `estadoDropboxCronService.ts` los usa como desempate cuando el CUIT
 *   solo no alcanza para identificar el contrato al ver volver este archivo desde Dropbox Sign (que
 *   preserva el nombre) — cambiar ese formato rompería ese matching, por eso NO se usan separadores
 *   dentro de la fecha aunque sí alrededor (mantiene el token de 8 dígitos aislado y detectable).
 * - `cuit`: token compacto (sin separadores), mismo motivo.
 * Devuelve el nombre SIN extensión (el caller agrega la extensión correspondiente).
 */
export function buildDocFileName(opts) {
    const { tipo, user, up, contract, docName, extra } = opts;
    const proyecto = up?.externalProjectId ?? contract?.proyecto_id ?? up?.nombre_proyecto ?? contract?.nombre_proyecto ?? "";
    const nombre = (user?.firstName || "").trim();
    const apellido = (user?.lastName || "").trim();
    const persona = [apellido, nombre].filter(Boolean).join("_");
    const email = (user?.email || "").trim();
    const cuit = normalizarCuit(user?.metadata?.cuit);
    const fechaAlta = fechaCompacta(contract?.fecha_alta_contrato);
    const fechaBaja = fechaCompacta(contract?.fecha_baja_contrato);
    const rango = fechaAlta ? `Desde_${fechaAlta}${fechaBaja ? `_Hasta_${fechaBaja}` : ""}` : "";
    const parts = [String(proyecto).trim(), tipo, (docName || "").trim(), persona, email, cuit, rango, (extra || "").trim()].filter((p) => p && String(p).trim() !== "");
    // Eliminar caracteres inválidos para nombres de archivo (se conservan espacios y acentos).
    return parts.join("_").replace(/[\\/:*?"<>|]/g, "_");
}
/**
 * Construye el mapa de variables para rellenar plantillas .docx (contratos y releases)
 * a partir del empleado, su UserProject en el proyecto y el contrato seleccionado.
 *
 * Provee múltiples alias (camelCase y nombres usados en las plantillas) para máxima cobertura.
 * Las variables que no estén acá quedan visibles como {variable} (ver nullGetter en releaseFiller).
 */
/**
 * Variables de la Empresa/Productora ("La Empleadora") para las plantillas.
 * Se toman del ABM de Empresas (colección companies), seteada por empresa en el proyecto
 * (contratoEmpresas / releaseEmpresas) y tagueada en cada contrato/release.
 * Van con prefijo `empresa*` para no chocar con los datos personales del empleado
 * (que ya usan cuit, localidad, codigoPostal).
 */
export function buildEmpresaDocData(empresa) {
    const e = empresa || {};
    const calle = e.domicilioCalle || "";
    const numero = e.domicilioNumero || "";
    const pisoDepto = e.domicilioPisoDepto || "";
    const domicilio = [[calle, numero].filter(Boolean).join(" "), pisoDepto].filter(Boolean).join(", ");
    return {
        // Razón social (varios alias porque las plantillas la nombran de distintas formas)
        empresa: e.razonSocial || "",
        razonSocial: e.razonSocial || "",
        empresaRazonSocial: e.razonSocial || "",
        empresaCuit: e.cuit || "",
        // Domicilio legal
        empresaDomicilio: domicilio,
        empresaDomicilioCalle: calle,
        empresaDomicilioNumero: numero,
        empresaDomicilioPisoDepto: pisoDepto,
        empresaLocalidad: e.localidad || "",
        empresaProvincia: e.provincia || "",
        empresaCodigoPostal: e.codigoPostal || "",
        // Firmante
        empresaFirmanteNombre: e.firmanteNombre || "",
        empresaFirmanteDni: e.firmanteDni || "",
        empresaFirmanteCargo: e.firmanteCargo || "",
        // Representante legal / apoderado
        empresaRepresentanteLegalNombre: e.representanteLegalNombre || "",
        empresaRepresentanteLegalEmail: e.representanteLegalEmail || "",
    };
}
export async function buildEmployeeDocData(user, up, contract, empresa) {
    const meta = user?.metadata || {};
    const c = contract || {};
    const nombre = user?.firstName || "";
    const apellido = user?.lastName || "";
    // Número de categoría SAT (lookup por el id externo guardado en el contrato)
    let catSatNumero = "";
    let catSatNombre = c.nombre_categoria_sat || "";
    if (c.categoria_sat_id != null) {
        try {
            const cat = await CategoriaSat.findOne({ "data.id": Number(c.categoria_sat_id) }).lean();
            if (cat) {
                catSatNumero = String(cat.data?.numeroCategoria ?? cat.data?.id ?? "");
                catSatNombre = catSatNombre || cat.name || cat.data?.nombre || "";
            }
        }
        catch {
            /* sin categoría → queda vacío */
        }
    }
    if (!catSatNumero && c.categoria_sat_id != null)
        catSatNumero = String(c.categoria_sat_id);
    const sueldoJornadaNum = Number(c.sueldo_jornada) || 0;
    const sueldoManoNum = Number(c.sueldo_mano) || 0;
    return {
        // ── Datos personales ──
        nombre,
        apellido,
        nombreCompleto: `${nombre} ${apellido}`.trim(),
        dni: meta.documento || "",
        documento: meta.documento || "",
        cuit: meta.cuit || "",
        email: user?.email || "",
        fechaDeNacimiento: formatDateAr(meta.fechaNac),
        fechaNacimiento: formatDateAr(meta.fechaNac),
        estadoCivil: meta.estadoCivil || "",
        telefono: meta.telefono || "",
        telefono2: meta.telefono2 || "",
        // ── Domicilio ──
        direccion: meta.calle || "",
        calle: meta.calle || "",
        altura: meta.altura || "",
        pisoDepto: meta.pisoDepto || "",
        localidad: meta.localidad || "",
        codigoPostal: meta.codigoPostal || "",
        // ── Datos bancarios ──
        cbu: meta.cbu || "",
        aliasBancario: meta.aliasBancario || "",
        nroDeCuentaBancaria: meta.nroDeCuentaBancaria || "",
        tipoDeCuentaBancaria: meta.tipoDeCuentaBancaria || "",
        // ── Datos del contrato ──
        nombreProyecto: c.nombre_proyecto || up?.nombre_proyecto || "",
        rolFrame: c.nombre_rol_frame || up?.nombre_rol_frame || "",
        nombreRolFrame: c.nombre_rol_frame || up?.nombre_rol_frame || "",
        nombreContrato: c.nombre_contrato || "",
        nombreSede: c.nombre_sede || "",
        sede: c.nombre_sede || "",
        nombreCargo: c.nombre_cargo || "",
        cargo: c.nombre_cargo || "",
        nombreNivel: c.nombre_nivel || "",
        nivel: c.nombre_nivel || "",
        nombreArea: c.nombre_area || "",
        area: c.nombre_area || "",
        nombreTurno: c.nombre_turno || "",
        turno: c.nombre_turno || "",
        fechaAltaContrato: formatDateAr(c.fecha_alta_contrato),
        fechaBajaContrato: formatDateAr(c.fecha_baja_contrato),
        horaInicio: c.hora_inicio || "",
        horaFin: c.hora_fin || "",
        cantidadJornadas: c.cantidad_jornadas_laborales != null ? String(c.cantidad_jornadas_laborales) : "",
        // ── Categoría SAT ──
        catSatNumero,
        categoriaSat: catSatNombre,
        nombreCategoriaSat: catSatNombre,
        // ── Sueldos ──
        SueldoJornada: num(sueldoJornadaNum),
        sueldoJornada: num(sueldoJornadaNum),
        SueldoJornadaLetras: numeroALetras(sueldoJornadaNum),
        sueldoJornadaLetras: numeroALetras(sueldoJornadaNum),
        sueldoMano: num(sueldoManoNum),
        SueldoMano: num(sueldoManoNum),
        sueldoManoLetras: c.sueldo_mano_texto || numeroALetras(sueldoManoNum),
        SueldoManoLetras: c.sueldo_mano_texto || numeroALetras(sueldoManoNum),
        sueldoNeto: num(c.sueldo_neto),
        sueldoBruto: num(c.sueldo_bruto),
        sueldoDiarioNeto: num(c.sueldo_diario_neto),
        // ── Otros ──
        fecha: formatDateAr(new Date()),
        // ── Empresa / Productora (La Empleadora) ──
        ...buildEmpresaDocData(empresa),
    };
}
