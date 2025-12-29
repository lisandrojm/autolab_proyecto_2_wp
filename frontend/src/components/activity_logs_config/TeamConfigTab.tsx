import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExternalLinkAlt, faUser, faBell, faPenToSquare, faSave, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";
import { usersAPI } from "../../api/users"; // You might need a project-specific API for members
import { useAuthStore } from "../../stores/authStore";

interface TeamMember {
  _id: string; // User ID
  firstName: string;
  lastName: string;
  email: string;
  roleName: string; // "Coordinador" or "Colaborador" (derived from role list)
  isNotifier: boolean;
  canRegister: boolean;
  roles?: { name: string }[];
}

interface TeamConfigTabProps {
  project: any;
  onSave?: () => void;
}

export const TeamConfigTab: React.FC<TeamConfigTabProps> = ({ project, onSave }) => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { user } = useAuthStore();

  // Load members logic
  useEffect(() => {
    if (project) {
      loadMembers();
    }
  }, [project]);

  const loadMembers = async () => {
    setLoading(true);
    try {
      // Ideally we fetch GET /projects/:id with populate('assignedUsers') and merge with teamConfig
      // Here we simulate the merge logic if the API returned fully populated data,
      // OR we might need to fetch users if project only has IDs.

      // Since we modified backend to return project, assuming 'project' prop is fully populated
      // OR we fetch it again here to be sure. Let's assume we need to fetch specific config.

      // For MVP, if project.assignedUsers is populated:
      // Merge project.assignedUsers (User objects) with project.teamConfig (Permissions)

      const rawMembers = project.assignedUsers || []; // Assuming populated
      const config = project.teamConfig || [];

      const merged: TeamMember[] = rawMembers.map((u: any) => {
        const userConfig = config.find((c: any) => c.userId === u._id);

        // Determine role name (simplified logic based on roles array)
        const roleNames =
          u.roles
            ?.map((r: any) => (typeof r === "string" ? r : r.name))
            .join(" ")
            .toLowerCase() || "";
        let displayRole = "Colaborador";
        let isCoordinator = false;

        if (roleNames.includes("coordinador") || roleNames.includes("admin")) {
          displayRole = "Coordinador";
          isCoordinator = true;
        }

        return {
          _id: u._id,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          roleName: displayRole,
          isCoordinator,
          // Defaults if no config: Notifiers=false, CanRegister=true
          isNotifier: userConfig ? userConfig.isNotifier : false,
          canRegister: userConfig ? userConfig.canRegister : true,
        };
      });

      setMembers(merged);
    } catch (e) {
      console.error("Error loading members", e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (id: string, field: "isNotifier" | "canRegister") => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m._id !== id) return m;

        // Custom Logic:
        // If enabling notifier, disable others? Or allow multiple?
        // Requirement said "Radio Button logic" for notifier.
        if (field === "isNotifier") {
          // If we are turning it ON, we might want to turn others OFF if single-notifier rule applies.
          // But let's stick to simple toggle first, or implement radio logic here.
          // Let's assume unique notifier for simplicity based on user request "A quien le llegan".
          // However, a simple toggle is more flexible. Let's keep toggle but maybe warn?
          // Actually, let's implement the Radio logic: Turning one ON turns others OFF.
          // But wait, if I click the same one, does it turn off?
          return { ...m, isNotifier: !m.isNotifier };
        }

        return { ...m, [field]: !m[field] };
      })
    );

    if (field === "isNotifier") {
      // Enforce single notifier if desired. For now allowing multiple is safer unless strict req.
      // "Si hay mas de un coordinador poder elegir a que coordinador le llegan" -> Singular suggests one.
      // Let's enforce single active notifier for now for Coordinators.
      setMembers((prev) =>
        prev.map((m) => {
          if (m._id === id) return { ...m, isNotifier: !m.isNotifier }; // The one clicked
          if (field === "isNotifier") return { ...m, isNotifier: false }; // Others off
          return m;
        })
      );
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Prepare payload
      const payload = members.map((m) => ({
        userId: m._id,
        isNotifier: m.isNotifier,
        canRegister: m.canRegister,
      }));

      const token = useAuthStore.getState().token;
      await fetch(`${import.meta.env.VITE_API_URL}/projects/${project._id}/team-config`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ config: payload }),
      });

      if (onSave) onSave();
      // Show toast?
    } catch (e) {
      console.error("Error saving config", e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando equipo...</div>;

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Configuración de Equipo</h3>
          <p className="text-sm text-gray-500">Define permisos y notificaciones para este proyecto</p>
        </div>
        <Link to={`/projects/${project._id}/team`} className="text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-3 py-2 rounded-lg text-gray-700 dark:text-gray-300 flex items-center gap-2 transition-colors">
          <span>Gestionar Miembros</span>
          <FontAwesomeIcon icon={faExternalLinkAlt} className="text-xs" />
        </Link>
      </div>

      <div className="flex-1 overflow-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
            <tr>
              <th className="px-6 py-3">Miembro</th>
              <th className="px-6 py-3 text-center w-32">Notificar</th>
              <th className="px-6 py-3 text-center w-32">Registro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {members.length > 0 ? (
              members.map((member) => (
                <tr key={member._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-semibold text-xs">
                        {(member.firstName || "").charAt(0)}
                        {(member.lastName || "").charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {member.firstName} {member.lastName}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">{member.email}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${member.roleName === "Coordinador" ? "bg-green-50 border-green-200 text-green-700" : "bg-gray-50 border-gray-200 text-gray-600"}`}>{member.roleName}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button onClick={() => handleToggle(member._id, "isNotifier")} disabled={member.roleName !== "Coordinador"} className={`p-2 rounded-full transition-all ${member.isNotifier ? "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400 ring-2 ring-yellow-400/30" : "text-gray-300 dark:text-gray-600 hover:text-gray-400 hover:bg-gray-100"} ${member.roleName !== "Coordinador" ? "opacity-30 cursor-not-allowed" : ""}`} title={member.roleName === "Coordinador" ? "Recibir notificaciones principales" : "Solo coordinadores pueden recibir notificaciones"}>
                      <FontAwesomeIcon icon={faBell} />
                    </button>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button type="button" onClick={() => handleToggle(member._id, "canRegister")} className={`relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${member.canRegister ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-600"}`} title="Habilitar carga de novedades en App Mobile">
                      <span className={`block w-4 h-4 transform bg-white rounded-full shadow transition-transform duration-200 ease-in-out mt-1 ml-1 ${member.canRegister ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                  Este proyecto no tiene miembros asignados aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={handleSave} disabled={saving || members.length === 0} className="btn-primary flex items-center gap-2">
          {saving ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faSave} />}
          Guardar Cambios
        </button>
      </div>
    </div>
  );
};
