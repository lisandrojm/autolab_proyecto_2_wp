/**
 * Validar obras sociales contra ARCA desde el SERVIDOR, sin que nadie tenga que instalar nada.
 *
 * Reemplaza al camino que exigía el Asistente WeProdu en la máquina de cada administrativo. La
 * diferencia es de dónde sale la sesión de ARCA: antes la abría una persona en su Chrome, ahora la
 * abre el servidor con un usuario delegado (ver `navegador.ts`, y la advertencia de seguridad que
 * está ahí y en el modelo).
 *
 * LO QUE NO CAMBIA es el trámite: las reglas contra ARCA —el «Aceptar» que no se toca, el ciclo de a
 * uno con la pantalla vaciada y verificada— son el MISMO código que corre en el Asistente. Se
 * importa, no se reescribe. Dos copias de las reglas del organismo se separan solas, y lo que se
 * separa es lo que decide qué obra social se le declara a una persona.
 *
 * SOLO OBRA SOCIAL. Esta corrida no lee, compara ni escribe nombres: eso se valida aparte, desde
 * Usuarios («Validar nombres en ARCA»). Hacerlo acá alargaba cada corrida con consultas al padrón.
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
}
/** Empieza la tanda de una empleadora de la selección. */
 | {
    tipo: "empleadora";
    razonSocial: string;
    cuils: string[];
} | {
    tipo: "consultando";
    cuil: string;
} | {
    tipo: "resultado";
    cuil: string;
    rnos: string;
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
    tipo: "fin";
    validadas: number;
    faltaron: number;
    motivo: string;
    detalle: string[];
} | {
    tipo: "fallo";
    mensaje: string;
}
/** Se reintenta con otra empleadora a los que la del contrato rechazó por «alta activa». */
 | {
    tipo: "otraEmpleadora";
    razonSocial: string;
    cuils: string[];
};
/** Las personas de UNA empleadora. Una corrida puede traer varias y las lee en la misma sesión. */
export interface GrupoCorrida {
    empresaId: string;
    cuils: string[];
}
interface Corrida {
    tenantId: string;
    /** La primera empleadora de la selección (compatibilidad con quien lee el estado). */
    empresaId: string;
    empresaIds: string[];
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
/** Lo que el motor mide de una lectura con una empleadora (ver `medicion` en el motor). */
interface MedicionLectura {
    empresaCuit: string;
    razonSocial: string;
    cuils: number;
    prepararMs?: number;
    vaciarInicialMs?: number;
    porCuil: Array<{
        cuil: string;
        agregarMs: number;
        leerMs: number;
        vaciarMs: number;
        desenlace: string;
        vaciarCon: string | null;
    }>;
    totalMs?: number;
    /** Hubo que cerrar el navegador y abrir otra sesión porque cambiar de empleadora en la misma no anduvo. */
    sesionNueva?: boolean;
    primerIntentoFallo?: string;
    error?: string;
    /** Solo en reintentos. */
    intentados?: number;
    resueltos?: number;
}
/**
 * Arranca la corrida y vuelve enseguida.
 *
 * No se espera a que termine: son minutos, y un request HTTP colgado ese tiempo se corta solo en
 * cualquier proxy. El progreso se sigue por `corridaDe`.
 *
 * UNA SOLA CORRIDA PARA TODA LA SELECCIÓN. Antes Solicitudes disparaba una corrida por empleadora,
 * y cada una abría su Chromium y su sesión de ARCA. Ahora las empleadoras van en `grupos` y se leen
 * en la misma página, cambiando de CUIT en el selector (ver `prepararAltas` en el motor).
 */
export declare function arrancarCorrida(opts: {
    tenantId: string;
    tenantObjectId: any;
    grupos: GrupoCorrida[];
    usuarioId?: string;
}): Promise<{
    total: number;
    grupos: Array<{
        empresaId: string;
        total: number;
    }>;
}>;
/**
 * En qué orden se prueban las otras empleadoras para los de «alta activa».
 *
 * Primero la que más personas resolvió en reintentos de corridas anteriores (sale de los logs), y
 * a igualdad las que están en esta misma selección —ya se sabe que el usuario de ARCA las tiene en su
 * selector—. Así lo normal es que se resuelvan todos con la primera y la corrida corte ahí.
 */
export declare function ordenarParaReintento(tenantObjectId: any, otras: any[], cuitsDeLaSeleccion: string[]): Promise<any[]>;
/** La regla de orden sola, sin base, para poder probarla. */
export declare function ordenarPorPuntaje(otras: any[], puntaje: Map<string, number>, cuitsDeLaSeleccion: string[]): any[];
/**
 * Promedios por fase, para leer el log de un vistazo sin sumar a mano cada persona.
 *
 * `porPersonaMs` separa las que ARCA leyó de las que rechazó: son costos distintos (un rechazo no
 * lee ni suele necesitar vaciar) y promediarlas juntas escondería justo la mejora de los rechazos.
 */
export declare function resumirTiempos(t: {
    aperturas: any[];
    grupos: MedicionLectura[];
    reintentos: MedicionLectura[];
    guardarMs: number;
    totalMs: number;
}): {
    abrirSesionMs: number;
    aperturas: number;
    prepararMs: number;
    personasMs: number;
    guardarMs: number;
    totalMs: number;
    leidas: number;
    rechazos: number;
    porLeidaMs: {
        agregar: number;
        leer: number;
        vaciar: number;
        total: number;
    };
    porRechazoMs: {
        agregar: number;
        vaciar: number;
        total: number;
    };
    vaciarCon: string[];
};
export {};
