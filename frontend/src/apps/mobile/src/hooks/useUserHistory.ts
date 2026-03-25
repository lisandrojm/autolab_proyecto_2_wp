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
      // Fetch recent users. Limit to 50 for history.
      const response = await usersAPI.list({ limit: 50 });
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
