import React, { useEffect, useState } from "react";
import { useProfileModalStore } from "../../stores/profileModalStore";
import { useAuthStore } from "../../stores/authStore";
import { usersAPI, User } from "../../api/users";
import { UserFormModal } from "./UserFormModal";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { sweetAlert } from "../../utils/sweetAlert";

/**
 * Host global del modal "Mi Perfil".
 * Se monta una sola vez (en App). Cuando el store se abre, trae el registro
 * completo del usuario logueado y abre el mismo modal de edición que usa la
 * página de Usuarios, superpuesto sobre la página actual.
 */
export const ProfileModalHost: React.FC = () => {
  const { isOpen, close } = useProfileModalStore();
  const authUser = useAuthStore((s) => s.user);
  const [fullUser, setFullUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setFullUser(null);
      return;
    }
    if (!authUser?.id) {
      sweetAlert.error("Error", "No se pudo identificar al usuario actual.");
      close();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const u = await usersAPI.get(authUser.id);
        if (!cancelled) setFullUser(u);
      } catch (error: any) {
        if (!cancelled) {
          const message = error.response?.data?.error || "No se pudo cargar tu perfil.";
          sweetAlert.error("Error", message);
          close();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, authUser?.id, close]);

  if (!isOpen) return null;

  if (loading || !fullUser) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm" style={{ zIndex: 60 }}>
        <LoadingSpinner message="Cargando tu perfil..." />
      </div>
    );
  }

  return <UserFormModal isOpen={isOpen} onClose={close} user={fullUser} mode="edit" onSaved={close} zIndex={60} />;
};
