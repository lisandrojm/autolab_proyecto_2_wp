/**
 * QUÉ CONDICIÓN FISCAL TIENE UN CUIT, según lo que devuelve el padrón de ARCA.
 *
 * Función pura: recibe el `personaReturn` ya parseado y devuelve la condición derivada. No consulta
 * nada, no toca la base y no depende del web service que haya traído los datos —
 * `ws_sr_padron_a5` y `ws_sr_constancia_inscripcion` devuelven la misma forma— así que se puede
 * cambiar de proveedor sin tocar esta regla, y se puede testear sin ARCA.
 *
 * DOS COSAS QUE PARECEN ERRORES Y NO LO SON. ARCA contesta `errorMonotributo` cuando la persona no
 * es monotributista, y `errorRegimenGeneral` cuando no tiene régimen general, con el texto «no
 * cumple con las condiciones para enviar datos». Son la RESPUESTA, no una falla: los dos juntos
 * describen a un empleado en relación de dependencia, que es el caso más común en un padrón de
 * talentos. Tratarlos como error dejaría media base marcada como consulta fallida.
 */
export type TipoCondicionFiscal = "MONOTRIBUTO" | "RESPONSABLE_INSCRIPTO" | "EXENTO" | "NO_ALCANZADO" | "SIN_ACTIVIDAD" | "DESCONOCIDO";
export interface ImpuestoFiscal {
    id?: number;
    descripcion?: string;
    estado?: string;
    periodo?: string;
}
export interface CondicionFiscal {
    tipo: TipoCondicionFiscal;
    descripcion: string;
    /**
     * La clave está dada de baja en ARCA. NO corta la derivación: alguien puede ser monotributista y
     * tener la clave inactiva a la vez, y esconder una de las dos cosas es esconder justo la que hay
     * que resolver antes de facturar.
     */
    claveInactiva: boolean;
    tipoClave?: string;
    estadoClave?: string;
    monotributo: {
        categoriaId?: number;
        categoria?: string;
        descripcionCategoria?: string;
        periodo?: string;
        actividadPrincipal?: {
            id?: number;
            descripcion?: string;
            nomenclador?: number;
            orden?: number;
        };
    } | null;
    regimenGeneral: {
        impuestos: ImpuestoFiscal[];
        actividades: Array<{
            id?: number;
            descripcion?: string;
            nomenclador?: number;
            orden?: number;
        }>;
        categoriaAutonomo: {
            id?: number;
            descripcion?: string;
            periodo?: string;
        } | null;
    } | null;
    /** Presente solo si la consulta no se pudo completar (timeout, servicio sin autorizar, etc.). */
    error?: string;
    consultadoEn: string;
    fuente: string;
}
export interface OpcionesDerivacion {
    /** Qué web service trajo los datos. Va en la respuesta para poder auditar de dónde salió. */
    fuente?: string;
    /** Momento de la consulta. Se inyecta para que los tests no dependan del reloj. */
    consultadoEn?: Date;
}
/**
 * Deriva la condición fiscal desde `personaReturn`.
 *
 * El orden de las reglas es el que importa y no es alfabético: monotributo gana sobre régimen
 * general porque quien está en monotributo puede tener bloques de régimen general viejos, y lo que
 * define cómo factura hoy es el monotributo.
 */
export declare function derivarCondicionFiscal(personaReturn: any, opts?: OpcionesDerivacion): CondicionFiscal;
/** La condición que corresponde cuando la consulta fiscal no se pudo hacer. Ver §4.2: nunca un 500. */
export declare function condicionFiscalFallida(motivo: string, opts?: OpcionesDerivacion): CondicionFiscal;
