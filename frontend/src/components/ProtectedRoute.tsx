import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { puedeAbrirRuta } from '../config/accesoRutas';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/** Lo lee el login para decir por qué se cerró la sesión. */
export const MOTIVO_SIN_ACCESO = 'sin-acceso';

/**
 * Sesión abierta Y permiso para ESTA ruta (`config/accesoRutas.ts`). Sin permiso se cierra la sesión y
 * se vuelve al login: no alcanza con mandar a otra pantalla, porque una sesión abierta en el otro
 * portal (el móvil, típicamente) o una URL guardada vuelven a entrar.
 *
 * Se reevalúa con cada cambio del usuario: cuando `refreshSession` trae los permisos nuevos (al volver
 * a la pestaña), quien perdió el acceso a la pantalla en la que está sale en ese momento.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, user, logout } = useAuthStore();
  const location = useLocation();
  const permitido = isAuthenticated && puedeAbrirRuta(user, location.pathname);

  useEffect(() => {
    if (isAuthenticated && !permitido) logout();
  }, [isAuthenticated, permitido, logout]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!permitido) return <Navigate to="/login" replace state={{ motivo: MOTIVO_SIN_ACCESO, desde: location.pathname }} />;

  return <>{children}</>;
};
