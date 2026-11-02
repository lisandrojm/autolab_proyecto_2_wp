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

        Y SÓLO LAS DE QUIEN MIRA (`creadasPorMi`, 22/10/2026): sin eso venían las de todo el tenant y un
        coordinador veía en su historial lo que pidieron los demás. El server filtra por
        `metadata.solicitudCreadaPor` (y para quien entra sólo con el permiso del móvil lo hace siempre).
      */
      /*
        TODO EL HISTORIAL (02/11/2026): antes traía sólo las 50 más nuevas y lo demás no se podía ver ni
        buscar. Se pide de a páginas: la primera se muestra apenas llega y el resto se va sumando.
      */
      const POR_PAGINA = 100;
      const params = { limit: POR_PAGINA, solicitudAny: "true", creadasPorMi: "true" } as const;
      const primera = await usersAPI.list({ ...params, page: 1 });
      setUsers(primera.users);
      setLoading(false);
      const paginas = Number(primera.pagination?.pages) || 1;
      let todos = primera.users;
      for (let page = 2; page <= paginas; page++) {
        const r = await usersAPI.list({ ...params, page });
        const vistos = new Set(todos.map((u) => u._id));
        todos = [...todos, ...r.users.filter((u) => !vistos.has(u._id))];
        setUsers(todos);
      }
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
