/**
 * QUIÉN ESTÁ ESCRIBIENDO (etapa 3, auditoría de contratos, 19/11/2026).
 *
 * La auditoría se registra sola, desde los hooks del modelo (ver `services/auditoriaContratos.ts`): ninguna
 * ruta tiene que acordarse. Lo que el hook no sabe es QUIÉN hizo el cambio, y eso lo pone acá quien
 * arranca el trabajo:
 *  - la app: `authenticateToken` (cada request autenticado corre con la persona y la ruta);
 *  - un cron o un servicio en segundo plano: `enContexto({ origen: "sistema", detalle: "cron …" }, fn)`;
 *  - un script: `contextoDeScript("nombre", { motivo })` al principio de `main`.
 * Sin contexto, el evento queda igual, con origen «sistema» y detalle «sin contexto»: mejor eso que nada,
 * y se nota en la auditoría que falta declararlo.
 */
import { AsyncLocalStorage } from "node:async_hooks";
const almacen = new AsyncLocalStorage();
/** Un script corrido con tsx/node (`src/scripts/x.ts`, `dist/scripts/x.js`) se reconoce solo, sin declararlo. */
const scriptEnCurso = (() => {
    const m = /[\\/]scripts[\\/]([^\\/]+)\.(ts|js|mts)$/.exec(process.argv[1] || "");
    return m ? { origen: "script", detalle: `script ${m[1]}` } : null;
})();
export const contextoActual = () => almacen.getStore() || scriptEnCurso;
/** Corre `fn` con este contexto (lo que no se diga se hereda del actual). */
export function enContexto(ctx, fn) {
    const actual = contextoActual();
    return almacen.run({ origen: "sistema", ...actual, ...ctx }, fn);
}
/** Para un script: todo lo que siga en este flujo queda a su nombre. */
export function contextoDeScript(nombre, extra = {}) {
    almacen.enterWith({ origen: "script", detalle: `script ${nombre}`, ...extra });
}
