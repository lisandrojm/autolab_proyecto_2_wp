// Espejo backend del catálogo de campos de "datos personales"
// (frontend/src/config/personalDataFields.ts).
//
// Provee la allowlist de claves y arma el `$set` para mutar el User cuando se
// aprueba un pedido con categoryType === "datos_personales".

// Claves permitidas (deben coincidir con PERSONAL_DATA_FIELDS del frontend).
export const PERSONAL_DATA_FIELD_KEYS: string[] = [
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
export function sanitizePersonalData(
  proposed: Record<string, any> | undefined | null,
  enabledKeys: string[] | undefined | null,
): Record<string, any> {
  if (!proposed || typeof proposed !== "object") return {};
  const allowed = new Set(
    (enabledKeys && enabledKeys.length > 0 ? enabledKeys : PERSONAL_DATA_FIELD_KEYS).filter((k) =>
      PERSONAL_DATA_FIELD_KEYS.includes(k),
    ),
  );
  const out: Record<string, any> = {};
  for (const key of Object.keys(proposed)) {
    if (allowed.has(key)) out[key] = proposed[key];
  }
  return out;
}

/**
 * Construye el `$set` para User a partir de datos personales sanitizados.
 * Casos especiales:
 *  - nombre/apellido: además de metadata.*, actualizan firstName/lastName top-level y metadata.fullName / name.
 *  - rolesFrameIds: se guarda en metadata.roles_frame (array de refs).
 */
export function buildUserPersonalDataSet(
  sanitized: Record<string, any>,
  current: { firstName?: string; lastName?: string },
): Record<string, any> {
  const set: Record<string, any> = {};
  let nombre: string | undefined;
  let apellido: string | undefined;

  for (const [key, value] of Object.entries(sanitized)) {
    if (key === "nombre") {
      nombre = value;
      set["metadata.nombre"] = value;
      set["firstName"] = value;
    } else if (key === "apellido") {
      apellido = value;
      set["metadata.apellido"] = value;
      set["lastName"] = value;
    } else if (key === "rolesFrameIds") {
      set["metadata.roles_frame"] = Array.isArray(value) ? value : value ? [value] : [];
    } else {
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
