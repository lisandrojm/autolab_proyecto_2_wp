// Espejo backend del catálogo de campos de "datos personales"
// (frontend/src/config/personalDataFields.ts).
//
// Provee la allowlist de claves y arma el `$set` para mutar el User cuando se
// aprueba un pedido con categoryType === "datos_personales".
import { Info } from "../models/Info.js";
import { RoleFrame } from "../models/RoleFrame.js";
// Metadata de presentación (labels + tipo de catálogo Info).
export const PERSONAL_DATA_FIELD_META = [
    { key: "nombre", label: "Nombre", section: "General", type: "text" },
    { key: "apellido", label: "Apellido", section: "General", type: "text" },
    { key: "cuit", label: "CUIL", section: "General", type: "text" },
    { key: "tipoDocumentoId", label: "Tipo de documento", section: "General", type: "catalog", catalogType: "tipo-documento" },
    { key: "documento", label: "Documento", section: "General", type: "text" },
    { key: "fechaNac", label: "Fecha de nacimiento", section: "General", type: "date" },
    { key: "generoId", label: "Género", section: "General", type: "catalog", catalogType: "genero" },
    { key: "estadoCivil", label: "Estado civil", section: "General", type: "text" },
    { key: "nivelEstudioId", label: "Nivel de estudio", section: "General", type: "catalog", catalogType: "nivel-estudio" },
    { key: "nacionalidadId", label: "Nacionalidad", section: "General", type: "catalog", catalogType: "nacionalidad" },
    { key: "osId", label: "Obra social", section: "General", type: "catalog", catalogType: "obra-social" },
    { key: "osPrepaga", label: "Prepaga", section: "General", type: "text" },
    { key: "rolesFrameIds", label: "Rol Frame", section: "General", type: "catalog", catalogType: "__roleFrame" },
    { key: "paisId", label: "País", section: "Domicilio", type: "catalog", catalogType: "pais" },
    { key: "localidad", label: "Localidad", section: "Domicilio", type: "text" },
    { key: "calle", label: "Calle", section: "Domicilio", type: "text" },
    { key: "altura", label: "Altura", section: "Domicilio", type: "text" },
    { key: "pisoDepto", label: "Piso / Depto", section: "Domicilio", type: "text" },
    { key: "codigoPostal", label: "Código postal", section: "Domicilio", type: "text" },
    { key: "telefono", label: "Teléfono", section: "Domicilio", type: "text" },
    { key: "telefono2", label: "Teléfono de emergencia", section: "Domicilio", type: "text" },
    { key: "visa", label: "Visa", section: "Domicilio", type: "boolean" },
    { key: "bancoId", label: "Banco", section: "Datos bancarios", type: "catalog", catalogType: "banco" },
    { key: "tipoDeCuentaBancaria", label: "Tipo de cuenta", section: "Datos bancarios", type: "text" },
    { key: "cbu", label: "CBU", section: "Datos bancarios", type: "text" },
    { key: "aliasBancario", label: "Alias", section: "Datos bancarios", type: "text" },
    { key: "nroDeCuentaBancaria", label: "Nro. de cuenta", section: "Datos bancarios", type: "text" },
];
function escapeHtml(str) {
    return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/**
 * Arma el HTML de la lista de datos modificados (solo los campos presentes en
 * `proposed`), resolviendo los valores de catálogo a su nombre legible.
 * Devuelve una lista <ul> lista para inyectar en la plantilla PDF.
 */
export async function buildDatosModificadosHtml(proposed, tenantId) {
    if (!proposed || typeof proposed !== "object")
        return "-";
    const keys = Object.keys(proposed).filter((k) => PERSONAL_DATA_FIELD_META.some((m) => m.key === k));
    if (keys.length === 0)
        return "-";
    const metas = PERSONAL_DATA_FIELD_META.filter((m) => keys.includes(m.key));
    // Cargar catálogos Info necesarios (una consulta por tipo).
    const catalogTypes = Array.from(new Set(metas.filter((m) => m.type === "catalog" && m.catalogType && m.catalogType !== "__roleFrame").map((m) => m.catalogType)));
    const infoMaps = {};
    await Promise.all(catalogTypes.map(async (type) => {
        const filter = { type };
        if (tenantId)
            filter.tenantId = tenantId;
        const items = await Info.find(filter).lean();
        const map = new Map();
        for (const it of items)
            map.set(String(it.data?.id), it.data?.nombre || it.name);
        infoMaps[type] = map;
    }));
    // Roles frame (si aplica).
    let roleFrameMap = null;
    if (metas.some((m) => m.key === "rolesFrameIds")) {
        const rfs = await RoleFrame.find({}).select("name").lean();
        roleFrameMap = new Map();
        for (const rf of rfs)
            roleFrameMap.set(String(rf._id), rf.name);
    }
    const displayValue = (meta) => {
        const raw = proposed[meta.key];
        if (meta.type === "boolean")
            return raw ? "Sí" : "No";
        if (meta.type === "date")
            return raw ? String(raw).split("T")[0] : "-";
        if (meta.key === "rolesFrameIds") {
            const ids = Array.isArray(raw) ? raw : raw ? [raw] : [];
            if (ids.length === 0)
                return "-";
            return ids.map((id) => roleFrameMap?.get(String(id)) || id).join(", ");
        }
        if (meta.type === "catalog" && meta.catalogType && infoMaps[meta.catalogType]) {
            return infoMaps[meta.catalogType].get(String(raw)) || String(raw);
        }
        if (raw === "" || raw === null || raw === undefined)
            return "-";
        return String(raw);
    };
    const items = metas.map((m) => `<li><strong>${escapeHtml(m.label)}:</strong> ${escapeHtml(displayValue(m))}</li>`).join("");
    return `<ul style="margin:0;padding-left:18px;">${items}</ul>`;
}
// Claves permitidas (deben coincidir con PERSONAL_DATA_FIELDS del frontend).
export const PERSONAL_DATA_FIELD_KEYS = [
    // General
    "nombre",
    "apellido",
    "cuit",
    "tipoDocumentoId",
    "documento",
    "fechaNac",
    "generoId",
    "estadoCivil",
    "nivelEstudioId",
    "nacionalidadId",
    "osId",
    "osPrepaga",
    "rolesFrameIds",
    // Domicilio
    "paisId",
    "localidad",
    "calle",
    "altura",
    "pisoDepto",
    "codigoPostal",
    "telefono",
    "telefono2",
    "visa",
    // Bancarios
    "bancoId",
    "tipoDeCuentaBancaria",
    "cbu",
    "aliasBancario",
    "nroDeCuentaBancaria",
];
/**
 * Filtra un objeto de datos propuestos dejando sólo las claves permitidas y
 * habilitadas (según la config del tipo de pedido).
 */
export function sanitizePersonalData(proposed, enabledKeys) {
    if (!proposed || typeof proposed !== "object")
        return {};
    const allowed = new Set((enabledKeys && enabledKeys.length > 0 ? enabledKeys : PERSONAL_DATA_FIELD_KEYS).filter((k) => PERSONAL_DATA_FIELD_KEYS.includes(k)));
    const out = {};
    for (const key of Object.keys(proposed)) {
        if (allowed.has(key))
            out[key] = proposed[key];
    }
    return out;
}
/**
 * Construye el `$set` para User a partir de datos personales sanitizados.
 * Casos especiales:
 *  - nombre/apellido: además de metadata.*, actualizan firstName/lastName top-level y metadata.fullName / name.
 *  - rolesFrameIds: se guarda en metadata.roles_frame (array de refs).
 */
export function buildUserPersonalDataSet(sanitized, current) {
    const set = {};
    let nombre;
    let apellido;
    for (const [key, value] of Object.entries(sanitized)) {
        if (key === "nombre") {
            nombre = value;
            set["metadata.nombre"] = value;
            set["firstName"] = value;
        }
        else if (key === "apellido") {
            apellido = value;
            set["metadata.apellido"] = value;
            set["lastName"] = value;
        }
        else if (key === "rolesFrameIds") {
            set["metadata.roles_frame"] = Array.isArray(value) ? value : value ? [value] : [];
        }
        else {
            set[`metadata.${key}`] = value;
        }
    }
    // Recomputar fullName / name si cambió nombre o apellido.
    if (nombre !== undefined || apellido !== undefined) {
        const finalNombre = nombre !== undefined ? nombre : current.firstName || "";
        const finalApellido = apellido !== undefined ? apellido : current.lastName || "";
        const fullName = `${finalNombre} ${finalApellido}`.trim();
        if (fullName) {
            set["metadata.fullName"] = fullName;
            set["name"] = fullName;
        }
    }
    return set;
}
