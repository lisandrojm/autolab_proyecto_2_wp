import { useState, useEffect } from "react";
import { usersAPI, User } from "../../../../api/users";

export const useUserHistory = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      /*
        EL HISTORIAL DE CONTRATACIÓN SON LAS SOLICITUDES, no las personas.

        Pedía `list({ metadataActivo: true })`, o sea TODOS los usuarios activos del tenant: en el
        historial aparecía cualquiera que se hubiera registrado por el link —que no pidió ninguna
        contratación— y encima faltaban las solicitudes hechas para alguien que ya es usuario, porque
        ese listado las esconde a propósito (se muestran dentro de la ficha de la persona).

        `solicitudAny` trae las solicitudes en cualquier estado, que es justo un historial: las
        pendientes, las aprobadas, las rechazadas y las canceladas. Sin `sort` vienen de la más nueva
        a la más vieja.
      */
      const response = await usersAPI.list({ limit: 50, solicitudAny: "true" });
      setUsers(response.users);
    } catch (err: any) {
      setError(err.response?.data?.error || "Error al cargar el historial de usuarios");
      console.error("Error fetching user history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return {
    users,
    loading,
    error,
    refetch: fetchUsers,
  };
};
