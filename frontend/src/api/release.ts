import axios from "./axiosConfig";

export interface Release {
  _id: string;
  tenantId: string;
  name: string;
  version: string;
  description?: string;
  /** Contenido redactado en la plataforma (HTML) con variables `{{variable}}` */
  content?: string;
  /** Tipo de release (ver `api/releaseTipos.ts`). Puede venir populado como objeto `{_id, name, isActive, requiereFirma}`. */
  releaseTipoId?: string | { _id: string; name: string; isActive?: boolean; requiereFirma?: boolean };
  isActive: boolean;
  usaMembrete?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseInput {
  name: string;
  version: string;
  description?: string;
  content?: string;
  releaseTipoId?: string;
  isActive?: boolean;
  usaMembrete?: boolean;
}

/**
 * Variables disponibles para redactar el contenido del release.
 * Se reemplazan al descargar con los datos de la persona/contrato y de la empresa
 * seteada en el proyecto (Empresa del Release).
 */
export const releaseVariables: { grupo: string; vars: string[] }[] = [
  {
    grupo: "Datos de la persona",
    vars: ["{{nombre}}", "{{apellido}}", "{{nombreCompleto}}", "{{dni}}", "{{cuit}}", "{{email}}", "{{fechaDeNacimiento}}", "{{estadoCivil}}", "{{telefono}}"],
  },
  {
    grupo: "Domicilio de la persona",
    vars: ["{{direccion}}", "{{calle}}", "{{altura}}", "{{pisoDepto}}", "{{localidad}}", "{{codigoPostal}}"],
  },
  {
    grupo: "Contrato y proyecto",
    vars: ["{{nombreProyecto}}", "{{rolFrame}}", "{{nombreContrato}}", "{{nombreSede}}", "{{nombreCargo}}", "{{nombreArea}}", "{{nombreTurno}}", "{{fechaAltaContrato}}", "{{fechaBajaContrato}}", "{{cantidadJornadas}}"],
  },
  {
    grupo: "Empresa (se toma del proyecto)",
    vars: ["{{razonSocial}}", "{{empresaCuit}}", "{{empresaDomicilio}}", "{{empresaLocalidad}}", "{{empresaProvincia}}", "{{empresaCodigoPostal}}"],
  },
  {
    grupo: "Firmante de la empresa",
    vars: ["{{empresaFirmanteNombre}}", "{{empresaFirmanteDni}}", "{{empresaFirmanteCargo}}"],
  },
  { grupo: "Otros", vars: ["{{fecha}}"] },
];

/** Lista plana de todas las variables (para los chips del editor). */
export const releaseVariablesFlat: string[] = releaseVariables.flatMap((g) => g.vars);

const downloadBlob = (data: BlobPart, fileName: string) => {
  const url = window.URL.createObjectURL(new Blob([data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

/**
 * Nombre de archivo que manda el backend, que es el ÚNICO que decide cómo se llama un documento
 * (`buildDocFileName` en server/src/utils/employeeDocData.ts).
 *
 * Se prioriza `filename*=UTF-8''…` (RFC 5987) sobre `filename="…"`: los nombres llevan acentos y la
 * versión ASCII es solo un respaldo degradado.
 */
const fileNameFromDisposition = (disposition: string, fallback: string): string => {
  const d = disposition || "";
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(d);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      /* si viene mal codificado se cae al filename simple */
    }
  }
  const simple = /filename="?([^";]+)"?/.exec(d);
  return simple?.[1]?.trim() || fallback;
};

export const releasesAPI = {
  getAll: async (): Promise<Release[]> => {
    const response = await axios.get("/releases");
    return response.data;
  },

  getById: async (id: string): Promise<Release> => {
    const response = await axios.get(`/releases/${id}`);
    return response.data;
  },

  create: async (data: ReleaseInput): Promise<Release> => {
    const response = await axios.post("/releases", data);
    return response.data;
  },

  update: async (id: string, data: ReleaseInput): Promise<Release> => {
    const response = await axios.put(`/releases/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`/releases/${id}`);
  },

  /** Genera un PDF de ejemplo con el contenido del editor (sin guardar). */
  preview: async (content: string, usaMembrete?: boolean): Promise<Blob> => {
    const response = await axios.post("/releases/preview", { content, usaMembrete }, { responseType: "blob" });
    return response.data as Blob;
  },

  /** Descarga el PDF del release con valores de ejemplo. */
  download: async (release: Release): Promise<void> => {
    const response = await axios.get(`/releases/${release._id}/download`, { responseType: "blob" });
    downloadBlob(response.data, fileNameFromDisposition(response.headers?.["content-disposition"], `${release.name}.pdf`));
  },

  /** Descarga el PDF con las variables reemplazadas por los datos del empleado/contrato. */
  downloadFilled: async (release: Release, ctx: { userId: string; projectId: string; contractIndex: number; empresaId?: string }): Promise<void> => {
    const response = await axios.get(`/releases/${release._id}/download-filled`, { params: ctx, responseType: "blob" });
    // Sin override: el nombre lo decide el backend (ver contratosFrame.downloadFilled).
    downloadBlob(response.data, fileNameFromDisposition(response.headers?.["content-disposition"], `${release.name}.pdf`));
  },
};
