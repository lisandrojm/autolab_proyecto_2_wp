import { Document, Types } from "mongoose";
/**
 * UNA RELACIÓN LABORAL TAL COMO LA TIENE ARCA (Simplificación Registral), por empleadora.
 *
 * Es la copia local del listado de «Consultas de Relaciones Laborales»: lo que ARCA sabe de cada
 * alta y cada baja de las empresas del tenant, desde 2010. Con esto se calcula la antigüedad de
 * cada persona (`AntiguedadArca`) sin ir a ARCA cada vez. Entra por dos caminos, los dos con el
 * mismo parser (`compartido/arca/relacionesLaboralesTxt.ts`): el seed desde los TXT que ya están
 * en Dropbox (`origen: "seed-dropbox"`) y la sincronización incremental que consulta ARCA por los
 * movimientos del mes (`origen: "sync"`).
 *
 * CLAVE NATURAL: (tenantId, empleadoraCuit, cuil, fechaInicio), con índice único. El TXT NO trae el
 * identificador de la relación (la C.A.T. sólo la muestra la pantalla por CUIL), así que la terna
 * persona + empresa + fecha de inicio es lo que identifica la relación en la práctica: una persona
 * no empieza dos veces el mismo día con la misma empleadora.
 *
 * LO QUE SE VIO EN LOS DATOS (182 TXT, 13.753 filas, 2010–2026, `scripts/diagRelacionesEnDropbox.ts`):
 * 28 ternas aparecen dos veces con contenido distinto, y en 26 la modalidad y el puesto son iguales;
 * lo que cambia es la FECHA DE FIN (30/04/2023 → 31/07/2023) o la retribución. Son VERSIONES de la
 * misma relación —un plazo fijo prorrogado, un sueldo actualizado—, no dos relaciones. Por eso la
 * clave no se extiende: la versión más nueva reemplaza a la anterior (`utils/versionRelacionArca.ts`
 * decide cuál es la más nueva), y `cantidadContratos` cuenta relaciones, no versiones.
 *
 * UNA BAJA NO ES UNA RELACIÓN NUEVA. Cuando ARCA informa la baja, la misma terna vuelve a aparecer en
 * el listado con FECHA DE FIN y SITUACION De BAJA cargadas: el upsert por clave natural ACTUALIZA la
 * relación que ya existía. Insertar sería duplicar la antigüedad.
 *
 * Los textos se guardan como los escribe ARCA, acentos incluidos; donde ARCA perdió un carácter queda
 * U+FFFD (ver el parser). `rawLinea` es la fila entera del TXT, para auditar contra la fuente.
 */
export type OrigenRelacionArca = "seed-dropbox" | "sync";
export interface IRelacionLaboralArca extends Document {
    tenantId: Types.ObjectId;
    /** 11 dígitos, sin guiones. */
    empleadoraCuit: string;
    /** La `Company` con ese CUIT, si existe. Informativo: la clave es el CUIT. */
    empleadoraCompanyId?: Types.ObjectId | null;
    /** 11 dígitos. */
    cuil: string;
    apellidoNombre: string;
    obraSocial: string;
    modalidadContrato: string;
    actividadLaboral: string;
    puestoDesempenado: string;
    retribucionPactada: number | null;
    modLiquidacion: string;
    trabajadorAgropecuario: boolean;
    /** Medianoche UTC del día de inicio (el TXT trae sólo la fecha). */
    fechaInicio: Date;
    /** `null` = la relación sigue abierta. */
    fechaFin: Date | null;
    situacionBaja: string;
    convenioColectivo: string;
    categoria: string;
    tipoServicio: string;
    origen: OrigenRelacionArca;
    /** Cuándo se leyó por última vez de ARCA (o del TXT) esta fila. */
    sincronizadoEl: Date;
    rawLinea: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const RelacionLaboralArca: import("mongoose").Model<IRelacionLaboralArca, {}, {}, {}, Document<unknown, {}, IRelacionLaboralArca, {}, {}> & IRelacionLaboralArca & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default RelacionLaboralArca;
