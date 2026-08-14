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
     * Obra social a usar para los contratos de esta empresa cuando la persona no tiene ninguna
     * asignada. Guarda el `data.id` del catálogo (el RNOS numérico), igual que `osId` en el contrato.
     * Si queda vacío, se usa la marcada como global en el catálogo de Obras Sociales.
     */
    obraSocialId?: number;
    /**
     * Convenios Colectivos (CCT) habilitados para esta empleadora. Referencias al catálogo de Convenios.
     *
     * NO se manda al TXT: el campo Convenio del registro de 130 (pos. 91-100) va en blanco a propósito.
     * Su función es ser el CONJUNTO VÁLIDO contra el que se valida la Categoría SAT del contrato: ARCA
     * solo ofrece las categorías de los convenios que la empresa tiene habilitados (l_CatCCT viene
     * filtrado por CCT), así que una categoría de otro convenio es un dato mal cargado.
     *
     * No borrar por "no se usa": es el único lugar donde vive la relación empresa → convenios, y sin
     * él la validación de `categorias-sat.data.convenio` se queda sin padre.
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
    createdAt: Date;
    updatedAt: Date;
}
export declare const Company: Model<ICompany>;
