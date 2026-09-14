import { Document, Model } from "mongoose";
/**
 * PAÍS DE RESIDENCIA: el país del DOMICILIO de una persona.
 *
 * Es un catálogo propio (Configuración → Países de residencia) y NO el de países de FRAME
 * (`Info` con `type: "pais"`), que sigue siendo el de la nacionalidad y el país de nacimiento. Son
 * preguntas distintas: dónde nació o de dónde es alguien no cambia, dónde vive sí, y la lista de
 * lugares donde vive la gente que se contrata la administra la plataforma, no la trae FRAME.
 *
 * Sigue la forma de los catálogos simples (Bancos, Sindicatos): `{ externalId, name, data }`.
 *
 * `data.id` ES LO QUE GUARDA `metadata.paisId`. La primera carga copia los países de FRAME CON SU
 * MISMO id (ver `services/paisesResidenciaSeed.ts`), así que los domicilios que ya estaban guardados
 * con el id viejo siguen resolviendo a su nombre sin migrar ningún usuario.
 */
export interface IPaisResidencia extends Document {
    externalId: string;
    name: string;
    /** Activo = se ofrece en los formularios. Se apaga desde el ABM sin borrar el país. */
    activo?: boolean;
    data: {
        id: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const PaisResidencia: Model<IPaisResidencia>;
