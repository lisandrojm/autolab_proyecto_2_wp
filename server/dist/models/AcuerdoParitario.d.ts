import mongoose, { Document, Model } from "mongoose";
/**
 * EL ACTA: quién firmó qué, cuándo, con qué porcentajes y en qué expediente.
 *
 * Es el documento del que cuelga todo lo demás. Cada `EscalaPeriodo`, cada valor de adicional y cada fila
 * de pequeñas empresas puede apuntar acá, y así se puede responder "¿de dónde salió este importe?" con
 * el expediente y el PDF en la mano, en lugar de "alguien lo cargó en julio".
 *
 * TAMBIÉN CIERRA UN AGUJERO VIEJO: el módulo de paritarias detecta los PDF publicados (`PublicacionParitaria`)
 * pero no había ningún vínculo en la base entre esa publicación y la escala que se aplicó. `publicacionParitariaId`
 * es ese vínculo.
 *
 * LOS TRAMOS SON UNA LISTA, NO UN PORCENTAJE
 *
 * Un acuerdo moderno casi nunca es "+14,76 %": el de 634/11 son dos tramos escalonados y acumulativos
 * (+9,5 % en abril sobre marzo y +4,8 % en junio sobre mayo) y además un RÉGIMEN ALTERNATIVO para las
 * productoras chicas y los canales del interior, con otro escalonamiento y una absorción en el medio. Un
 * solo campo de porcentaje no puede representar eso, y "el total" es información derivada: se calcula con
 * `porcentajeAcumulado`, no se guarda.
 */
export interface ITramoParitario {
    /** Código corto para referenciarlo desde los períodos ("2026-04", "2026-06"). */
    codigo: string;
    /** Desde cuándo rige el tramo. */
    desde: Date;
    /** El aumento del tramo. */
    porcentaje: number;
    /** Sobre qué mes se calcula, en palabras del acta ("marzo 2026"). Es la base, y sin ella el % no significa nada. */
    base?: string;
    /** La misma base, como fecha, cuando se la puede resolver. */
    baseDesde?: Date | null;
    /** `true` = se aplica sobre el resultado del tramo anterior. */
    acumulativo: boolean;
    /** `general` o el régimen para las pequeñas productoras y los canales del interior (art. 3.2). */
    regimen: "general" | "alternativo";
    /** Qué tramo anterior absorbe este ("2026-04"), cuando el acta lo dice. */
    absorbe?: string;
    nota?: string;
}
export interface IAcuerdoParitario extends Document {
    /** Los CCT alcanzados. 634/11 viene articulado con 131/75: el básico sale de uno y el % del otro. */
    convenios: string[];
    /** Las partes que firman ("ATA", "CAPIT", "SATTSAID"). */
    partes: string[];
    /** Nombre para mostrar ("Paritaria 2025-2026, 2.º tramo"). */
    titulo: string;
    /** El período paritario completo (octubre 2025 – septiembre 2026), que no es lo mismo que el tramo. */
    periodoParitario?: {
        desde?: Date | null;
        hasta?: Date | null;
    };
    /** Expediente ("RE-2026-43103223-APN-DTD#JGM"). Es el identificador real del acta ante el ministerio. */
    expediente?: string;
    firmadoEl?: Date | null;
    /** Estado de homologación. `a_confirmar` es el default: que no figure en el acta es lo normal. */
    homologacion?: {
        estado: "a_confirmar" | "sin_homologar" | "en_tramite" | "homologado";
        resolucion?: string;
        fecha?: Date | null;
    };
    tramos: ITramoParitario[];
    /** Cláusula de absorción (art. 4): el texto, más el flag de si aplica. */
    clausulaAbsorcion?: {
        texto?: string;
        aplica: boolean;
    };
    /**
     * El régimen alternativo y las empresas que se le asignaron.
     *
     * Las empresas van acá y no en `Company` porque la asignación es del ACUERDO: "estas productoras
     * convinieron el régimen del art. 3.2 de esta acta". Puesto en la empresa, sería un flag suelto que
     * nadie sabría a qué acta corresponde, y habría que migrarlo en la paritaria siguiente.
     */
    regimenAlternativo?: {
        descripcion?: string;
        empresaIds: mongoose.Types.ObjectId[];
    };
    /** La publicación del módulo de paritarias de la que salió, si se detectó ahí. */
    publicacionParitariaId?: mongoose.Types.ObjectId | null;
    /** El PDF del acta, guardado como los de paritarias: en disco, servido por endpoint autenticado. */
    archivo?: {
        ruta?: string;
        nombreOriginal?: string;
        contentType?: string;
        bytes?: number;
        subidoEl?: Date | null;
    };
    isActive: boolean;
    migracion?: string;
    createdBy?: mongoose.Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}
export declare const AcuerdoParitario: Model<IAcuerdoParitario>;
