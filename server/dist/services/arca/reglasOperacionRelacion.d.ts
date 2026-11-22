/**
 * LAS REGLAS DE LAS TRES OPERACIONES SOBRE UNA RELACIÓN LABORAL EN ARCA (20/11/2026), puras: baja, modificación y
 * anulación. Reciben el contrato, lo que el espejo de Relaciones Laborales sabe y lo que se pide, y devuelven un
 * PLAN: si se puede mandar, por qué no, los avisos, y el payload exacto que iría a ARCA. Sin base ni navegador,
 * para probarlas campo por campo (`reglasOperacionRelacion.test.ts`).
 *
 * Son tres trámites distintos y acá se tratan por separado: cada uno con sus prerrequisitos, su idempotencia y
 * sus plazos. Lo que ARCA decide por su cuenta (habilitar o no el ícono, rechazar por plazo) no se adivina: acá
 * se AVISA («ARCA puede observarla») y el motor lo confirma leyendo la pantalla.
 *
 * IDEMPOTENCIA. No se manda dos veces lo mismo: una marca `presentada`, `presentando` o `indeterminado` de la misma
 * operación traba; y si el espejo ya muestra el resultado (la baja con esa fecha, los valores pedidos), tampoco se
 * manda. El espejo se sincroniza una vez por día: la lectura definitiva la hace el motor en vivo, antes de operar.
 */
export type TipoOperacion = "baja" | "modificacion" | "anulacion";
export declare const NOMBRE_OPERACION: Record<TipoOperacion, string>;
/** Los campos que el motor sabe modificar en `ModificaAlta.aspx` (ver `CAMPOS_MODIFICACION` en el motor). */
export declare const CAMPOS_MODIFICABLES: readonly ["fechaInicio", "fechaFin", "obraSocial", "modalidadContrato", "situacionRevista", "sucursal", "actividad", "convenio", "categoria", "puesto", "tipoServicio", "retribucion", "modalidadLiquidacion"];
export type CampoModificable = (typeof CAMPOS_MODIFICABLES)[number];
export declare const ETIQUETA_CAMPO: Record<CampoModificable, string>;
/** Código de ARCA de «Renuncia del trabajador / ART.240 - LCT»: la única situación que lleva fecha de telegrama. */
export declare const SITUACION_RENUNCIA = "21";
/** Plazo de la RG 2988 para informar la baja: dentro de los 5 días corridos del cese. Aviso, no bloqueo: lo decide ARCA. */
export declare const DIAS_PLAZO_BAJA = 5;
export interface MarcaOperacion {
    resultado?: string;
    fecha?: string | Date;
    que?: string;
    motivo?: string;
    acuse?: {
        cbt?: string;
        cat?: string;
        nroTransaccion?: string;
    };
    payload?: Record<string, unknown>;
}
/** Lo que las reglas necesitan del contrato. */
export interface ContratoParaOperar {
    /** El trámite del tipo (`alta_temprana_afip`…): un Servicios no tiene relación en ARCA. Sin resolver, no se mira. */
    tramite?: string | null;
    estadoContrato?: string | null;
    cuil: string;
    empresaCuit: string;
    /** "YYYY-MM-DD" */
    alta: string;
    baja: string;
    altaArcaPresentada?: {
        resultado?: string;
        cat?: string;
        via?: string;
    } | null;
    bajaArcaPresentada?: MarcaOperacion | null;
    modificacionArcaPresentada?: MarcaOperacion | null;
    anulacionArcaPresentada?: MarcaOperacion | null;
}
/** La relación en el espejo de Relaciones Laborales (`relaciones_laborales_arca`), ya con fechas ISO. */
export interface RelacionEspejo {
    inicio: string;
    fin: string;
    situacionBaja: string;
    modalidad?: string;
    retribucion?: number | null;
    obraSocial?: string;
    sincronizadoEl?: string;
}
export interface DatosBaja {
    /** "YYYY-MM-DD". Si no viene, la fecha de baja del contrato. */
    fechaFin?: string;
    situacionBaja: string;
    fechaTelegrama?: string;
}
export interface DatosModificacion {
    cambios: Partial<Record<CampoModificable, string | number>>;
    /** El texto de la obra social, que no tiene catálogo en la pantalla. */
    obraSocialTexto?: string;
}
export interface DatosAnulacion {
    que: "alta" | "baja";
}
export type DatosOperacion = DatosBaja | DatosModificacion | DatosAnulacion;
export interface PlanOperacion {
    op: TipoOperacion;
    /** Se puede mandar tal como está. */
    puede: boolean;
    /** Por qué no, si no se puede. */
    motivo: string;
    /** Lo que conviene saber antes de confirmar: plazos, diferencias con el contrato, lo que ARCA puede observar. */
    avisos: string[];
    /** Exactamente lo que se le va a escribir a ARCA (fechas ISO, códigos como texto). */
    payload: Record<string, unknown>;
}
/** Una marca que traba volver a mandar la misma operación. */
export declare const marcaTraba: (m?: MarcaOperacion | null) => boolean;
export declare function planDeBaja(c: ContratoParaOperar, espejo: RelacionEspejo | null, datos: DatosBaja, hoy: string, catalogo?: Map<string, string>): PlanOperacion;
export declare function planDeModificacion(c: ContratoParaOperar, espejo: RelacionEspejo | null, datos: DatosModificacion, hoy: string): PlanOperacion;
export declare function planDeAnulacion(c: ContratoParaOperar, espejo: RelacionEspejo | null, datos: DatosAnulacion, hoy: string): PlanOperacion;
export declare function planDeOperacion(op: TipoOperacion, c: ContratoParaOperar, espejo: RelacionEspejo | null, datos: DatosOperacion, hoy: string, catalogo?: Map<string, string>): PlanOperacion;
/**
 * DE QUÉ LADO ESTUVO EL PROBLEMA cuando el motor tiró: `regla_arca` si ARCA lo rechazó o no lo habilita (el motor
 * lo marca con `reglaArca`), `navegacion` para todo lo demás (sesión caída, pantalla que no es, ARCA que no
 * contesta, timeout). Lo segundo se puede reintentar sin tocar nada; lo primero no cambia por reintentar.
 */
export declare function claseDeFallo(e: any): "regla_arca" | "navegacion";
