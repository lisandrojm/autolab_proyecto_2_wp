/**
 * BAJAS ARCA: LA LISTA (22/11/2026, pedido del usuario). El único lugar desde donde se da de baja una relación en
 * ARCA. Una fila por relación VIVA en ARCA (abierta, o con fin de hoy en adelante) sobre la que se puede operar, y
 * cada fila con exactamente UNA situación:
 *
 *   1. Terminado en WeProdu            el contrato tiene fecha de baja pasada y la relación sigue abierta en ARCA.
 *   2. Termina antes de su fecha       contrato a plazo cuya baja en WeProdu es anterior al fin que tiene ARCA.
 *   3. Baja presentada, sin confirmar  se mandó desde acá y no se leyó el resultado, o quedó en error de navegación.
 *   4. Sin contrato en WeProdu         ningún contrato con esa persona, empleadora y fecha de inicio. Incluye las
 *                                      que ARCA cierra sola (fin futuro): «ARCA la cierra sola» supone que hay un
 *                                      contrato, y acá no lo hay (Peralta Recio, Viggiano). La fila distingue
 *                                      «persona sin ficha en WeProdu» de «ficha sin contrato con esa alta».
 *   5. Indeterminado vigente           abierto de los dos lados. Inventario, no trabajo: no suma al total del menú.
 *
 * QUÉ NO ENTRA (y por qué, en `fuera`): relaciones cerradas; plazos vigentes que ARCA cierra sola; las que tienen
 * VARIOS contratos candidatos (van a Auditoría ARCA › «Relación con varios contratos»). Son dos cosas distintas:
 *   · `varios_contratos`: duplicados dentro del MISMO proyecto. Se anula el que sobra y la relación entra a la lista.
 *   · `varios_proyectos`: la misma relación cargada en VARIOS proyectos («agregar miembro»: Quinteiro, Yorio). No es
 *     un problema de datos sino una decisión que WeProdu modela mal, y se resuelve A MANO. La lista NO elige un
 *     contrato «principal»: la baja en ARCA quedaría atada a un proyecto arbitrario y el resto seguiría vigente.
 * Tampoco entran las que la regla compartida dice que no se operan (alta sin confirmar o
 * anulada); y las que ya tienen la baja presentada y confirmada (falta que la sincronización la traiga cerrada).
 * Servicios y anulados no cuentan como contrato de ninguna relación (`relacionesOperables.ts`).
 *
 * SOBRE EL ORDEN: la 3 se mira ANTES que la 1 y la 2. Una baja que se mandó y quedó sin confirmar casi siempre es de
 * un contrato que ya terminó: si ganara la 1, la fila diría «Terminado en WeProdu» con el botón «Dar de baja», como
 * si nadie hubiera mandado nada. La lista igual se ordena 1 a 5.
 *
 * «Se puede operar» lo decide la regla de siempre, `compartido/arca/relacionParaOperar.ts` (vía
 * `relacionesOperables`): la misma que usa el panel.
 *
 * LA FOTO DE LAS 06:00 (`guardarCorridaBajasArca`): después de cada sincronización automática se guardan los conteos
 * por situación y qué relación está en cuál, como hace la Auditoría con sus totales. Y contra la foto anterior se
 * anota quién entró, quién salió y quién cambió de situación: un número que cambia tiene que poder explicarse.
 */
