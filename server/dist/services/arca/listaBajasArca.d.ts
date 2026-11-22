/**
 * BAJAS ARCA: LA LISTA (22/11/2026, pedido del usuario). El único lugar desde donde se da de baja una relación en
 * ARCA. Una fila por CADA relación VIVA del espejo (abierta, o con fin de hoy en adelante): la lista tiene que
 * sumar lo mismo que las relaciones vivas del espejo, y si no coincide es un bug (`vivasEnEspejo`, que se cuenta
 * aparte, es contra lo que la pantalla lo comprueba). Cada fila tiene exactamente UNA situación:
 *
 *   1. Terminado en WeProdu            el contrato tiene fecha de baja pasada y la relación sigue abierta en ARCA.
 *   2. Termina antes de su fecha       contrato a plazo cuya baja en WeProdu es anterior al fin que tiene ARCA.
 *   3. Baja presentada, sin confirmar  se mandó desde acá y no se leyó el resultado, o quedó en error de navegación.
 *   4. Sin contrato en WeProdu         ningún contrato con esa persona, empleadora y fecha de inicio. Incluye las
 *                                      que ARCA cierra sola (fin futuro): «ARCA la cierra sola» supone que hay un
 *                                      contrato, y acá no lo hay (Peralta Recio, Viggiano). La fila distingue
 *                                      «persona sin ficha en WeProdu» de «ficha sin contrato con esa alta».
 *   5. Indeterminado vigente           abierto de los dos lados. Inventario, no trabajo.
 *   6. Plazo vigente                   plazo fijo o jornada con fin de hoy en adelante: ARCA lo cierra solo en su
 *                                      fecha, pero se puede dar de baja antes. Inventario también.
 *
 * El número del menú es la suma de 1 a 4: el trabajo pendiente. La 5 y la 6 son inventario.
 *
 * FILAS BLOQUEADAS (sin situación, al final, con el botón deshabilitado y el motivo a la vista): las relaciones
 * vivas sobre las que desde acá no se puede operar. Se ven igual, porque la lista es TODO lo vivo:
 *   · `varios_proyectos`: la misma relación cargada en VARIOS proyectos («agregar miembro»: Quinteiro, Yorio). No es
 *     un problema de datos sino una decisión que WeProdu modela mal, y se resuelve A MANO. La lista NO elige un
 *     contrato «principal»: la baja en ARCA quedaría atada a un proyecto arbitrario y el resto seguiría vigente.
 *   · `varios_contratos`: duplicados dentro del MISMO proyecto. Se anula el que sobra y la fila toma su situación.
 *   · `baja_presentada`: la baja ya se presentó y ARCA la tomó; falta que la sincronización la traiga cerrada.
 *   · `no_se_opera`: la regla compartida dice que no hay nada que operar (alta sin confirmar o anulada).
 * Las dos primeras están también en Auditoría ARCA › «Relación con varios contratos», de esta misma función.
 * Servicios y anulados no cuentan como contrato de ninguna relación (`relacionesOperables.ts`).
 *
 * SOBRE EL ORDEN: la 3 se mira ANTES que la 1 y la 2. Una baja que se mandó y quedó sin confirmar casi siempre es de
 * un contrato que ya terminó: si ganara la 1, la fila diría «Terminado en WeProdu» con el botón «Dar de baja», como
 * si nadie hubiera mandado nada. La lista igual se ordena 1 a 6, y las bloqueadas al final.
 *
 * «Se puede operar» lo decide la regla de siempre, `compartido/arca/relacionParaOperar.ts` (vía
 * `relacionesOperables`): la misma que usa el panel. El tipo por el que se filtra y la advertencia de la modalidad
 * de directores (LRT) salen de `compartido/arca/modalidadArca.ts`, que también usa el panel.
 *
 * LA FOTO DE LAS 06:00 (`guardarCorridaBajasArca`): después de cada sincronización automática se guardan los conteos
 * de las seis situaciones y qué relación está en cuál, como hace la Auditoría con sus totales. Y contra la foto
 * anterior se anota quién entró, quién salió y quién cambió de situación: un número que cambia tiene que poder
 * explicarse.
 */
import { Types } from "mongoose";
import { type ContratoDeRelacion, type RelacionOperable } from "./relacionesOperables.js";
export type SituacionBajaArca = 1 | 2 | 3 | 4 | 5 | 6;
export declare const SITUACIONES_BAJA_ARCA: Record<SituacionBajaArca, string>;
/** Por qué una relación viva está en la lista sin poder operarse desde acá. */
export type MotivoBloqueo = "varios_contratos" | "varios_proyectos" | "baja_presentada" | "no_se_opera";
/** `cerrada` no es una fila: es a dónde fue una relación que salió de la lista (los movimientos de la foto). */
export type MotivoFuera = "cerrada" | MotivoBloqueo;
export declare const BLOQUEOS: Record<MotivoBloqueo, {
    etiqueta: string;
    texto: string;
}>;
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
/**
 * LA SITUACIÓN DE UNA RELACIÓN VIVA, o por qué no tiene (`fuera`: una cerrada no es de la lista; el resto son filas
 * bloqueadas). Pura: es lo que se prueba.
 */
