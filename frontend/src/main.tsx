import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { library } from "@fortawesome/fontawesome-svg-core";
import { fas } from "@fortawesome/free-solid-svg-icons";
import { fab } from "@fortawesome/free-brands-svg-icons";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { queryClient } from "./lib/queryClient";
import "./index.css";
import "./i18n";

// Add all solid and brand icons to the library
library.add(fas, fab);

/*
  El proveedor de consultas envuelve TODA la app, también la parte móvil: la caché y la deduplicación
  sólo sirven si son una sola para toda la sesión. Ver `lib/queryClient.ts` para los niveles de frescura.
*/
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
