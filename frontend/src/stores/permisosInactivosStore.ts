import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { rolesAPI } from "../api/roles";
import { useAuthStore } from "./authStore";

/**
 * PERMISOS INACTIVOS: la función existe y se ve, pero deshabilitada para el usuario final.
 *
 * Mientras algo se está desarrollando, su permiso ya está en el código y se puede asignar en los roles
 * como cualquier otro. Lo que se apaga es DÓNDE SE USA: el ítem del menú de la plataforma y la tarjeta
 * del inicio del móvil quedan a la vista, grises y con «En desarrollo», sin poder entrar. Ocultarlos
 * no alcanza: nadie sabría que existen. La lista la maneja el SuperAdmin en Configuración → Permisos y
 * es una sola para toda la plataforma.
 *
 * El SuperAdmin queda EXCEPTUADO: es quien desarrolla, y tiene que poder entrar a probar.
 */

let enVuelo: Promise<void> | null = null;

interface PermisosInactivosState {
  inactivos: string[];
  cargado: boolean;
  /** La usa Configuración → Permisos al guardar, para que el menú y el móvil se actualicen sin recargar. */
  setInactivos: (permisos: string[]) => void;
  ensureLoaded: () => void;
  /** Vuelve a pedir la lista aunque ya esté cargada (al volver a la app: ver abajo). */
  recargar: () => void;
}

export const usePermisosInactivosStore = create<PermisosInactivosState>((set, get) => ({
  inactivos: [],
  cargado: false,
  setInactivos: (inactivos) => set({ inactivos, cargado: true }),
  ensureLoaded: () => {
    if (get().cargado) return;
    get().recargar();
  },
  recargar: () => {
    if (enVuelo) return;
    enVuelo = rolesAPI
      .getPermisosEnDesarrollo()
      .then((inactivos) => set({ inactivos, cargado: true }))
      .catch(() => {
        /* sin la lista, nada se apaga: mejor mostrar de más que dejar a alguien sin su pantalla */
      })
      .finally(() => {
        enVuelo = null;
      });
  },
}));

/** ¿Quién mira es SuperAdmin? Sin distinguir mayúsculas: el rol llega como «SuperAdmin». */
const esSuperAdmin = (user: any): boolean =>
  user?.primaryRole?.toLowerCase() === "superadmin" || (user?.roles || []).some((r: any) => String(typeof r === "string" ? r : r?.name || "").toLowerCase() === "superadmin");

/**
 * `inactivo(permiso)`: true si esa función tiene que verse deshabilitada para quien mira. Carga la lista
 * la primera vez que se usa en la sesión. Para el SuperAdmin siempre es false.
 */
export const usePermisoInactivo = () => {
  const user = useAuthStore((s) => s.user);
  const inactivos = usePermisosInactivosStore((s) => s.inactivos);
  const ensureLoaded = usePermisosInactivosStore((s) => s.ensureLoaded);

  useEffect(() => {
    if (user) ensureLoaded();
  }, [user, ensureLoaded]);

  const exento = esSuperAdmin(user);
  return useCallback((permiso?: string | null) => !!permiso && !exento && inactivos.includes(permiso), [inactivos, exento]);
};

/*
  AL VOLVER A LA APP SE RELEE LA LISTA. Si el SuperAdmin apaga o prende una función mientras alguien
  tiene la app abierta, se aplica cuando esa persona vuelve a ella, sin cerrar sesión. Como mucho una
  vez cada 30 segundos, y sólo con sesión abierta (el endpoint pide estar logueado).
*/
if (typeof window !== "undefined" && typeof document !== "undefined") {
  let ultimaRecarga = 0;
  const recargarAlVolver = () => {
    if (document.visibilityState !== "visible" || !useAuthStore.getState().token) return;
    const ahora = Date.now();
    if (ahora - ultimaRecarga < 30000) return;
    ultimaRecarga = ahora;
    usePermisosInactivosStore.getState().recargar();
  };
  document.addEventListener("visibilitychange", recargarAlVolver);
  window.addEventListener("focus", recargarAlVolver);
}
