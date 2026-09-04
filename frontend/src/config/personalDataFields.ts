// Catálogo canónico de campos de "datos personales" que pueden habilitarse para
// modificación vía un tipo de pedido con categoryType === "datos_personales".
//
// Usado por:
//  - Admin (OrderCategoryForm): checklist de campos editables por tipo de pedido.
//  - Mobile (DynamicCategoryInput): renderiza sólo los campos habilitados.
//  - Backend (aprobación): allowlist de campos aplicados al User.
//
// La clave (`key`) coincide con el campo en `User.metadata` salvo casos especiales
// (nombre/apellido, que además actualizan firstName/lastName top-level en el backend).

export type PersonalDataSection = "general" | "domicilio" | "bancarios";

export type PersonalDataInputType = "text" | "date" | "boolean" | "catalog";

export interface PersonalDataField {
  key: string;
  label: string;
  section: PersonalDataSection;
  type: PersonalDataInputType;
  // Nombre del catálogo (para dropdowns) cuando type === "catalog".
  catalog?: string;
}

export const PERSONAL_DATA_SECTION_LABELS: Record<PersonalDataSection, string> = {
  general: "General",
  domicilio: "Domicilio",
  bancarios: "Datos bancarios",
};

export const PERSONAL_DATA_FIELDS: PersonalDataField[] = [
  // General
  { key: "nombre", label: "Nombre", section: "general", type: "text" },
  { key: "apellido", label: "Apellido", section: "general", type: "text" },
  { key: "cuit", label: "CUIL", section: "general", type: "text" },
  { key: "tipoDocumentoId", label: "Tipo de documento", section: "general", type: "catalog", catalog: "tiposDocumento" },
  { key: "documento", label: "Documento", section: "general", type: "text" },
  { key: "fechaNac", label: "Fecha de nacimiento", section: "general", type: "date" },
  { key: "generoId", label: "Género", section: "general", type: "catalog", catalog: "generos" },
  { key: "estadoCivil", label: "Estado civil", section: "general", type: "catalog", catalog: "estadosCiviles" },
  { key: "nivelEstudioId", label: "Nivel de estudio", section: "general", type: "catalog", catalog: "nivelesEstudio" },
  { key: "nacionalidadId", label: "Nacionalidad", section: "general", type: "catalog", catalog: "nacionalidades" },
  // Sin "osId": la obra social se declara en el CONTRATO y se constata contra el padrón de la SSS,
  // así que no es un dato que la persona pueda pedir que le cambien en su legajo.
  { key: "osPrepaga", label: "Prepaga", section: "general", type: "text" },
  { key: "rolesFrameIds", label: "Rol Empresa", section: "general", type: "catalog", catalog: "rolesFrame" },
  // Domicilio
  { key: "paisId", label: "País", section: "domicilio", type: "catalog", catalog: "paises" },
  { key: "localidad", label: "Localidad", section: "domicilio", type: "text" },
  { key: "calle", label: "Calle", section: "domicilio", type: "text" },
  { key: "altura", label: "Altura", section: "domicilio", type: "text" },
  { key: "pisoDepto", label: "Piso / Depto", section: "domicilio", type: "text" },
  { key: "codigoPostal", label: "Código postal", section: "domicilio", type: "text" },
  { key: "telefono", label: "Teléfono", section: "domicilio", type: "text" },
  // Bancarios
  { key: "bancoId", label: "Banco", section: "bancarios", type: "catalog", catalog: "bancos" },
  { key: "tipoDeCuentaBancaria", label: "Tipo de cuenta", section: "bancarios", type: "text" },
  { key: "cbu", label: "CBU", section: "bancarios", type: "text" },
  { key: "aliasBancario", label: "Alias", section: "bancarios", type: "text" },
  { key: "nroDeCuentaBancaria", label: "Nro. de cuenta", section: "bancarios", type: "text" },
];

export const PERSONAL_DATA_FIELD_KEYS: string[] = PERSONAL_DATA_FIELDS.map((f) => f.key);

// Claves de datos bancarios (section === "bancarios").
export const BANKING_FIELD_KEYS: string[] = PERSONAL_DATA_FIELDS.filter((f) => f.section === "bancarios").map((f) => f.key);

/** True si la propuesta de un pedido incluye alguna modificación de datos bancarios. */
export function isBankingProposal(proposed: Record<string, any> | undefined | null): boolean {
  if (!proposed || typeof proposed !== "object") return false;
  return BANKING_FIELD_KEYS.some((k) => Object.prototype.hasOwnProperty.call(proposed, k));
}

export function getPersonalDataField(key: string): PersonalDataField | undefined {
  return PERSONAL_DATA_FIELDS.find((f) => f.key === key);
}

// Mapa catálogo (config) -> tipo de Info (backend infoAPI).
export const CATALOG_TO_INFO_TYPE: Record<string, string> = {
  generos: "genero",
  tiposDocumento: "tipo-documento",
  paises: "pais",
  nacionalidades: "nacionalidad",
  nivelesEstudio: "nivel-estudio",
  bancos: "banco",
  obrasSociales: "obra-social",
};

// Estado civil no tiene catálogo Info: opciones fijas (igual que el registro/admin).
export const ESTADO_CIVIL_OPTIONS = ["Soltero", "Casado", "Divorciado", "Viudo", "Concubino"];
