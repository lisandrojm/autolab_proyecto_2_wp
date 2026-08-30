import mongoose, { Document, Model } from "mongoose";
/**
 * Un PDF detectado en una fuente. INMUTABLE: lo que se vio, se vio.
 *
 * Esta entrega solo DETECTA. No abre el PDF, no lee importes y no toca ninguna escala: guarda que
 * apareció algo, dónde, y con qué texto figuraba. Extraer los números es otra cosa y viene después.
 */
export interface IPublicacionParitaria extends Document {
    fuente: mongoose.Types.ObjectId;
    url: string;
    /** Cómo figuraba en la página: "ACUERDO SALARIAL 2025-2026 (PERIODO FEBRERO A JUNIO 2026)". */
    textoEnlace: string;
    /**
     * Hash del CONTENIDO del PDF.
     *
     * Es lo que distingue «el mismo archivo de siempre» de «reemplazaron el archivo sin cambiarle el
     * nombre», que es como los organismos corrigen un acuerdo. Con la URL sola, esa corrección pasaría
     * inadvertida.
     */
    hash: string;
    detectadaEl: Date;
    /**
     * Ya la miró alguien. Se marca a mano.
     *
     * La primera revisión de una fuente nace con esto en `true` para TODO lo que encuentre: es la línea
     * de base, no una novedad. Ver `ultimaRevision` en `FuenteParitaria`.
     */
    vista: boolean;
    /** `descartada` = alguien decidió que no era una escala. No se borra: se deja el rastro. */
    estado: "detectada" | "descartada";
    createdAt: Date;
    updatedAt: Date;
}
export declare const PublicacionParitaria: Model<IPublicacionParitaria>;
