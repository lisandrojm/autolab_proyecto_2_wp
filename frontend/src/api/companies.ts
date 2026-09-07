import axios from './axiosConfig';

export interface Company {
  _id: string;
  razonSocial: string;
  cuit?: string;
  domicilioCalle?: string;
  domicilioNumero?: string;
  domicilioPisoDepto?: string;
  localidad?: string;
  provincia?: string;
  codigoPostal?: string;
  firmanteNombre?: string;
  firmanteDni?: string;
  firmanteCargo?: string;
  /** Email del firmante. Distinto del representante legal: pueden ser dos personas. */
  firmanteEmail?: string;
  representanteLegalNombre?: string;
  representanteLegalEmail?: string;
  // Membrete: logo y firma (imágenes). La aclaración/cargo reutilizan firmanteNombre/firmanteCargo.
  logoUrl?: string;
  signatureUrl?: string;
  /**
   * Obras Sociales REGISTRADAS ante ARCA para este CUIT (Datos del Empleador → Obras Sociales).
   * Referencias al catálogo global. Es un conjunto: ARCA lleva ~400 registradas por empleadora sobre
   * un universo de 494, y solo acepta altas con una de ellas.
   */
  obrasSocialesIds?: string[];
  /**
   * Obra social de los trabajadores EXCLUIDOS DE CONVENIO (9999/99). NO es "la obra social de la
   * empresa": quien está bajo un convenio hereda la de su sindicato. Es el único lugar donde la
   * empleadora decide, porque los excluidos no tienen sindicato del que heredar.
   */
  obraSocialDefaultId?: number | null;
  /** Excepciones: para ESE convenio, esta empleadora usa otra obra social que la sindical del CCT. */
  /** @deprecated Nombre viejo de `obraSocialDefaultId`. El server sirve los dos; usar el nuevo. */
  obraSocialId?: number | null;
  /** Ids de los Convenios asociados a la empresa. */
  convenioIds?: string[];
  /**
   * Sucursales del padrón de ARCA asignadas a esta empresa. Son referencias al catálogo de
   * Sucursales, donde vive todo el dato (código, domicilio, actividades). Acá solo se eligen.
   */
  sucursalIds?: string[];
  /**
   * Los nomencladores UNIVERSALES que esta empleadora usa. VACÍO SIGNIFICA «TODOS», no «ninguno».
   *
   * A diferencia de convenios, domicilios y obras sociales —que reflejan lo que ARCA declaró para ese
   * CUIT—, éstos son tablas iguales para todos: la lista es un filtro de la plataforma para que el
   * combo de un alta no ofrezca 293 tipos de servicio cuando la productora usa cuatro.
   */
  tipoServicioIds?: string[];
  grupoTipoServicioIds?: string[];
  modalidadContratacionIds?: string[];
  modalidadLiquidacionIds?: string[];
  /**
   * Qué actividades declaró ESTA empleadora en cada domicilio.
   *
   * El domicilio es compartido pero las actividades ARCA las declara por CUIT: dos empresas en el
   * mismo domicilio pueden tener declaradas distintas. Sin fila para un domicilio rigen todas las
   * suyas; con la lista vacía, ninguna.
   */
  sucursalActividades?: Array<{ sucursalId: string; actividades: Array<{ codigo: string; descripcion?: string }> }>;
  /**
   * Elección habitual de esta empleadora dentro del nomenclador de ARCA, para no repetirla en cada
   * alta. Guarda el código tal cual viaja al TXT.
   */
  defaultsArca?: {
    /**
     * Grupo de Tipo de Servicio: "1" CONTINUOS, "2" DISCONTINUOS.
     *
     * No viaja al TXT. Filtra el combo de tipo de servicio, igual que en la pantalla de ARCA, donde
     * primero se elige el grupo y recién ahí se habilita el tipo. El server lo guarda DERIVADO del
     * código del tipo, así que lo que vuelve del GET siempre es coherente.
     */
    grupoTipoServicio?: string;
    tipoServicio?: string;
    modalidadLiquidacion?: string;
    /**
     * El domicilio de desempeño habitual (`_id` de la sucursal).
     *
     * NO se autocompleta en el contrato: se marca con ★ en el picker de Sucursal y se ofrece primero.
     * Un default escrito solo dejaría el formulario viéndose completo con un domicilio que nadie
     * eligió — y el domicilio decide qué actividades acepta ARCA.
     */
    sucursalId?: string | null;
    /** El convenio habitual. Se ofrece primero en el alta; no impide elegir otro. */
    convenioId?: string | null;
    /** Código de Modalidad de Contratación (pos. 17-19 del TXT). */
    modalidadContratacion?: string;
    /**
     * RNOS de la obra social que se ofrece primero. PRESELECCIÓN.
     *
     * No confundir con `obraSocialDefaultId`, que sí decide: es la de los excluidos de convenio
     * (9999/99) y viaja al TXT. Este solo ordena el combo.
     */
    obraSocial?: string;
    /** Código de actividad que se ofrece primero al cargarlas en un domicilio. */
    actividad?: string;
    /** `codigoArca` de la categoría que se ofrece primero. Tiene que ser de uno de sus convenios. */
    categoria?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export type CompanyInput = Omit<Company, '_id' | 'createdAt' | 'updatedAt'>;

/** Los ítems de ARCA que se declaran POR CUIT y por eso se vinculan a una empresa. */
export type TipoVinculoArca = 'convenio' | 'sucursal' | 'obraSocial' | 'tipoServicio' | 'grupoTipoServicio' | 'modalidadContratacion' | 'modalidadLiquidacion';

/** El campo de `Company` donde vive cada vínculo. Uno solo, para que las dos puntas no se separen. */
export const CAMPO_IDS_DE_VINCULO: Record<TipoVinculoArca, keyof Company> = {
  convenio: 'convenioIds',
  sucursal: 'sucursalIds',
  obraSocial: 'obrasSocialesIds',
  tipoServicio: 'tipoServicioIds',
  grupoTipoServicio: 'grupoTipoServicioIds',
  modalidadContratacion: 'modalidadContratacionIds',
  modalidadLiquidacion: 'modalidadLiquidacionIds',
};

class CompaniesAPI {
  async list(): Promise<Company[]> {
    const { data } = await axios.get('/companies');
    return Array.isArray(data) ? data : [];
  }

  /**
   * Qué empresas tienen registrado un ítem del nomenclador. La MISMA relación que edita la ficha
   * (`convenioIds`, `sucursalIds`, `obrasSocialesIds`), vista desde el ítem.
   *
   * Manda la lista COMPLETA de empresas que quedan vinculadas, no un alta o una baja: así el server
   * puede deducir a cuáles se les quitó y limpiarles lo que colgaba de ese vínculo —el default, y las
   * actividades del domicilio—, que es justamente lo que no se puede hacer desde el cliente cuando se
   * tocan varias empresas de una vez.
   */
  async setVinculos(tipo: TipoVinculoArca, itemId: string, empresaIds: string[]): Promise<{ vinculadas: number; desvinculadas: number; limpiezas: number }> {
    const { data } = await axios.put('/companies/vinculos', { tipo, itemId, empresaIds });
    return data;
  }

  /**
   * A cuántos contratos alcanza cada obra social de esta empleadora, para poder avisar ANTES de
   * sacarla de su lista de registradas. Devuelve `contratos` (la tienen fijada) y `convenios` (los
   * CCT registrados que la heredan), indexados por el `data.id` de la obra social.
   */
  async obrasSocialesEnUso(id: string): Promise<{ contratos: Record<string, number>; convenios: Record<string, string[]> }> {
    const { data } = await axios.get(`/companies/${id}/obras-sociales-en-uso`);
    return data;
  }

  async create(payload: Partial<CompanyInput>): Promise<Company> {
    const { data } = await axios.post('/companies', payload);
    return data;
  }

  async update(id: string, payload: Partial<CompanyInput>): Promise<Company> {
    const { data } = await axios.put(`/companies/${id}`, payload);
    return data;
  }

  async remove(id: string): Promise<void> {
    await axios.delete(`/companies/${id}`);
  }
}

export const companiesAPI = new CompaniesAPI();
