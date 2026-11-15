import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSave, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { sweetAlert } from "../../utils/sweetAlert";
import { vacationConfigAPI, type ComputoAntiguedad } from "../../api/vacationConfig";
import { AntiguedadPorEmpresaConfig, COMPUTO_POR_DEFECTO } from "./AntiguedadPorEmpresaConfig";

/**
 * LA PESTAÑA «ANTIGÜEDAD POR EMPRESA» de Vacaciones › Reglas (15/11/2026, pedido del usuario): de qué
 * empleadora se toma la antigüedad. Guarda sólo `computoAntiguedad`, como Ventana Anual guarda sólo
 * su ventana: no pisa lo que otra pestaña haya cambiado.
 */
export const AntiguedadPorEmpresaTab: React.FC = () => {
  const [computo, setComputo] = useState<ComputoAntiguedad | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    vacationConfigAPI
      .getConfig()
      .then((c) => setComputo({ ...COMPUTO_POR_DEFECTO, ...(c.computoAntiguedad || {}) }))
      .catch(() => {
        sweetAlert.error("Error", "No se pudo cargar la configuración de vacaciones");
        setComputo({ ...COMPUTO_POR_DEFECTO });
      });
  }, []);

  const guardar = async () => {
    if (!computo) return;
    setGuardando(true);
    try {
      const guardada = await vacationConfigAPI.updateConfig({ computoAntiguedad: computo });
      setComputo({ ...COMPUTO_POR_DEFECTO, ...(guardada.computoAntiguedad || {}) });
      sweetAlert.success("Actualizado", "Antigüedad por empresa guardada");
    } catch (error: any) {
      sweetAlert.error("Error", error.response?.data?.error || "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  if (!computo) return <LoadingSpinner message="Cargando..." />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
      <AntiguedadPorEmpresaConfig valor={computo} onChange={setComputo} />
      <div className="flex justify-end">
        <button type="button" onClick={guardar} disabled={guardando} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2">
          <FontAwesomeIcon icon={guardando ? faSpinner : faSave} spin={guardando} />
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
};
