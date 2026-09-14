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
}

export const usePermisosInactivosStore = create<PermisosInactivosState>((set, get) => ({
  inactivos: [],
  cargado: false,
  setInactivos: (inactivos) => set({ inactivos, cargado: true }),
  ensureLoaded: () => {
    if (get().cargado || enVuelo) return;
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
