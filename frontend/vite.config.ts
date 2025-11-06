import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  console.log("👉 VITE_API_URL:", env.VITE_API_URL);

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy:
        mode === "development"
          ? {
              "/api": {
                target: "http://localhost:8080", // backend local
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
