import { GRUPO_FIRMA, GrupoVariables } from "./variableFirma";
import axios from "./axiosConfig";

export interface ContratoFrameItem {
  _id: string;
  externalId: string;
  name: string;
  /** Contenido redactado en la plataforma (HTML) con variables `{{variable}}` */
  content?: string;
  /** Contrato (tipo) al que pertenece esta plantilla. Viaja populado con `{ _id, name, isActive, data.requiereFirma }`. */
  contratoId?: string | { _id: string; name: string; isActive?: boolean; data?: { requiereFirma?: boolean; requiereFirmaRelease?: boolean; requiereFirmaAlta?: boolean } };
  /** TODOS los tipos de contrato que usan esta plantilla (el primero es `contratoId`). Ver `contratosDePlantilla`. */
  contratoIds?: string[];
  data: {
    id?: number;
    nombre: string;
    /** Copiados del Contrato elegido: se muestran acá pero se editan desde el ABM de Contratos. */
    cantidadJornadas: number;
    multiplicadorDiario: number;
    esTiempoIndeterminado?: boolean;
  };
  usaMembrete?: boolean;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContratoFrameInput {
  nombre: string;
  /** Los tipos de contrato que usan esta plantilla (al menos uno; el primero es el principal). */
  contratoIds: string[];
  externalId?: string;
  content?: string;
  usaMembrete?: boolean;
  isActive?: boolean;
  /** Al duplicar: el `_id` de la original. El server pone la copia en los mismos estados. */
  duplicarDe?: string;
}

/**
 * Variables disponibles para redactar el contenido del contrato.
 * Se reemplazan al descargar con los datos de la persona/contrato y de la empresa
 * seteada en el proyecto (Empresa del Contrato).
 */
export const contratoVariables: GrupoVariables[] = [
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
    grupo: "Datos bancarios",
    vars: ["{{cbu}}", "{{aliasBancario}}", "{{nroDeCuentaBancaria}}", "{{tipoDeCuentaBancaria}}"],
  },
  {
    /* Ver `advertencia`: la confusión entre cliente y proyecto ya tituló contratos con el nombre de la película. */
    nota: "«{{nombreProyecto}}» es la OBRA («Surrender»); «{{nombreCliente}}» es para quién se hace («REELSHORT»).",
    advertencia: "Para el título del documento va el CLIENTE. Usar {{nombreProyecto}} ahí titula el contrato con el nombre de la película.",
    grupo: "Contrato y proyecto",
    vars: ["{{nombreProyecto}}", "{{nombreCliente}}", "{{rolFrame}}", "{{nombreContrato}}", "{{nombreSede}}", "{{nombreCargo}}", "{{nombreNivel}}", "{{nombreArea}}", "{{nombreTurno}}", "{{fechaAltaContrato}}", "{{fechaBajaContrato}}", "{{horaInicio}}", "{{horaFin}}", "{{cantidadJornadas}}"],
  },
  {
    nota: "«{{sueldoBruto}}» es el del contrato (se copió de la escala al asignar la categoría y no se actualiza); «{{sueldoBrutoCatSatNumero}}» y «{{sueldoBrutoCatSatLetras}}» son el bruto de la escala VIGENTE de la categoría.",
    grupo: "Sueldos",
    vars: ["{{sueldoJornada}}", "{{sueldoJornadaLetras}}", "{{sueldoMano}}", "{{sueldoManoLetras}}", "{{sueldoNeto}}", "{{sueldoBruto}}", "{{sueldoDiarioNeto}}", "{{sueldoBrutoCatSatNumero}}", "{{sueldoBrutoCatSatLetras}}"],
  },
  {
    grupo: "Categoría",
    vars: ["{{catSatNumero}}", "{{categoriaSat}}", "{{catSatNombre}}", "{{convenio}}", "{{codigoArca}}"],
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
  async preview(content: string, usaMembrete?: boolean): Promise<Blob> {
    const { data } = await axios.post("/contratos-frame/preview", { content, usaMembrete }, { responseType: "blob" });
    return data as Blob;
  }

  /** Descarga el PDF del contrato con valores de ejemplo. */
  async download(item: ContratoFrameItem): Promise<void> {
    const response = await axios.get(`/contratos-frame/${item._id}/download`, { responseType: "blob" });
    downloadBlob(response.data, fileNameFromDisposition(response.headers?.["content-disposition"], `${item.name}.pdf`));
  }

  /** Descarga el PDF con las variables reemplazadas por los datos del empleado/contrato. */
  async downloadFilled(item: ContratoFrameItem, ctx: { userId: string; projectId: string; contractIndex: number; empresaId?: string }): Promise<void> {
    const response = await axios.get(`/contratos-frame/${item._id}/download-filled`, { params: ctx, responseType: "blob" });
    // Sin override: el nombre lo decide el backend, que es el único que tiene todos los datos
    // (email, CUIL/DNI, período del contrato) y el mismo que se sube a Dropbox Sign.
    downloadBlob(response.data, fileNameFromDisposition(response.headers?.["content-disposition"], `${item.name}.pdf`));
  }
}

export const contratoFrameAPI = new ContratoFrameAPI();

/**
 * LOS TIPOS DE CONTRATO DE UNA PLANTILLA. Una plantilla puede servir a varios (`contratoIds`); las de
 * antes de eso sólo traen `contratoId` (que el server rellena en la lista al leerlas). Para preguntar
 * «¿esta plantilla es de este tipo?» se usa `plantillaEsDeContrato`, nunca `contratoId ===`.
 */
export const contratosDePlantilla = (cf: Pick<ContratoFrameItem, "contratoId" | "contratoIds">): string[] => {
  const lista = Array.isArray(cf.contratoIds) ? cf.contratoIds.map((x: any) => String(x?._id ?? x)).filter(Boolean) : [];
  if (lista.length > 0) return lista;
  const uno = typeof cf.contratoId === "object" ? cf.contratoId?._id : cf.contratoId;
  return uno ? [String(uno)] : [];
};
/**
 * ¿Esta plantilla se ofrece en los FILTROS de tipo de contrato? No si está desactivada, ni si lo está el
 * tipo de contrato al que pertenece: los contratos viejos la siguen mostrando por nombre, pero filtrar
 * por algo que ya no se usa solo alarga la lista.
 */
export const plantillaActivaParaFiltrar = (cf: Pick<ContratoFrameItem, "isActive" | "contratoId">): boolean =>
  cf.isActive !== false && !(typeof cf.contratoId === "object" && cf.contratoId?.isActive === false);

export const plantillaEsDeContrato = (cf: Pick<ContratoFrameItem, "contratoId" | "contratoIds">, contratoId: unknown): boolean => {
  const id = String((contratoId as any)?._id ?? contratoId ?? "");
  return !!id && contratosDePlantilla(cf).includes(id);
};
