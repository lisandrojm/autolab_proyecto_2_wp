import { defineConfig, loadEnv, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Las descargas de archivos NO caen en el fallback de la SPA.
 *
 * Vite —y cualquier server de una single page app— responde el `index.html` para todo lo que no
 * encuentra, porque asume que es una ruta del router. Para una descarga eso es lo peor que puede
 * pasar: el navegador recibe 200 con un HTML, lo guarda con el nombre del ejecutable y el usuario
 * termina con un `AsistenteWeProdu.exe` de 2 KB que no arranca, o con una pestaña en blanco. El
 * archivo no existe y todo parece haber funcionado.
 *
 * Con esto, un archivo faltante devuelve 404: la UI puede detectarlo (hace un HEAD antes de ofrecer
 * el botón) y el que prueba a mano lo ve enseguida.
 *
 * Vale como REGLA GENERAL: cualquier ruta de descarga servida desde la SPA necesita este corte, no
 * solo la del Asistente. Por eso el prefijo es una lista y no un `if`.
 *
 * ESTO ES SOLO EL SERVIDOR DE DESARROLLO. En producción el mismo corte lo hace `vercel.json`, con un
 * rewrite de `/asistente/descargas/(.*)` a sí mismo, y ahí lo que importa es EL ORDEN: Vercel aplica
 * la primera regla que matchea y se detiene, así que ese rewrite tiene que quedar ANTES del catch-all
 * `/((?!.*\.).*)`. Movido después, deja de tener efecto y en producción vuelve el HTML de 2 KB —
 * mientras acá, en desarrollo, todo se sigue viendo bien.
 *
 * Esa explicación vivía adentro de `vercel.json`, en una clave `"//"`, y voló un deploy entero:
 * Vercel valida cada rewrite contra su schema y rechaza cualquier propiedad que no sea suya
 * («rewrites[2] should NOT have additional property `//`»). JSON no tiene comentarios y ese archivo
 * no admite ni el truco: lo que haya que explicar de él se explica acá.
 */
/**
 * Prefijos que son ARCHIVOS y nunca rutas de la SPA.
 *
 * Ojo con el nivel: es `/asistente/descargas/` y no `/asistente/`. `/asistente/emparejar` SÍ es una
 * ruta de la SPA —la página que recibe el token del Asistente— y meterla bajo esta regla la
 * convertiría en un 404. Un prefijo que engloba a los dos usos deja siempre uno de los dos roto.
 */
const RUTAS_DE_DESCARGA = ["/asistente/descargas/"];

const sinFallbackDeSPA = (): Plugin => ({
  name: "weprodu-descargas-404",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = (req.url || "").split("?")[0];
      if (!RUTAS_DE_DESCARGA.some((p) => url.startsWith(p))) return next();
      if (existsSync(join(server.config.publicDir, url))) return next();
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`No existe ${url}. Si es el Asistente, todavía no se publicó el ejecutable para ese sistema.`);
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  console.log("👉 VITE_API_URL:", env.VITE_API_URL);

  return {
    plugins: [react(), sinFallbackDeSPA()],
    server: {
      port: 5173,
      host: true,
      proxy:
        mode === "development"
          ? {
              "/api": {
                target: "http://127.0.0.1:8080", // backend local
                changeOrigin: true,
                secure: false,
              },
            }
          : undefined,
    },
    build: {
      chunkSizeWarningLimit: 5000, // ⚡️ ahora sí funciona
    },
    optimizeDeps: {
      exclude: ["lucide-react"],
    },
  };
});