import { Types } from "mongoose";
import { type ContratoDeRelacion, type RelacionOperable } from "./relacionesOperables.js";
export type SituacionBajaArca = 1 | 2 | 3 | 4 | 5;
export declare const SITUACIONES_BAJA_ARCA: Record<SituacionBajaArca, string>;
export type MotivoFuera = "cerrada" | "varios_contratos" | "varios_proyectos" | "plazo_vigente" | "baja_presentada" | "no_se_opera";
export declare const MOTIVOS_FUERA: Record<MotivoFuera, string>;
export interface MarcaDeBaja {
    resultado?: string;
    clase?: string;
    fecha?: unknown;
}
/** La baja se mandó y no se sabe cómo quedó (`presentando`, `indeterminado`), o el intento murió navegando. */
export declare const bajaSinConfirmar: (m?: MarcaDeBaja | null) => boolean;
export interface DatosParaSituacion {
    /** `estadoDeRelacion`: sólo entran `abierta` y `fin_futuro`. */
    estado: string;
    finArca: string;
    /** Cuántos contratos de WeProdu tiene la relación (sin anulados ni Servicios). */
    contratos: number;
    /** En cuántos proyectos (vínculos) distintos están esos contratos. */
    proyectos: number;
    /** La regla compartida dice que hay algo que operar. */
    puede: boolean;
    /** La baja del contrato en WeProdu ("" = sin baja). Sólo con UN contrato. */
    bajaContrato: string;
    /** La marca de la baja presentada desde WeProdu (la del contrato; sin contrato, la del registro de operaciones). */
    baja: MarcaDeBaja | null;
}
/** LA SITUACIÓN DE UNA RELACIÓN, o por qué no entra en la lista. Pura: es lo que se prueba. */
export declare function situacionDeBaja(d: DatosParaSituacion, hoy: string): {
    situacion: SituacionBajaArca;
    fuera: null;
} | {
    situacion: null;
    fuera: MotivoFuera;
};
export interface FilaBajaArca {
    clave: string;
    empleadoraCuit: string;
    empleadora: string;
    cuil: string;
    persona: string;
    userId: string | null;
    /** La persona no tiene ficha en WeProdu (distinto de «ficha sin contrato»). */
    sinFicha: boolean;
    inicio: string;
    finArca: string;
    modalidadArca: string;
    /** El tipo de contrato de WeProdu ("" sin contrato: la pantalla muestra la modalidad de ARCA). */
    tipoContrato: string;
    proyecto: string;
    finWeprodu: string;
    /** Días desde la baja del contrato en WeProdu, si ya pasó. */
    diasDesdeFin: number | null;
    situacion: SituacionBajaArca;
    /** Lo que la fila aclara debajo de la situación. */
    detalle: string;
    /** Con qué contrato abre el panel; `null` = modo «sin contrato». */
    contrato: {
        userProjectId: string;
        contratoKey: string | null;
        posicion: number;
    } | null;
}
export interface FilaFueraDeLista {
    clave: string;
    empleadoraCuit: string;
    empleadora: string;
    cuil: string;
    persona: string;
    userId: string | null;
    inicio: string;
    finArca: string;
    motivo: MotivoFuera;
    /** Por qué no está en la lista, para mostrar. */
    texto: string;
    /** Los contratos de WeProdu de la relación (lo que Auditoría muestra en «Relación con varios contratos»). */
    contratos: ContratoDeRelacion[];
}
export interface ConteosBajaArca {
    s1: number;
    s2: number;
    s3: number;
    s4: number;
    s5: number;
    /** La suma de 1 a 4: el número del menú. La 5 es inventario. */
    pendientes: number;
    /** Cuántas relaciones vivas quedaron afuera, por motivo. */
    fuera: Partial<Record<MotivoFuera, number>>;
}
export interface ListaBajasArca {
    hoy: string;
    filas: FilaBajaArca[];
    fuera: FilaFueraDeLista[];
    conteos: ConteosBajaArca;
}
/** Arma la lista a partir de las relaciones vivas y cómo se opera cada una. Pura. */
export declare function armarListaBajas(relaciones: RelacionOperable[], hoy: string): ListaBajasArca;
export declare function contar(filas: {
    situacion: SituacionBajaArca;
}[], fuera?: {
    motivo: MotivoFuera;
}[]): ConteosBajaArca;
/** La lista de hoy, sobre el espejo. No abre ARCA. */
export declare function listaBajasArca(tenantId: Types.ObjectId | string): Promise<ListaBajasArca>;
export interface FilaDeFoto {
    clave: string;
    persona: string;
    situacion: SituacionBajaArca;
}
export interface MovimientosBajaArca {
    entraron: FilaDeFoto[];
    /** `ahora` dice dónde quedó, si se sabe (cerrada en ARCA, con varios contratos, baja presentada…). */
    salieron: (FilaDeFoto & {
        ahora: string;
    })[];
    cambiaron: {
        clave: string;
        persona: string;
        de: SituacionBajaArca;
        a: SituacionBajaArca;
    }[];
}
export declare const sinMovimientos: (m: MovimientosBajaArca) => boolean;
/** Qué cambió entre dos fotos de la lista. Pura. */
export declare function movimientosEntre(antes: FilaDeFoto[], ahora: FilaDeFoto[], fuera?: {
    clave: string;
    motivo: MotivoFuera;
}[]): MovimientosBajaArca;
export interface FotoBajasArca {
    el: string;
    conteos: ConteosBajaArca;
    filas: FilaDeFoto[];
}
export interface GuardadoBajasArca {
    /** Los conteos de la última vez que alguien calculó la lista (la corrida o la pantalla): lo que lee el menú. */
    actual: {
        el: string;
        conteos: ConteosBajaArca;
    } | null;
    /** La foto de la última corrida automática. */
    corrida: FotoBajasArca | null;
    /** Qué cambió en cada corrida respecto de la anterior (sólo las que cambiaron algo), de la más nueva a la más vieja. */
    movimientos: ({
        el: string;
        conteos: ConteosBajaArca;
    } & MovimientosBajaArca)[];
}
export declare function guardadoBajasArca(tenantId: Types.ObjectId | string): Promise<GuardadoBajasArca>;
/** Deja los conteos de ahora para el contador del menú (cada vez que se abre la lista). No toca la foto de la corrida. */
export declare function guardarConteosActuales(tenantId: Types.ObjectId | string, conteos: ConteosBajaArca): Promise<void>;
/**
 * Para la corrida automática de las 06:00: calcula la lista, guarda la foto y, si algo cambió respecto de la foto
 * anterior, lo anota. Nunca tira.
 */
export declare function guardarCorridaBajasArca(tenantId: Types.ObjectId | string): Promise<ConteosBajaArca | null>;
/** La lista con lo guardado: lo que pide la pantalla. Deja los conteos de ahora para el menú. */
export declare function listaBajasArcaConFoto(tenantId: Types.ObjectId | string): Promise<ListaBajasArca & {
    corrida: {
        el: string;
        conteos: ConteosBajaArca;
    } | null;
    desdeLaCorrida: MovimientosBajaArca | null;
    movimientos: GuardadoBajasArca["movimientos"];
}>;
