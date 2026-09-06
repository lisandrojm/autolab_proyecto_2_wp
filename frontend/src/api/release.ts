import { GRUPO_FIRMA, GrupoVariables } from "./variableFirma";
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
export const releaseVariables: GrupoVariables[] = [
  /*
    PRIMERA, no última.

    Estaba al final con el argumento de que es lo último que se pega y lo último que va en el
    documento. Pero el orden de esta lista no es el orden del documento: es el orden en que se
    BUSCA, y el modal abre mostrando el principio. Al final quedaba debajo de nueve grupos y de un
    scroll — la única variable cuya ausencia rompe el circuito, escondida detrás de las de relleno.

    Destacada y con su explicación a la vista del que edita: eso antes era un comentario del código,
    o sea invisible justo para quien tiene que usarla. Ver GRUPO_FIRMA.
  */
  GRUPO_FIRMA,
  {
    grupo: "Datos de la persona",
    vars: ["{{nombre}}", "{{apellido}}", "{{nombreCompleto}}", "{{dni}}", "{{cuit}}", "{{email}}", "{{fechaDeNacimiento}}", "{{estadoCivil}}", "{{telefono}}"],
  },
  {
    grupo: "Domicilio de la persona",
    vars: ["{{direccion}}", "{{calle}}", "{{altura}}", "{{pisoDepto}}", "{{localidad}}", "{{codigoPostal}}"],
  },
  {
    /* Ver `advertencia`: la confusión entre cliente y proyecto ya tituló contratos con el nombre de la película. */
    nota: "«{{nombreProyecto}}» es la OBRA («Surrender»); «{{nombreCliente}}» es para quién se hace («REELSHORT»).",
    advertencia: "Para el título del documento va el CLIENTE. Usar {{nombreProyecto}} ahí titula el contrato con el nombre de la película.",
    grupo: "Contrato y proyecto",
    vars: ["{{nombreProyecto}}", "{{nombreCliente}}", "{{rolFrame}}", "{{nombreContrato}}", "{{nombreSede}}", "{{nombreCargo}}", "{{nombreArea}}", "{{nombreTurno}}", "{{fechaAltaContrato}}", "{{fechaBajaContrato}}", "{{cantidadJornadas}}"],
  },
  {
    grupo: "Empresa (se toma del proyecto)",
    vars: ["{{razonSocial}}", "{{empresaCuit}}", "{{empresaDomicilio}}", "{{empresaLocalidad}}", "{{empresaProvincia}}", "{{empresaCodigoPostal}}"],
  },
  {
    grupo: "Firmante de la empresa",
    vars: ["{{empresaFirmanteNombre}}", "{{empresaFirmanteDni}}", "{{empresaFirmanteCargo}}", "{{empresaFirmanteEmail}}"],
  },
  {
    /*
      OTRA PERSONA, NO UN ALIAS DEL FIRMANTE.

      El firmante es quien suscribe el contrato —su nombre y su DNI van en el bloque de partes—; el
      representante legal es quien figura ante los organismos. En 2030 S.R.L. son distintos: firma
      Norma Olivo y el representante es Hernán Pellegrini. Usar uno por el otro imprime el mail de
      una persona al lado del DNI de otra.

      El server ya resolvía estas dos y el panel no las listaba, así que existían sin que nadie
      pudiera enterarse desde el editor.
    */
    grupo: "Representante legal de la empresa",
    vars: ["{{empresaRepresentanteLegalNombre}}", "{{empresaRepresentanteLegalEmail}}"],
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
