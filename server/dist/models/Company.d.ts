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
     * Excepciones: para ESTE convenio, esta empleadora usa otra obra social que la sindical del CCT.
     *
     * Va en una lista aparte y no dentro de `convenioIds` para no migrar lo que ya funciona. Es una
     * EXCEPCIÓN y no una configuración habitual: lo normal es que el convenio resuelva solo.
     *
     * Un override cuyo `convenioId` no esté en `convenioIds` es dato huérfano — la empresa dejó de
     * tener ese convenio registrado pero la excepción quedó. Se reporta, no se aplica.
     */
    convenioObraSocialOverrides?: Array<{
        convenioId: mongoose.Types.ObjectId;
        /** `data.id` del catálogo de Obras Sociales (RNOS numérico). */
        obraSocialId: number;
    }>;
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
        /** Código de Modalidad de Liquidación (pos. 73 del TXT). */
        modalidadLiquidacion?: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const Company: Model<ICompany>;
