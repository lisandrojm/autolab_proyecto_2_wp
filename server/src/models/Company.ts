import mongoose, { Schema, Document, Model } from 'mongoose';

// Empresa / Productora usada para armar los contratos (datos de "La Empleadora").
export interface ICompany extends Document {
  razonSocial: string;
  cuit?: string;
  // Domicilio legal
  domicilioCalle?: string;
  domicilioNumero?: string;
  domicilioPisoDepto?: string;
  localidad?: string;
  provincia?: string;
  codigoPostal?: string;
  // Firmante (quien representa a la empresa en el contrato)
  firmanteNombre?: string;
  firmanteDni?: string;
  firmanteCargo?: string;
  /**
   * Email del firmante. NO es el del representante legal, y por eso es un campo aparte.
   *
   * En 2030 S.R.L. el firmante es Norma Olivo y el representante legal es Hernán Pellegrini: hacer
   * que `{{empresaFirmanteEmail}}` resolviera al email del representante imprimiría el mail de una
   * persona al lado del nombre y el DNI de otra, en el bloque de partes de un contrato firmado.
   * Que hoy coincidan en FZERO no las vuelve el mismo dato.
   */
  firmanteEmail?: string;
  // Representante legal / apoderado
  representanteLegalNombre?: string;
  representanteLegalEmail?: string;
  // Membrete: logo y firma (imágenes) de la empresa para encabezar/firmar los documentos.
  // La aclaración de firma y el cargo reutilizan firmanteNombre / firmanteCargo.
  logoUrl?: string;
  signatureUrl?: string;
  /**
   * Obras Sociales REGISTRADAS ante ARCA para esta empleadora ("obras sociales relacionadas a su
   * actividad", en Datos del Empleador). Referencias al catálogo global de Obras Sociales.
   *
   * Es un CONJUNTO, no una sola: ARCA lleva ~400 registradas por CUIT sobre un universo de 494, cada
   * una con su fecha de alta, y solo acepta altas con una de ellas. Hasta acá el modelo solo tenía la
   * default, así que una empleadora no podía declarar más de una obra social — y una obra social de
   * otro CUIT pasaba todos los controles y llegaba mal.
   *
   * Se registra por empleadora y hay que repetir la extracción logueado con cada CUIT.
   */
  obrasSocialesIds?: mongoose.Types.ObjectId[];
  /**
   * Obra social de los trabajadores **EXCLUIDOS DE CONVENIO** (CCT 9999/99) de esta empleadora.
   * Guarda el `data.id` del catálogo (el RNOS numérico), igual que `osId` en el contrato.
   *
   * OJO con el alcance: NO es "la obra social de la empresa". Quien está bajo un convenio hereda la
   * de su sindicato (`Convenio.obraSocialDefaultId`), y la empleadora a lo sumo la pisa con un
   * override puntual. Este campo es el ÚNICO lugar donde la empresa decide de verdad, y solo para
   * quienes por definición no tienen sindicato.
   *
   * Se llamaba `obraSocialId`; ver `scripts/migrarObrasSocialesPorEmpresa.ts` para el renombre.
   */
  obraSocialDefaultId?: number;
  /**
   * Convenios (CCT) habilitados para esta empleadora. Referencias al catálogo de Convenios.
   *
   * NO se manda al TXT: el campo Convenio del registro de 130 (pos. 91-100) va en blanco a propósito.
   * Su función es ser el CONJUNTO VÁLIDO contra el que se valida la categoría del contrato: ARCA
   * solo ofrece las categorías de los convenios que la empresa tiene habilitados (l_CatCCT viene
   * filtrado por CCT), así que una categoría de otro convenio es un dato mal cargado.
   *
   * No borrar por "no se usa": es el único lugar donde vive la relación empresa → convenios, y sin
   * él la validación de `categorias.convenio` se queda sin padre.
   *
   * Ojo: "9999/99 — EXCLUIDO DE CONVENIO" es un convenio más de la lista, no la ausencia de convenio.
   */
  convenioIds?: mongoose.Types.ObjectId[];
  /**
   * Sucursales del padrón de ARCA que le corresponden a esta empresa. Son referencias al catálogo
   * de Sucursales (ARCA → Sucursales), donde vive TODO el dato: código, domicilio y actividades.
   * Acá solo se elige cuáles aplican, igual que con los convenios.
   */
  sucursalIds?: mongoose.Types.ObjectId[];
  /**
   * LAS ACTIVIDADES QUE ESTA EMPLEADORA DECLARÓ EN CADA DOMICILIO. Acá viven, y en ningún otro lado.
   *
   * ARCA declara las actividades POR CUIT, no por dirección: dos empleadoras en el mismo domicilio
   * pueden tener declaradas distintas, y el organismo rechaza un alta con una que ESE CUIT no
   * declaró ahí, aunque otra empresa sí la tenga. Por eso el domicilio (`ArcaSucursal`) quedó como un
   * ABM de la dirección y su código, y la asociación de actividades es de la empresa.
   *
   * SE GUARDA LA ACTIVIDAD COMPLETA (`codigo` + `descripcion`) y no solo el código: es lo mismo que
   * hace el domicilio, y por el mismo motivo — el import del padrón trae códigos, no ids del
   * catálogo, así que la descripción tiene que viajar con el dato o se pierde si el catálogo cambia.
   *
   * SIN FILA PARA UN DOMICILIO = SIN ACTIVIDADES DECLARADAS ahí. No es «todas»: una vez que las
   * actividades son de la empresa, no hay una lista del domicilio de la cual heredar.
   */
  sucursalActividades?: Array<{
    sucursalId: mongoose.Types.ObjectId;
    actividades: Array<{ codigo: string; descripcion?: string }>;
  }>;
  /**
   * Valores por defecto de ARCA para los contratos de esta empleadora.
   *
   * No son nomencladores (esos son universales) ni datos del contrato: son la elección habitual de
   * ESTA empleadora dentro del nomenclador, que hoy se repite a mano en cada alta. Guardan el código
   * de ARCA tal cual viaja al TXT.
   */
  defaultsArca?: {
    /**
     * Código del Grupo de Tipo de Servicio: "1" continuos, "2" discontinuos.
     *
     * NO viaja en el TXT: está para filtrar el combo de tipo de servicio, igual que en la pantalla
     * de ARCA, donde primero se elige el grupo y recién ahí se habilita el tipo. Es derivable del
     * código del tipo (ver `utils/grupoTipoServicio.ts`) y se guarda derivado, nunca como llegó.
     */
    grupoTipoServicio?: string;
    /** Código de Tipo de Servicio (pos. 107-109 del TXT). */
    tipoServicio?: string;
    /**
     * El domicilio de desempeño habitual de esta empleadora (`_id` de `ArcaSucursal`).
     *
     * NO se autocompleta en el contrato: se marca en el picker de Sucursal y se ofrece primero. Un
     * default escrito solo haría que el formulario se vea completo con un domicilio que nadie eligió,
     * y el domicilio decide qué actividades acepta ARCA.
     *
     * Tiene que ser uno de los `sucursalIds` de esta empresa: si se le quita el domicilio, este
     * default deja de tener sentido y se limpia.
     */
    sucursalId?: any;
    /**
     * El convenio habitual de esta empleadora (`_id` de `Convenio`).
     *
     * SUGERENCIA, NO CANDADO: en el alta se ofrece primero y marcado, y se puede elegir cualquier
     * otro de los registrados. Sirve para el caso normal —una productora de TV da de alta casi todo
     * bajo el mismo CCT— sin cerrar los demás.
     *
     * Tiene que ser uno de los `convenioIds` de esta empresa.
     */
    convenioId?: any;
    /** Código de Modalidad de Contratación (pos. 17-19 del TXT). */
    modalidadContratacion?: string;
    /** Código de Modalidad de Liquidación (pos. 73 del TXT). */
    modalidadLiquidacion?: string;
    /**
     * RNOS de la obra social que esta empleadora OFRECE PRIMERO, pisando la de la instalación.
     *
     * NO ES `obraSocialDefaultId`, que está más arriba y es otra cosa: aquel decide de verdad —es la
     * obra social de los excluidos de convenio (9999/99), que no tienen sindicato del que heredarla—
     * y viaja al TXT. Este solo ordena el combo.
     *
     * Se guardan separados justamente para que no se confundan: si el mismo campo hiciera las dos
     * cosas, cambiar el orden de un selector cambiaría lo que se declara ante el organismo.
     */
    obraSocial?: string;
    /** Código de actividad que esta empleadora ofrece primero, pisando el de la instalación. */
    actividad?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const companySchema = new Schema<ICompany>(
  {
    razonSocial: { type: String, required: true },
    cuit: { type: String },
    domicilioCalle: { type: String },
    domicilioNumero: { type: String },
    domicilioPisoDepto: { type: String },
    localidad: { type: String },
    provincia: { type: String },
    codigoPostal: { type: String },
    firmanteNombre: { type: String },
    firmanteDni: { type: String },
    firmanteCargo: { type: String },
    firmanteEmail: { type: String },
    representanteLegalNombre: { type: String },
    representanteLegalEmail: { type: String },
    logoUrl: { type: String },
    signatureUrl: { type: String },
    obrasSocialesIds: [{ type: Schema.Types.ObjectId, ref: 'ObraSocial' }],
    obraSocialDefaultId: { type: Number },
    convenioIds: [{ type: Schema.Types.ObjectId, ref: 'Convenio' }],
    sucursalIds: [{ type: Schema.Types.ObjectId, ref: 'ArcaSucursal' }],
    sucursalActividades: [
      {
        _id: false,
        sucursalId: { type: Schema.Types.ObjectId, ref: 'ArcaSucursal', required: true },
        actividades: [{ _id: false, codigo: { type: String, required: true }, descripcion: { type: String, default: '' } }],
      },
    ],
    defaultsArca: {
      grupoTipoServicio: { type: String, default: '' },
      tipoServicio: { type: String, default: '' },
      modalidadContratacion: { type: String, default: '' },
      modalidadLiquidacion: { type: String, default: '' },
      obraSocial: { type: String, default: '' },
      actividad: { type: String, default: '' },
      sucursalId: { type: Schema.Types.ObjectId, ref: 'ArcaSucursal', default: null },
      convenioId: { type: Schema.Types.ObjectId, ref: 'Convenio', default: null },
    },
  },
  {
    timestamps: true,
    collection: 'companies',
  },
);

export const Company: Model<ICompany> = mongoose.model<ICompany>('Company', companySchema);
