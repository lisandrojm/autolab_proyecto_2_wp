import { Document, Model } from "mongoose";
/**
 * Sindicato / gremio al que una persona puede estar AFILIADA.
 *
 * Sigue la forma de los catálogos simples (Bancos, Obras Sociales): `{ externalId, name, data }`.
 *
 * NO SALE DEL CONVENIO, y por eso es un catálogo aparte y no un campo derivado del CCT. Estar
 * comprendido por un convenio y estar afiliado al sindicato que lo firmó son dos cosas distintas:
 * lo primero lo determina la actividad y alcanza a todo el personal, lo segundo es voluntario y es
 * lo que habilita el descuento de la cuota sindical. Alguien puede trabajar bajo el 0131/75 y no
 * estar afiliado, o estar afiliado a un gremio distinto del de su convenio.
 *
 * El otro camino evaluado era leer el gremio de `Convenio.signatario`, y se descartó: ese campo es
 * texto libre del nomenclador de ARCA que suele traer también a la cámara empresaria, y el util que
 * lo interpreta (`utils/signatarioConvenio.ts`) se declara a sí mismo como heurística para
 * dimensionar trabajo, no para afirmar quién firmó. No es una lista que se le pueda ofrecer a
 * alguien para que elija su afiliación.
 */
export interface ISindicato extends Document {
    externalId: string;
    name: string;
    /** Sigla con la que se lo conoce (UOCRA, SATSAID). Es como se lo busca y como se lo nombra. */
    sigla?: string;
    data: {
        id: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const Sindicato: Model<ISindicato>;
