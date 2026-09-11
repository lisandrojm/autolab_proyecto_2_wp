import React, { useState, useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserPlus, faSearch } from "@fortawesome/free-solid-svg-icons";
import { usersAPI, User } from "../../api/users";
import { Project } from "../../api/projects";
import { sweetAlert } from "../../utils/sweetAlert";
import { SolicitudVista, SolicitudesTable, solicitudDesdeUser, useCatalogosDeSolicitudes } from "../solicitudes/SolicitudesTable";

interface TeamSolicitudesTabProps {
  projectId: string;
  project: Project;
  /** Abre el wizard de Agregar Miembro precargado con la solicitud (la aprobación se hace ahí). */
  onApprove: (user: User) => void;
  /** Cambia para forzar recarga de la lista (p.ej. tras aprobar desde el wizard). */
  refreshSignal?: number;
}

/**
 * Las solicitudes de ESTE proyecto.
 *
 * La tabla y todo lo que hay que resolver para dibujarla (rol frame en sus tres formas, categoría,
 * trámite impositivo, estados) viven en `SolicitudesTable`, compartido con la pantalla global de
 * Solicitudes. Acá solo queda lo propio de la pestaña: traer las solicitudes, quedarse con las de
 * este proyecto y entregar el `User` completo al wizard que las aprueba.
 */
export const TeamSolicitudesTab: React.FC<TeamSolicitudesTabProps> = ({ projectId, onApprove, refreshSignal }) => {
  const [solicitudes, setSolicitudes] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const catalogos = useCatalogosDeSolicitudes();

  const fetchSolicitudes = async () => {
    try {
      setLoading(true);
      setSolicitudes(await usersAPI.listSolicitudes());
    } catch (error) {
      console.error("Error fetching solicitudes:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSolicitudes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, refreshSignal]);

  /** El `User` original de cada fila: el wizard de aprobación lo necesita entero. */
  const porId = useMemo(() => new Map(solicitudes.map((u) => [String(u._id), u])), [solicitudes]);

  const filtradas: SolicitudVista[] = useMemo(() => {
    return solicitudes
      .filter((u) => {
        if (!u.metadata?.projectIds?.includes(projectId)) return false;
        if (searchTerm) {
          const name = (u.metadata?.fullName || `${u.firstName} ${u.lastName}`).toLowerCase();
          if (!name.includes(searchTerm.toLowerCase())) return false;
        }
        return true;
      })
      .map(solicitudDesdeUser);
  }, [solicitudes, projectId, searchTerm]);

  const cambiarEstado = async (s: SolicitudVista, status: "rechazada" | "pendiente", confirmar?: { titulo: string; texto: string; ok: string }) => {
    if (confirmar) {
      const r = await sweetAlert.confirm(confirmar.titulo, confirmar.texto, confirmar.ok);
      if (!r.isConfirmed) return;
    }
    try {
      await usersAPI.setSolicitudStatus(s._id, status);
      sweetAlert.success(status === "rechazada" ? "Solicitud Rechazada" : "Solicitud reabierta", status === "rechazada" ? "La solicitud quedó marcada como rechazada." : "Volvió a quedar pendiente de aprobación.");
      fetchSolicitudes();
    } catch (error: any) {
      sweetAlert.error("Error", error.response?.data?.error || "Error al cambiar el estado de la solicitud");
    }
  };

  /** Borrado definitivo: solo desde el admin, para depurar el listado. */
  const handleDelete = async (s: SolicitudVista) => {
    const result = await sweetAlert.confirm("¿Eliminar solicitud?", `Se eliminará definitivamente la solicitud de ${s.nombre}. Esta acción no se puede deshacer.`, "Sí, eliminar");
    if (!result.isConfirmed) return;

    try {
      await usersAPI.rejectSolicitud(s._id);
      sweetAlert.success("Solicitud Eliminada", "La solicitud fue eliminada.");
      fetchSolicitudes();
    } catch (error: any) {
      sweetAlert.error("Error", error.response?.data?.error || "Error al eliminar la solicitud");
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
          <FontAwesomeIcon icon={faSearch} />
        </span>
        <input type="text" className="input-field pl-10 h-10 w-full" placeholder="Buscar solicitudes..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>

      {filtradas.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center h-48 text-gray-500">
          <FontAwesomeIcon icon={faUserPlus} className="h-10 w-10 mb-3 opacity-10" />
          <p className="text-sm font-medium">No hay solicitudes pendientes para este proyecto</p>
          <p className="text-xs mt-1 text-gray-400">Las solicitudes de alta desde mobile aparecerán aquí.</p>
        </div>
      ) : (
        <SolicitudesTable
          solicitudes={filtradas}
          catalogos={catalogos}
          onAprobar={(s) => {
            const original = porId.get(s._id);
            if (original) onApprove(original);
          }}
          onRechazar={(s) => cambiarEstado(s, "rechazada", { titulo: "¿Rechazar solicitud?", texto: `La solicitud de ${s.nombre} quedará registrada como rechazada.`, ok: "Sí, rechazar" })}
          onReabrir={(s) => cambiarEstado(s, "pendiente")}
          onEliminar={handleDelete}
        />
      )}
    </div>
  );
};
