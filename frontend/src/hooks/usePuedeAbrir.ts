import { useCallback } from "react";
import { useAuthStore } from "../stores/authStore";
import { puedeAbrirRuta } from "../config/accesoRutas";

/**
 * `puedeAbrir('/roles')`: si quien mira puede entrar a esa ruta. Para decidir si se muestra un botón o
 * un link a otra pantalla: si la guarda lo va a echar, no se le ofrece. Ver `config/accesoRutas.ts`.
 */
export const usePuedeAbrir = () => {
  const user = useAuthStore((s) => s.user);
  return useCallback((destino: string) => puedeAbrirRuta(user, destino), [user]);
};
