import mongoose, { Document, Model } from "mongoose";
/**
 * Convenio Colectivo de Trabajo (CCT) del nomenclador de AFIP/ARCA — Simplificación Registral.
 *
 * Sigue la forma de los catálogos simples de FRAME, con estos nombres de dominio:
 *   externalId → código CCT, con el formato "NNNN/AA" (ej. "0130/75"). NO es numérico: lleva barra
 *                y ceros a la izquierda, así que se guarda tal cual como string y `data.id` queda
 *                vacío (a diferencia de Obras Sociales, donde el RNOS sí es un número).
 *   name       → descripción de la actividad.
 *   signatario → descripción de los signatarios del convenio.
 */
export interface IConvenio extends Document {
    externalId: string;
    name: string;
    signatario?: string;
    /**
     * Obra social que le corresponde a quien trabaja bajo este convenio. Guarda el `data.id` del
     * catálogo de Obras Sociales (el RNOS numérico), igual que `osId` en el contrato.
     *
     * **Cuelga del convenio y no de la empleadora porque así funciona en la Argentina**: la obra social
     * la define el sindicato, y al sindicato lo define el CCT. Quien está bajo el convenio de
     * televisión aporta a la O.S. del Personal de Televisión, sin importar qué productora lo contrate.
     *
     * Vacío = el convenio no tiene obra social sindical. El caso real es "9999/99 — EXCLUIDO DE
     * CONVENIO", que por definición no tiene sindicato: ahí manda la default de la empleadora.
     */
    obraSocialDefaultId?: number;
    /**
     * EL SINDICATO QUE FIRMÓ ESTE CONVENIO. Ref al catálogo `Sindicato`.
     *
     * La relación se guarda ACÁ y no como una lista de convenios en el sindicato: es N:1 —SATSAID
     * firma el 0131/75 y el 0634/11— y del lado del convenio hay un solo valor que mantener. Un array
     * del otro lado sería el mismo dato escrito dos veces, con la posibilidad de que discrepen.
     *
     * `null` es un valor legítimo y FRECUENTE, no un pendiente: el 9999/99 «EXCLUIDO DE CONVENIO» no
     * tiene gremio por definición, y de los 2.669 la enorme mayoría nombra seccionales provinciales y
     * gremios de empresa que no están en el maestro de 180. Se completa cuando una empresa registra el
     * convenio y hay alguien que sabe cuál es el gremio; nunca por inferencia sobre `signatario`.
     */
    sindicatoId?: mongoose.Types.ObjectId | null;
    /**
     * Co-firmantes, cuando del lado laboral firmó más de una entidad.
     *
     * Existe porque el caso es real, pero es la excepción: por eso van aparte y no reemplazan a
     * `sindicatoId` por un array. Con N:M pura, «el sindicato de este convenio» —que es la pregunta
     * que se hace todo el tiempo— dejaría de tener una respuesta y habría que elegir una de la lista
     * en cada consumidor, cada uno con su propio criterio. Se guarda y se lee; hoy no tiene UI.
     */
    sindicatosAdicionalesIds?: mongoose.Types.ObjectId[];
    /**
     * DÓNDE PUBLICA SUS PARITARIAS ESTE CONVENIO — la parte que se declara a mano.
     *
     * El estado completo tiene cuatro valores y solo tres se guardan acá. El cuarto, `con_fuente`, es
     * DERIVADO: sale de que exista una `FuenteParitaria` que liste este código. No se guarda a
     * propósito — un booleano copiado se queda viejo apenas alguien desasigna la última fuente, y a
     * partir de ahí la pantalla afirmaría que está vigilado cuando no lo está.
     *
     *   sin_revisar          nadie buscó todavía. Es el default de los 2.669.
     *   sin_fuente_conocida  se buscó y no hay página que publique sus acuerdos.
     *   no_aplica            no tiene paritaria y no la va a tener (9999/99 «Excluido de convenio»).
     *
     * La diferencia entre los dos primeros es la que hace que esto valga la pena: «buscamos y no hay
     * nada» es conocimiento durable que le ahorra la búsqueda a la próxima persona. Una celda vacía no
     * distingue entre las dos y obliga a rehacer el trabajo.
     *
     * Es una propiedad del CONVENIO y no de quien lo usa: que el 0131/75 se publique en satsaid.com.ar
     * es verdad para cualquier empleadora de la plataforma. Por eso vive acá y no en `Company`.
     */
    fuenteEstadoDeclarado?: "sin_revisar" | "sin_fuente_conocida" | "no_aplica";
    /** Qué se buscó y por qué se concluyó eso. Es lo que evita repetir la búsqueda. */
    fuenteNota?: string;
    /** Quién lo declaró. Sin esto, «no hay fuente» no se puede preguntar a nadie. */
    fuenteRevisadaPor?: string;
    fuenteRevisadaEl?: Date;
    data: {
        id?: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const Convenio: Model<IConvenio>;