export declare function situacionDeBaja(d: DatosParaSituacion, hoy: string): {
    situacion: SituacionBajaArca;
    fuera: null;
} | {
    situacion: null;
    fuera: MotivoFuera;
};
export type EnWeprodu = "con_contrato" | "sin_contrato" | "sin_ficha";
export interface FilaBajaArca {
    clave: string;
    empleadoraCuit: string;
    empleadora: string;
    cuil: string;
    persona: string;
    userId: string | null;
    /** La persona no tiene ficha en WeProdu (distinto de «ficha sin contrato»). */
    sinFicha: boolean;
    /** Qué hay en WeProdu de esta relación: un contrato (o varios), la ficha sin ese contrato, o ni la ficha. */
    enWeprodu: EnWeprodu;
    inicio: string;
    finArca: string;
    modalidadArca: string;
    /** El tipo por el que se filtra y se ordena: el de WeProdu si hay contrato; si no, la modalidad que declara ARCA. */
    tipo: string;
    /** El nombre del tipo de contrato de WeProdu ("" sin contrato: la pantalla muestra la modalidad de ARCA). */
    tipoContrato: string;
    /** Para mostrar; con varios proyectos, todos. */
    proyecto: string;
    proyectos: string[];
    finWeprodu: string;
    /** Días desde la baja del contrato en WeProdu, si ya pasó. */
    diasDesdeFin: number | null;
    /** `null` = fila bloqueada (ver `bloqueo`). */
    situacion: SituacionBajaArca | null;
    /** Por qué no se puede operar desde acá: el botón va deshabilitado con este motivo. */
    bloqueo: {
        motivo: MotivoBloqueo;
        etiqueta: string;
        texto: string;
    } | null;
    /** Lo que la fila aclara debajo de la situación. */
    detalle: string;
    /** Advertencia visible en la fila y en el panel (hoy: la modalidad de directores, LRT). "" si ninguna. */
    advertencia: string;
    /** Con qué contrato abre el panel; `null` = modo «sin contrato». */
    contrato: {
        userProjectId: string;
        contratoKey: string | null;
        posicion: number;
    } | null;
}
/** Una fila bloqueada con sus contratos: lo que Auditoría ARCA muestra en «Relación con varios contratos». */
export interface FilaBloqueada {
    clave: string;
    empleadoraCuit: string;
    empleadora: string;
    cuil: string;
    persona: string;
    userId: string | null;
    inicio: string;
    finArca: string;
    motivo: MotivoBloqueo;
    texto: string;
    contratos: ContratoDeRelacion[];
}
export interface ConteosBajaArca {
    s1: number;
    s2: number;
    s3: number;
    s4: number;
    s5: number;
    s6: number;
    /** La suma de 1 a 4: el número del menú. La 5 y la 6 son inventario. */
    pendientes: number;
    /** Las filas sin situación (botón deshabilitado), por motivo. */
    bloqueadas: Partial<Record<MotivoBloqueo, number>>;
    /** Todas las filas: tiene que ser igual a las relaciones vivas del espejo. */
    total: number;
}
export interface ListaBajasArca {
    hoy: string;
    filas: FilaBajaArca[];
    bloqueadas: FilaBloqueada[];
    conteos: ConteosBajaArca;
}
/** Arma la lista a partir de las relaciones vivas y cómo se opera cada una. Pura. */
export declare function armarListaBajas(relaciones: RelacionOperable[], hoy: string): ListaBajasArca;
export declare function contar(filas: {
    situacion: SituacionBajaArca | null;
    bloqueo?: {
        motivo: MotivoBloqueo;
    } | null;
}[]): ConteosBajaArca;
/**
 * La lista de hoy, sobre el espejo. No abre ARCA. `vivasEnEspejo` se cuenta APARTE, con su propia consulta: es el
 * número contra el que la pantalla comprueba que la lista no perdió ni repitió ninguna relación.
 */
export declare function listaBajasArca(tenantId: Types.ObjectId | string): Promise<ListaBajasArca & {
    vivasEnEspejo: number;
}>;
/** Una fila CON situación (1 a 6). Las bloqueadas no van en la foto: si una fila pasa a bloqueada, «salió» y se dice a dónde. */
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
/** Qué cambió entre dos fotos de la lista. `bloqueadas`: las que hoy siguen vivas pero sin situación. Pura. */
export declare function movimientosEntre(antes: FilaDeFoto[], ahora: FilaDeFoto[], bloqueadas?: {
    clave: string;
    motivo: MotivoBloqueo;
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
/** «8 pendientes (1: 0 · 2: 0 · 3: 0 · 4: 8) y 98 de inventario (5: 68 · 6: 30)». */
export declare const resumenDeConteos: (c: ConteosBajaArca) => string;
/**
 * Para la corrida automática de las 06:00: calcula la lista, guarda la foto y, si algo cambió respecto de la foto
 * anterior, lo anota. Nunca tira.
 */
export declare function guardarCorridaBajasArca(tenantId: Types.ObjectId | string): Promise<ConteosBajaArca | null>;
/** La lista con lo guardado: lo que pide la pantalla. Deja los conteos de ahora para el menú. */
export declare function listaBajasArcaConFoto(tenantId: Types.ObjectId | string): Promise<ListaBajasArca & {
    vivasEnEspejo: number;
    corrida: {
        el: string;
        conteos: ConteosBajaArca;
    } | null;
    desdeLaCorrida: MovimientosBajaArca | null;
    movimientos: GuardadoBajasArca["movimientos"];
}>;
