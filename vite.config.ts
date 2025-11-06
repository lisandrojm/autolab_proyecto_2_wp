import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  // Cargar variables de entorno desde frontend/
  const envDir = path.join(process.cwd(), "frontend");
  const env = loadEnv(mode, envDir, "");

  console.log("🚀 Mode:", mode);
  console.log("👉 VITE_API_URL:", env.VITE_API_URL);

  return {
    root: "frontend",
    envDir: ".", // Buscar .env files en frontend/ (relativo a root)
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy:
        mode === "development"
          ? {
              "/api": {
                target: "http://localhost:8080",
                changeOrigin: true,
                secure: false,
              },
            }
          : undefined,
    },
    build: {
      outDir: "../dist",
      emptyOutDir: true,
      chunkSizeWarningLimit: 5000,
    },
    optimizeDeps: {
      exclude: ["lucide-react"],
    },
  };
});
