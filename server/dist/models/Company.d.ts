import mongoose, { Document, Model } from "mongoose";
export interface ICompany extends Document {
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
    representanteLegalNombre?: string;
    representanteLegalEmail?: string;
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
     * Cuál de las registradas se usa cuando la persona no tiene obra social propia. Guarda el
     * `data.id` del catálogo (el RNOS numérico), igual que `osId` en el contrato. Vacío = se usa la
     * marcada como global en el catálogo.
     *
     * Se llamaba `obraSocialId`, que sugería "la obra social de la empresa" cuando siempre fue solo el
     * valor por defecto. Ver `scripts/migrarObrasSocialesPorEmpresa.ts` para el renombre.
     */
    obraSocialDefaultId?: number;
    /**
     * Convenios Colectivos (CCT) habilitados para esta empleadora. Referencias al catálogo de Convenios.
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
     * Valores por defecto de ARCA para los contratos de esta empleadora.
     *
     * No son nomencladores (esos son universales) ni datos del contrato: son la elección habitual de
     * ESTA empleadora dentro del nomenclador, que hoy se repite a mano en cada alta. Guardan el código
     * de ARCA tal cual viaja al TXT.
     */
    defaultsArca?: {
        /** Código de Tipo de Servicio (pos. 107-109 del TXT). */
        tipoServicio?: string;
        /** Código de Modalidad de Liquidación (pos. 73 del TXT). */
        modalidadLiquidacion?: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const Company: Model<ICompany>;
