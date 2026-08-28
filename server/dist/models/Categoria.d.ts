import mongoose, { Document, Model } from "mongoose";
/**
 * Categoría profesional de un Convenio Colectivo (pos. 101-106 del TXT de alta de ARCA).
 *
 * Reemplaza a `CategoriaSat`, cuyo nombre describía un caso particular como si fuera la regla: esa
 * tabla era, literalmente, las 106 categorías del convenio **0634/11 — SAT (Televisión)**. De ahí el
 * "SAT". Los demás convenios tienen las suyas, con códigos de otros rangos (0131/75 tiene 219,
 * 0322/75 tiene 4, etc.), y no había dónde cargarlas.
 *
 * La jerarquía es:
 *
 *   Convenio (catálogo `convenios`)
 *     └── ConvenioGrupo   ← acá vive la ESCALA SALARIAL
 *           └── Categoria ← acá solo el código de ARCA y el nombre
 *
 * La categoría PUEDE llevar sueldo propio: en los convenios donde ARCA no publica grupos (actores) no
 * hay de dónde heredarlo. Con grupo, la escala vive en el grupo. Ver `escalaDeCategoria`.
 */
export interface ICategoria extends Document {
    /** Código del CCT al que pertenece, formato ARCA ("0634/11"). Redundante con el grupo, pero
     *  explícito a propósito: no se depende de que el código de categoría sea único entre convenios
     *  (lo es en los 5 convenios relevados, pero eso no está garantizado en general).
     *
     *  OBLIGATORIO: una categoría sin convenio no es un dato válido en ARCA — el combo `l_CatCCT` no
     *  tiene un nivel "sin convenio", siempre viene filtrado por CCT. Las que quedaron así ("Actor",
     *  "Musico") son datos rotos heredados de FRAME, no un caso legítimo con el que se pueda convivir. */
    convenio: string;
    /**
     * Grupo salarial al que pertenece. OPCIONAL: ARCA no publica grupo en todos los convenios.
     *
     * El nomenclador nombra las categorías de TRES formas y solo una tiene grupo:
     *
     *   A · la categoría trae el grupo      0634/11   «035283 - DIRECTOR DE PROGRAMAS - GRUPO 1»
     *   B · no hay grupo en ningún lado     0322/75   «032564 - TIRA»
     *   C · la categoría ES el grupo        0131/75   «036371 - GRUPO SALARIAL 1»
     *
     * Exigirlo fue lo que obligó a inventar grupos donde ARCA no los publica: en los convenios de
     * actores se creó un grupo por categoría, y en 0131/75 el prefijo «1ª CATEGORIA» —que es la
     * categoría de la emisora, no una escala— se tomó como grupo. Quedaron 73 grupos donde hay 12.
     */
    grupoId?: mongoose.Types.ObjectId | null;
    /**
     * Escala propia de ESTA categoría, para los convenios sin grupo (modelo B).
     *
     * Cuando hay grupo la escala vive ahí y estos quedan en 0: varias categorías comparten la misma
     * paritaria y duplicarla por categoría es garantizar que se desincronicen en la próxima
     * actualización. La regla de cuál gana está en UN solo lugar: `escalaDeCategoria`.
     */
    sueldoBasico?: number;
    sueldoAdicional?: number;
    presentismo?: number;
    sueldoBruto?: number;
    sueldoBrutoLetras?: string;
    neto?: number;
    sueldoNetoLetras?: string;
    /** Fecha de VIGENCIA de la paritaria, no de carga. */
    fechaActualizacion?: Date | string;
    /**
     * Código de categoría de ARCA, SIEMPRE con 6 dígitos y ceros a la izquierda ("035283", no "35283").
     * Se guarda canónico —como lo escribe ARCA— para que comparar contra un export del organismo sea
     * directo. El TXT lo usa tal cual.
     *
     * OBLIGATORIO y validado: "0" y "" no son códigos, son la marca de una fila que FRAME inventó.
     * Un contrato con una categoría así no puede generar el alta (`categoriaProf` queda vacío y
     * `buildAltaRecord` devuelve null), así que dejar entrar el dato solo posterga el error.
     */
    codigoArca: string;
    /** Nombre de la categoría, sin el sufijo "- GRUPO N" que ARCA le agrega en la descripción. */
    nombre: string;
    /** Descripción completa tal como viene de ARCA, para poder cotejar contra el organismo. */
    descripcionArca?: string;
    /** `data.id` de la tabla vieja `categorias-sat`, para no romper las FK existentes (ver migración). */
    legacyId?: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Categoria: Model<ICategoria>;
