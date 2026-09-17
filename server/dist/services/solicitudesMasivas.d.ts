import { Types } from "mongoose";
/** La hoja que se completa y la que guarda los catálogos (la segunda no se toca). */
export declare const HOJA_DATOS = "Solicitudes";
export declare const HOJA_CATALOGOS = "Cat\u00E1logos";
/** Hasta cuántas filas se aceptan de una. Más que esto es un import de sistema, no una carga. */
export declare const MAX_FILAS = 300;
/** Compara textos como los escribe la gente: sin acentos, sin mayúsculas y sin espacios de más. */
export declare const clave: (v: unknown) => string;
/** Sólo los dígitos: un CUIL se escribe «20-12345678-3», «20123456783» o con espacios. */
export declare const soloDigitos: (v: unknown) => string;
export interface ColumnaPlantilla {
    /** La clave con la que viaja al validador. */
    key: string;
    /** El encabezado, tal cual se escribe en la planilla. Es el contrato con el archivo. */
    header: string;
    /** Ancho de la columna en el Excel. */
    ancho: number;
    /** Se marca en el encabezado y lo exige el validador (salvo que dependa de otra cosa). */
    obligatorio?: boolean;
    /** De qué catálogo salen los valores del desplegable. */
    catalogo?: keyof Catalogos;
    /** La nota que se lee al pararse en el encabezado. */
    ayuda: string;
}
export declare const COLUMNAS: ColumnaPlantilla[];
/** Una opción de desplegable: lo que se escribe en la planilla y con qué se resuelve. */
export interface OpcionCatalogo {
    /** El texto que va en la celda. */
    etiqueta: string;
    id: string;
    /** Datos extra que la validación cruzada necesita (el CCT de una categoría, por ejemplo). */
    extra?: Record<string, any>;
}
export interface Catalogos {
    proyectos: OpcionCatalogo[];
    areas: OpcionCatalogo[];
    turnos: OpcionCatalogo[];
    roles: OpcionCatalogo[];
    contratos: OpcionCatalogo[];
    convenios: OpcionCatalogo[];
    categorias: OpcionCatalogo[];
    empresas: OpcionCatalogo[];
    motivos: OpcionCatalogo[];
    siNo: OpcionCatalogo[];
}
/**
 * LOS CATÁLOGOS REALES DEL TENANT, los mismos que ofrece la pantalla.
 *
 * Se leen enteros y una vez por pedido: la plantilla los escribe en su hoja y el import los usa para
 * resolver cada celda. Los proyectos traen sus áreas y turnos poblados porque de ahí sale la única
 * validación que la planilla no puede hacer: que ese turno sea de esa área EN ESE proyecto.
 */
export declare const cargarCatalogos: (tenantId: Types.ObjectId) => Promise<{
    catalogos: Catalogos;
    proyectos: any[];
    turnosPorId: Map<string, any>;
    contratosPorId: Map<string, any>;
    tramitePorContrato: Map<string, string>;
}>;
/**
 * LA PLANILLA, con sus desplegables y sus catálogos adentro.
 *
 * Las listas apuntan a rangos de la hoja «Catálogos» del MISMO archivo: pegar los valores dentro de
 * la validación tiene un tope de 255 caracteres —dos docenas de proyectos ya no entran— y además
 * deja la lista congelada en el archivo, sin forma de ver de dónde salió.
 *
 * `allowBlank` va en true incluso en las obligatorias: Excel bloquearía la celda vacía mientras se
 * está completando la fila, y lo que se quiere frenar es un valor inventado, no una fila a medias.
 * Lo obligatorio lo exige el import, que puede explicar qué falta.
 */
export declare const construirPlantilla: (catalogos: Catalogos) => Promise<Buffer>;
/** Una fila cruda del archivo, con su número real de fila del Excel (la 1 son los encabezados). */
export interface FilaCruda {
    fila: number;
    valores: Record<string, string>;
}
/**
 * Las filas del archivo, mapeadas por ENCABEZADO y, si no matchea, por POSICIÓN.
 *
 * Por encabezado para que agregar una columna al final no rompa las planillas viejas; por posición
 * como red, porque alguien va a renombrar un título o va a pegar los datos en una planilla propia
 * con las columnas en el mismo orden.
 */
export declare const filasDelArchivo: (buffer: Buffer) => FilaCruda[];
export interface ErrorFila {
    fila: number;
    campo: string;
    motivo: string;
}
export interface FilaValidada {
    fila: number;
    /** Cómo se va a mostrar en la vista previa. */
    resumen: {
        nombre: string;
        cuil: string;
        proyecto: string;
        areaTurno: string;
        contrato: string;
        desde: string;
        hasta: string;
        personaNueva: boolean;
    };
    /** Todo lo resuelto, listo para crear la solicitud. */
    datos: any;
}
/**
 * VALIDA UNA FILA CONTRA LOS CATÁLOGOS Y CONTRA SÍ MISMA.
 *
 * El orden importa: primero se resuelve cada celda (existe / no existe) y recién después se cruzan
 * —el turno con el área del proyecto, la categoría con el convenio, la fecha de baja con el tipo de
 * contrato—. Una fila con el proyecto mal escrito no tiene sentido cruzarla: todo lo demás fallaría
 * por lo mismo y el informe diría cinco veces el mismo problema.
 */
export declare const validarFila: (cruda: FilaCruda, ctx: {
    catalogos: Catalogos;
    proyectos: any[];
    turnosPorId: Map<string, any>;
    usuariosPorCuil: Map<string, any>;
}) => {
    ok: FilaValidada | null;
    errores: ErrorFila[];
};
/**
 * CREA LA SOLICITUD DE UNA FILA, con la misma forma que manda la app.
 *
 * Es un `User` con `metadata.isSolicitud` —una solicitud no es una colección propia— y los mismos
 * campos que guarda `UserRegistrationModal`: el wizard de aprobación lee de ahí para precargarse, así
 * que una solicitud importada tiene que ser indistinguible de una pedida desde el teléfono.
 *
 * Si la persona no estaba, se crea primero su ficha: la solicitud queda atada a ella
 * (`solicitudUserId`) igual que cuando se elige a alguien registrado.
 */
export declare const crearSolicitud: (datos: any, tenantId: Types.ObjectId, creadaPor: string, rolPorDefecto?: Types.ObjectId | null) => Promise<{
    solicitudId: string;
    personaCreada: boolean;
}>;
