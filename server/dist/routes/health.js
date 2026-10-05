import { Router } from "express";
import { execSync } from "node:child_process";
/**
 * QUÉ VERSIÓN ESTÁ CORRIENDO, además de «anda».
 *
 * El frontend de desarrollo y el servidor se actualizan por separado (el servidor hay que bajarlo con
 * `git pull` y reiniciarlo), y una pantalla nueva contra un servidor viejo falla de formas que no
 * dicen eso: un «Not Found», una columna «sin dato». Con el commit acá se contesta de un vistazo si
 * el servidor ya tiene un cambio, sin entrar a la máquina.
 *
 * Se lee UNA vez, al arrancar: es el commit con el que arrancó este proceso, que es lo que importa
 * (un `git pull` sin reiniciar no cambia lo que corre). Sin git a mano queda «desconocida».
 */
const arrancoEl = new Date().toISOString();
const version = (() => {
    try {
        return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).toString().trim() || "desconocida";
    }
    catch {
        return "desconocida";
    }
})();
export const healthRoutes = Router().get("/", (_req, res) => res.json({ ok: true, ts: Date.now(), version, arrancoEl }));
