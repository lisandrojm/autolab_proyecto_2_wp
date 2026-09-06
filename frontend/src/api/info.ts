import axios from "./axiosConfig";

export interface InfoItem {
  _id: string;
  externalId: string;
  type: string;
  data: {
    id: number;
    nombre: string;
    /** Estados: color del texto del badge (el fondo es ese color con transparencia). */
    color?: string;
    /** Estados: tipos de contrato (contratos-frame) en los que se ofrece. Vacío = todos. */
    contratoFrameIds?: string[];
    /** Estados: marca los de índole impositiva, para darles un tratamiento distinto. */
    esImpositivo?: boolean;
    /** Estados impositivos: texto del badge secundario que se muestra en las tarjetas de Contrato. */
    etiquetaSecundaria?: string;
    /** Estados impositivos: color del badge secundario. */
    colorEtiquetaSecundaria?: string;
    /** Estados impositivos: trámite que representa (excluyente). */
    tipoImpositivo?: "alta_temprana_afip" | "constancia_cuit";
    /** Estado creado por el sistema: se puede editar, pero no eliminar. */
    esSistema?: boolean;
    /** El estado admite personas SIN CUIT/CUIL argentino (badge "Sin CUIT" en vez del trámite). */
    aceptaSinCuit?: boolean;
    /** Estados: orden visual en el ABM y en el dropdown del wizard (guía, no bloquea transiciones). */
    orden?: number;
    /** Estados: paso del flujo de dependencias (alternativas comparten número). Ausente = fuera del flujo. */
    ordenDependencia?: number;
    /** Estados: transición automática hacia ESTE estado cuando aparece un archivo en una carpeta de
     *  Dropbox. Requiere `ordenDependencia`. */
    /** Transición automática hacia ESTE estado cuando aparece un archivo en CUALQUIERA de estas
     *  carpetas de Dropbox. Requiere `ordenDependencia`. */
    transicionAutomatica?: {
      evento: "dropbox_carpeta";
      carpetas: {
        dropboxCarpeta: string;
        /**
     * PARA QUÉ SIRVE esta carpeta. Es lo que usa el server para resolverla, en vez de su nombre.
     *
     * `string` y no un union: la lista de valores vive en el server (`utils/propositosCarpeta.ts`)
     * y llega por `GET /info/propositos-carpeta`. Declarar acá un union sería una copia de esa
     * lista que hay que acordarse de mantener sincronizada — la segunda verdad que evitamos.
     *
     * Vacío = carpeta sin migrar: el server la resuelve por su nombre y lo registra.
     */
    proposito?: string;
    /** Nota libre de quien la configuró (ej. qué significa esta carpeta puntual en su flujo). */
        detalle?: string;
      }[];
    };
    [key: string]: any;
  };
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface EstadoPayload {
  name: string;
  color?: string;
  contratoFrameIds?: string[];
  esImpositivo?: boolean;
  etiquetaSecundaria?: string;
  colorEtiquetaSecundaria?: string;
  tipoImpositivo?: "alta_temprana_afip" | "constancia_cuit";
  /** El estado admite también personas SIN CUIT/CUIL argentino (se les muestra el badge "Sin CUIT"). */
  aceptaSinCuit?: boolean;
  /**
   * Opcional: si se omite, el backend no la toca (se preserva la que ya tenía el estado — se edita
   * desde "Orden de dependencias", no desde el formulario de Editar Estado). `null` la borra.
   */
  transicionAutomatica?: {
    evento: "dropbox_carpeta";
    carpetas: { dropboxCarpeta: string; detalle?: string }[];
  } | null;
}

class InfoAPI {
  async listByType(type: string): Promise<InfoItem[]> {
    const { data } = await axios.get(`/info?type=${type}`);
    return data;
  }

  /* --------- ABM de Estados (infos con type "estado-empleado") --------- */

  async listEstados(): Promise<InfoItem[]> {
    return this.listByType("estado-empleado");
  }

  async createEstado(payload: EstadoPayload): Promise<InfoItem> {
    const { data } = await axios.post(`/info/estados`, payload);
    return data;
  }

  /** Devuelve además `avisos`: cosas que se guardaron igual pero que conviene saber (ver el PATCH). */
  async updateEstado(id: string, payload: EstadoPayload): Promise<InfoItem & { avisos?: string[] }> {
    const { data } = await axios.patch(`/info/estados/${id}`, payload);
    return data;
  }

  async deleteEstado(id: string): Promise<void> {
    await axios.delete(`/info/estados/${id}`);
  }

  /** Guarda el orden visual tras arrastrar en el ABM (guía, no bloquea transiciones). */
  async reorderEstados(items: { id: string; orden: number }[]): Promise<void> {
    await axios.patch(`/info/estados/reorder`, { items });
  }

  /** Guarda el orden de dependencias (flujo de pasos). `ordenDependencia: null` saca al estado del flujo. */
  async reorderEstadosDependencia(items: { id: string; ordenDependencia: number | null }[]): Promise<void> {
    await axios.patch(`/info/estados/reorder-dependencia`, { items });
  }

  /* --------- ABM de Sedes (type "sede") --------- */

  async listSedes(): Promise<InfoItem[]> {
    return this.listByType("sede");
  }

  async createSede(payload: { nombre: string; externalId?: string; codigoSucursal?: string }): Promise<InfoItem> {
    const { data } = await axios.post(`/info/sede`, payload);
    return data;
  }

  async updateSede(id: string, payload: { nombre?: string; externalId?: string; codigoSucursal?: string }): Promise<InfoItem> {
    const { data } = await axios.patch(`/info/sede/${id}`, payload);
    return data;
  }

  async deleteSede(id: string): Promise<void> {
    await axios.delete(`/info/sede/${id}`);
  }
}

export const infoAPI = new InfoAPI();

/** Un propósito de carpeta, tal como lo describe el server. */
export interface PropositoCarpeta {
  valor: string;
  etiqueta: string;
  descripcion: string;
}

/**
 * La lista de propósitos, cacheada por sesión.
 *
 * Es estática —no toca la base— así que pedirla en cada apertura del modal sería una llamada por
 * nada. Se guarda la PROMESA y no el resultado: si el modal se abre dos veces mientras la primera
 * está en vuelo, las dos esperan la misma respuesta en vez de disparar dos pedidos.
 *
 * Si falla, el caché se limpia para que el próximo intento vuelva a pedirla. Cachear un error
 * dejaría el desplegable roto hasta recargar la página.
 */
let cachePropositos: Promise<PropositoCarpeta[]> | null = null;

export const propositosCarpeta = (): Promise<PropositoCarpeta[]> => {
  if (!cachePropositos) {
    cachePropositos = axios
      .get("/info/propositos-carpeta")
      .then((r) => (r.data?.propositos || []) as PropositoCarpeta[])
      .catch((e) => {
        cachePropositos = null;
        throw e;
      });
  }
  return cachePropositos;
};
