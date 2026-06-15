import { create } from "zustand";

/**
 * Store global para el modal "Mi Perfil".
 * Permite abrir el modal de edición del usuario logueado desde cualquier
 * lugar (ej: el item "Mi Perfil" del sidebar) sin acoplarlo a la página de Usuarios.
 */
interface ProfileModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useProfileModalStore = create<ProfileModalState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
