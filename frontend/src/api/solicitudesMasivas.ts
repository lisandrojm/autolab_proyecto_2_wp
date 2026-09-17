import axios from "./axiosConfig";

/*
  CARGA MASIVA DE SOLICITUDES: la plantilla, la vista previa y el import.

  Las tres hablan con `server/src/routes/solicitudesMasivas.ts`, que es donde viven las columnas y la
  validación. Acá no se valida nada: una segunda validación en el navegador es una que se puede
  separar de la del server, y la que manda es siempre la del server.
*/

/** Una fila que no se va a poder importar, con el número de fila del Excel y qué campo falla. */
export interface ErrorFilaImport {
  fila: number;
  campo: string;
  motivo: string;
}

/** Cómo se muestra en la vista previa una fila que sí se va a crear. */
export interface FilaListaImport {
  fila: number;
  resumen: {
    nombre: string;
    cuil: string;
    proyecto: string;
    areaTurno: string;
    contrato: string;
    desde: string;
    hasta: string;
    /** La persona todavía no existe: se va a crear su ficha junto con la solicitud. */
    personaNueva: boolean;
  };
}

export interface RevisionPlanilla {
  listas: FilaListaImport[];
  errores: ErrorFilaImport[];
  /** Cuántas filas con datos tenía la planilla. */
  total: number;
}

export interface ResultadoImport {
  creadas: number;
  personasCreadas: number;
  total: number;
  errores: ErrorFilaImport[];
}

const BASE = "/solicitudes-masivas";

export const solicitudesMasivasAPI = {
  /**
   * Baja la plantilla y la guarda. Se genera en el momento con los catálogos de HOY: una plantilla
   * guardada del mes pasado ofrece proyectos y categorías que ya no existen.
   */
  async descargarPlantilla(): Promise<void> {
    const { data } = await axios.get(`${BASE}/plantilla`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `solicitudes_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  /** Qué se va a crear y qué filas están mal. No crea nada. */
  async previsualizar(archivo: File): Promise<RevisionPlanilla> {
    const form = new FormData();
    form.append("archivo", archivo);
    const { data } = await axios.post(`${BASE}/previsualizar`, form, { headers: { "Content-Type": "multipart/form-data" } });
    return data;
  },

  /** Crea las solicitudes de las filas que están bien. Las que fallan se informan. */
  async importar(archivo: File): Promise<ResultadoImport> {
    const form = new FormData();
    form.append("archivo", archivo);
    const { data } = await axios.post(`${BASE}/importar`, form, { headers: { "Content-Type": "multipart/form-data" } });
    return data;
  },
};
