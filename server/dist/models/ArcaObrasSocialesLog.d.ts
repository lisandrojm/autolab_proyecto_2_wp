import { Document, Model, Types } from "mongoose";
/**
 * Registro de cada corrida de validación de obras sociales contra ARCA.
 *
 * NO SE REUSÓ `AfipLog` aunque las dos sean «cosas de ARCA»: aquel modela un llamado a un webservice
 * —un CUIT consultado, un estado activo/inactivo, un faultCode de SOAP— y esto es una corrida sobre
 * varias personas, con un resultado por cada una. Meterlo ahí obligaba a dejar la mitad de los campos
 * vacíos y a inventarle significados a los otros, que es como un log deja de servir para auditar.
 *
 * POR QUÉ SE GUARDA EL DETALLE POR PERSONA
 *
 * La obra social que se guarda es un dato que después se declara ante el organismo, y queda fija. Si
 * alguna vez hay que responder «¿de dónde salió el 113809 de esta persona?», la respuesta tiene que
 * existir en algún lado: acá queda qué devolvió ARCA, para quién y qué día. Sin eso, el único rastro
 * es el valor final, que no dice quién ni cuándo lo puso.
 *
 * TTL de 30 días, igual que `AfipLog`: es un log operativo para entender qué pasó, no el archivo
 * permanente del trámite — ese vive en el contrato, con su fecha de constatación.
 */
export interface IArcaObrasSocialesLog extends Document {
    tenantId: Types.ObjectId;
    /** Empleadora contra la que se corrió: la validación es por CUIT y mezclarlas no se puede. */
    empresaId?: Types.ObjectId;
    empresaRazonSocial?: string;
    empresaCuit?: string;
    /** Quién la disparó. */
    usuarioId?: Types.ObjectId;
    total: number;
    /** Cuántas personas ARCA contestó con un código de obra social. */
    validadas: number;
    /**
     * Cuántas quedaron efectivamente guardadas en WeProdu.
     *
     * Es un número distinto de `validadas` y por eso están los dos: ARCA puede contestar y el dato no
     * guardarse igual —la persona no tiene contrato en esa empleadora, ya estaba validada con candado,
     * el código no está en el catálogo—. Con un solo número, esa diferencia se vuelve invisible y la
     * pregunta «ARCA me lo devolvió, ¿por qué no lo veo?» no tiene respuesta.
     */
    guardadas: number;
    /** ARCA contestó que no tienen afiliación propia: rige la del convenio. Es una respuesta, no un error. */
    sinDeclarar: number;
    errores: number;
    faltaron: number;
    /** Por qué faltaron. Vacío cuando no faltó nadie. */
    motivo?: string;
    /** `true` si hubo que iniciar sesión; `false` si alcanzó con la sesión guardada. */
    seLogueo: boolean;
    duracionMs: number;
    /** Si la corrida entera se cayó (no pudo abrir el navegador, no pudo entrar a ARCA…). */
    error?: string;
    detalle: Array<{
        cuil: string;
        rnos?: string;
        error?: string;
    }>;
    /** Nombres que se corrigieron con los de ARCA durante esta corrida. */
    renombrados: Array<{
        cuil?: string;
        antes: string;
        ahora: string;
    }>;
    createdAt: Date;
}
export declare const ArcaObrasSocialesLog: Model<IArcaObrasSocialesLog>;
