import mongoose, { Document, Model } from "mongoose";
/**
 * La escala salarial de un grupo EN UN PERÍODO DE VIGENCIA.
 *
 * `ConvenioGrupo` guarda un solo juego de importes por grupo: la última paritaria pisa la anterior y el
 * historial se pierde. Alcanzaba mientras la pregunta fuera "¿cuánto se paga hoy?", pero no para
 * "¿cuánto se pagaba el 15 de mayo?", que es la que hay que responder para liquidar un contrato viejo,
 * para cotejar un acta contra lo que se pagó, o simplemente para cargar dos tramos de un acuerdo
 * escalonado —abril y junio de 2026— sin que uno borre al otro.
 *
 * POR QUÉ UNA COLECCIÓN APARTE Y NO UN ARRAY DENTRO DE `ConvenioGrupo`
 *
 * Ese documento lo leen todas las pantallas de ARCA, el alta de contratos y los PDFs. Meterle el
 * historial adentro lo engorda para todos los que sólo quieren el importe vigente, y sus campos de
 * fecha son `Mixed` por arrastre. Con una colección propia, el día 1 nada cambia de comportamiento:
 * `ConvenioGrupo` sigue siendo LO VIGENTE —el espejo— y acá vive la historia completa.
 *
 * La regla del espejo, que es la que no se puede romper: cuando se crea o edita el período vigente, sus
 * importes se copian a `ConvenioGrupo`. Así "aplicar paritaria" sigue impactando en los contratos y en
 * los PDFs igual que cuando se editaba la escala a mano.
 *
 * QUÉ SE GUARDA Y POR QUÉ ES REDUNDANTE A PROPÓSITO
 *
 * `basico` (A) y `adicionalPct` (B) son los datos de origen. `adicionalMonto`, `presentismoMonto`,
 * `total` y `neto` son **los importes que RIGEN**: el del acta cuando el acta lo publica, el calculado
 * cuando no (ver `utils/escalaCalculo.ts`). Los del acta se guardan además en `acta*`, y `diferencias`
 * deja asentado en qué se apartan de la cuenta.
 *
 * Esa redundancia existe porque a veces el acta NO cierra con su propia cuenta: en junio 2026 el grupo 8
 * declara un centavo de más y el grupo 12 uno de menos. El importe que se paga es el del acta; la cuenta
 * sirve para detectar el desvío y mostrarlo, nunca para corregirlo en silencio.
 */
export interface IEscalaPeriodo extends Document {
    /** Código del CCT, formato ARCA ("0634/11"). */
    convenio: string;
    /** Número de grupo. `null` para convenios sin grupos, donde la escala vive en la categoría. */
    grupo?: number | null;
    /** Referencia al grupo actual, cuando existe. Es comodidad, no la identidad: la identidad es (convenio, grupo, desde). */
    grupoId?: mongoose.Types.ObjectId | null;
    /** Para convenios sin grupos: la categoría a la que pertenece esta escala. */
    categoriaId?: mongoose.Types.ObjectId | null;
    /** Desde cuándo rige. Obligatorio: un período sin fecha de inicio no se puede ubicar en el tiempo. */
    desde: Date;
    /** Hasta cuándo, INCLUSIVE. Vacío = vigente, sin vencimiento declarado (que no es lo mismo que vencido). */
    hasta?: Date | null;
    /** A. */
    basico: number;
    /** B, en porcentaje (62,5 se guarda como 62.5). `null` = el convenio no usa % adicional. */
    adicionalPct?: number | null;
    /** 10 en 634/11. Se guarda por período porque es un dato del acuerdo, no una constante. */
    presentismoPct?: number | null;
    /** Factor bruto → neto. **A CONFIRMAR**: no figura en ninguna acta. */
    netoFactor?: number | null;
    /** C que rige: del acta si la hay, si no el calculado. */
    adicionalMonto: number;
    /** D que rige. */
    presentismoMonto: number;
    /** El bruto que rige. Calculado = A + C + D por la cadena exacta. */
    total: number;
    /** El neto que rige. Del acta cuando la hay; si no, el sugerido por el factor. */
    neto?: number | null;
    /** Los importes en letras, que usa el PDF del alta. */
    totalLetras?: string;
    netoLetras?: string;
    /** Lo que dice el acta, literal. Vacío = el acta no lo publica o no se cargó. */
    actaAdicionalMonto?: number | null;
    actaPresentismoMonto?: number | null;
    actaTotal?: number | null;
    actaNeto?: number | null;
    /** En qué se aparta el acta de la cuenta. Lo llena el server al guardar, con `compararConActa`. */
    diferencias?: Array<{
        campo: string;
        calculado: number;
        acta: number;
        delta: number;
    }>;
    /** De qué acuerdo/tramo salió este período. */
    acuerdoId?: mongoose.Types.ObjectId | null;
    /** Qué tramo del acuerdo, por su código ("2026-04", "2026-06"). */
    tramo?: string;
    /**
     * De dónde vino el dato. Es lo que permite revertir una carga sin tocar lo que cargó una persona:
     * `estado-actual` lo escribió la migración, `derivado` lo calculó un porcentaje y todavía nadie lo
     * confirmó contra el acta.
     */
    origen: "acta" | "excel" | "manual" | "estado-actual" | "derivado";
    /** Marca del script que lo insertó ("escalas-periodo-v1"), para poder revertir con exactitud. */
    migracion?: string;
    nota?: string;
    createdBy?: mongoose.Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}
export declare const EscalaPeriodo: Model<IEscalaPeriodo>;
