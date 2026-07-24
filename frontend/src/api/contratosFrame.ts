import axios from "./axiosConfig";

export interface ContratoFrameItem {
  _id: string;
  externalId: string;
  name: string;
  /** Contenido redactado en la plataforma (HTML) con variables `{{variable}}` */
  content?: string;
  data: {
    id?: number;
    nombre: string;
    cantidadJornadas: number;
    multiplicadorDiario: number;
    esTiempoIndeterminado?: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface ContratoFrameInput {
  nombre: string;
  externalId?: string;
  content?: string;
  cantidadJornadas?: string | number;
  multiplicadorDiario?: string | number;
  esTiempoIndeterminado?: boolean;
}

/**
 * Variables disponibles para redactar el contenido del contrato.
 * Se reemplazan al descargar con los datos de la persona/contrato y de la empresa
 * seteada en el proyecto (Empresa del Contrato).
 */
export const contratoVariables: { grupo: string; vars: string[] }[] = [
  {
    grupo: "Datos de la persona",
    vars: ["{{nombre}}", "{{apellido}}", "{{nombreCompleto}}", "{{dni}}", "{{cuit}}", "{{email}}", "{{fechaDeNacimiento}}", "{{estadoCivil}}", "{{telefono}}"],
  },
  {
    grupo: "Domicilio de la persona",
    vars: ["{{direccion}}", "{{calle}}", "{{altura}}", "{{pisoDepto}}", "{{localidad}}", "{{codigoPostal}}"],
  },
  {
    grupo: "Datos bancarios",
    vars: ["{{cbu}}", "{{aliasBancario}}", "{{nroDeCuentaBancaria}}", "{{tipoDeCuentaBancaria}}"],
  },
  {
    grupo: "Contrato y proyecto",
    vars: ["{{nombreProyecto}}", "{{rolFrame}}", "{{nombreContrato}}", "{{nombreSede}}", "{{nombreCargo}}", "{{nombreNivel}}", "{{nombreArea}}", "{{nombreTurno}}", "{{fechaAltaContrato}}", "{{fechaBajaContrato}}", "{{horaInicio}}", "{{horaFin}}", "{{cantidadJornadas}}"],
  },
  {
    grupo: "Sueldos",
    vars: ["{{sueldoJornada}}", "{{sueldoJornadaLetras}}", "{{sueldoMano}}", "{{sueldoManoLetras}}", "{{sueldoNeto}}", "{{sueldoBruto}}", "{{sueldoDiarioNeto}}"],
  },
  {
    grupo: "Categoría SAT",
    vars: ["{{catSatNumero}}", "{{categoriaSat}}"],
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

const fileNameFromDisposition = (disposition: string, fallback: string): string => {
  const match = /filename="?([^"]+)"?/.exec(disposition || "");
  return match?.[1] || fallback;
};

class ContratoFrameAPI {
  async list(): Promise<ContratoFrameItem[]> {
    const { data } = await axios.get("/contratos-frame");
    return data;
  }

  async create(payload: ContratoFrameInput): Promise<ContratoFrameItem> {
    const { data } = await axios.post("/contratos-frame", payload);
    return data;
  }

  async update(id: string, payload: ContratoFrameInput): Promise<ContratoFrameItem> {
    const { data } = await axios.put(`/contratos-frame/${id}`, payload);
    return data;
  }

  async remove(id: string): Promise<{ message: string }> {
    const { data } = await axios.delete(`/contratos-frame/${id}`);
    return data;
  }

  /** Genera un PDF de ejemplo con el contenido del editor (sin guardar). */
  async preview(content: string): Promise<Blob> {
    const { data } = await axios.post("/contratos-frame/preview", { content }, { responseType: "blob" });
    return data as Blob;
  }

  /** Descarga el PDF del contrato con valores de ejemplo. */
  async download(item: ContratoFrameItem): Promise<void> {
    const response = await axios.get(`/contratos-frame/${item._id}/download`, { responseType: "blob" });
    downloadBlob(response.data, fileNameFromDisposition(response.headers?.["content-disposition"], `${item.name}.pdf`));
  }

  /** Descarga el PDF con las variables reemplazadas por los datos del empleado/contrato. */
  async downloadFilled(item: ContratoFrameItem, ctx: { userId: string; projectId: string; contractIndex: number; empresaId?: string }, fileNameOverride?: string): Promise<void> {
    const response = await axios.get(`/contratos-frame/${item._id}/download-filled`, { params: ctx, responseType: "blob" });
    const fileName = fileNameOverride || fileNameFromDisposition(response.headers?.["content-disposition"], `${item.name}.pdf`);
    downloadBlob(response.data, fileName);
  }
}

export const contratoFrameAPI = new ContratoFrameAPI();
