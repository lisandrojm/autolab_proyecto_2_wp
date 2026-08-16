import { create } from "zustand";

/**
 * La app es SIEMPRE oscura.
 *
 * El store se conserva —en vez de borrarlo y tocar sus ~10 consumidores— porque varios componentes
 * leen `theme` para elegir colores en runtime, no solo clases de Tailwind: `EstadoSelect` y
 * `ContractStatesTab` calculan contraste de badges a partir de este valor. Dejándolo fijo en "dark",
 * esos cálculos siguen funcionando y toman siempre la rama correcta.
 *
 * Lo que sí desapareció son los botones de cambio de tema: un toggle que no cambia nada es peor que
 * no tenerlo. `setTheme` queda como no-op por si algún llamador viejo lo invoca.
 */
type Theme = "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

// Restos de cuando el tema era elegible: si queda en localStorage, un navegador viejo podría
// rehidratar "light" desde algún lado. Se limpia una vez al cargar el módulo.
try {
  localStorage.removeItem("theme");
} catch {
  // localStorage puede no estar disponible (modo privado, SSR): no es motivo para romper el arranque.
}

export const useThemeStore = create<ThemeState>(() => ({
  theme: "dark",
  setTheme: () => {
    /* La app es siempre oscura: no hay nada que setear. */
  },
}));
