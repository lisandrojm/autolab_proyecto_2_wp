import { Renombre } from "./nombreArca.js";
/**
 * Validar obras sociales contra ARCA desde el SERVIDOR, sin que nadie tenga que instalar nada.
 *
 * Reemplaza al camino que exigía el Asistente WeProdu en la máquina de cada administrativo. La
 * diferencia es de dónde sale la sesión de ARCA: antes la abría una persona en su Chrome, ahora la
 * abre el servidor con un usuario delegado (ver `navegador.ts`, y la advertencia de seguridad que
 * está ahí y en el modelo).
 *
 * LO QUE NO CAMBIA es el trámite: las reglas contra ARCA —las tandas, el «Aceptar» que no se toca,
 * el ciclo de a uno con la pantalla vaciada y verificada— son el MISMO código que corre en el
 * Asistente. Se importa, no se reescribe. Dos copias de las reglas del organismo se separan solas, y
 * lo que se separa es lo que decide qué obra social se le declara a una persona.
 */
export type EventoCorrida = {
    tipo: "abriendo";
} | {
    tipo: "conectando";
} | {
    tipo: "conectado";
} | {
    tipo: "esperando";
    que: string;
    restanMs: number;
} | {
    tipo: "listo";
} | {
    tipo: "consultando";
    cuil: string;
} | {
    tipo: "resultado";
    cuil: string;
    rnos: string;
    nombreArca?: string; /** El nombre guardado coincide con el que ARCA muestra. `false` = hay que resolverlo con el padrón. */
    nombreOk?: boolean;
    hechas: number;
    total: number;
} | {
    tipo: "error";
    cuil: string;
    motivo?: string;
    hechas: number;
    total: number;
} | {
    tipo: "guardando";
} | {
    tipo: "nombres";
    renombrados: Renombre[];
    confirmados: string[];
} | {
    tipo: "fin";
    validadas: number;
    faltaron: number;
    motivo: string;
    detalle: string[];
} | {
    tipo: "fallo";
    mensaje: string;
};
interface Corrida {
    tenantId: string;
    empresaId: string;
    total: number;
    eventos: EventoCorrida[];
    terminada: boolean;
    señal: {
        cortada: boolean;
    };
    arrancadaEl: Date;
}
export declare const corridaDe: (tenantId: string) => Corrida | undefined;
export declare const corriendo: (tenantId: string) => boolean;
export declare function detenerCorrida(tenantId: string): boolean;
/**
 * Arranca la corrida y vuelve enseguida.
 *
 * No se espera a que termine: son minutos, y un request HTTP colgado ese tiempo se corta solo en
 * cualquier proxy. El progreso se sigue por `corridaDe`.
 */
export declare function arrancarCorrida(opts: {
    tenantId: string;
    tenantObjectId: any;
    empresaId: string;
    cuils: string[];
    usuarioId?: string;
    userIds?: string[];
}): Promise<{
    total: number;
}>;
export {};
