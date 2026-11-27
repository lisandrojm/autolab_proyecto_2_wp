/**
 * EL RELOJ DE LAS AUTOMATIZACIONES DE CONTRATACIÓN (ver `config.ts`): cada minuto, para cada tenant que
 * prendió alguna, si pasó su frecuencia desde la última corrida, corre. Mismo patrón que las otras
 * tareas del servidor (`presentacionAutomaticaCronService.ts`, `dropboxSignBot/cron.ts`): un
 * `setInterval` corto que decide si le toca, y un candado entre procesos con un `updateOne`
 * condicional sobre `ultimaCorridaAt` ANTES de correr (dos instancias no arrancan la misma corrida).
 *
 * Una corrida que falla deja `ultimoError` y espera su frecuencia: no golpea a Dropbox ni a ARCA cada
 * minuto. «Correr ahora» desde la pantalla pasa por `correrAhora`, con el mismo candado.
 */
import { Types } from "mongoose";
import { ClaveAutomatizacion } from "./config.js";
export declare function initAutomatizacionesContratacionScheduler(): void;
/** «Correr ahora» desde la pantalla. Si ya hay una corrida en curso en este proceso, lo dice. */
export declare function correrAhora(tenantObjectId: Types.ObjectId, clave: ClaveAutomatizacion): Promise<any>;
/** Lo que la pantalla muestra de una automatización. */
export declare function estadoDe(tenant: any, clave: ClaveAutomatizacion, ahora?: Date): {
    ultimaCorridaAt: any;
    ultimaCorrida: any;
    ultimoError: any;
    proximaAt: Date;
    enCurso: boolean;
    frecuencias: (10 | 15 | 60 | 30 | 120 | 240 | 480 | 720 | 1440)[];
    activa: boolean;
    cadaMinutos: number;
};
