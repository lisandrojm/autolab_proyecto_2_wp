import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheckCircle, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { Pdf } from "../api/pdf";

interface PdfAssignmentStatusProps {
  templates: Pdf[];
}

export function PdfAssignmentStatus({ templates }: PdfAssignmentStatusProps) {
  const codesToCheck = [
    { section: "Pedidos", code: "dinero", label: "Dinero", description: "Para pedidos monetarios (viáticos, reembolsos)" },
    { section: "Pedidos", code: "fechaRango", label: "Fecha - Rango", description: "Para licencias, permisos (días múltiples)" },
    { section: "Pedidos", code: "fechasMultiples", label: "Fecha - Múltiples", description: "Para una o más fechas puntuales" },
    { section: "Pedidos", code: "objeto", label: "Objeto", description: "Para solicitudes de equipamiento y materiales" },
    { section: "Pedidos", code: "otros", label: "Otros", description: "Para solicitudes genéricas y otros tipos" },
    { section: "Vacaciones", code: "vacaciones", label: "Vacaciones", description: "Para solicitudes de vacaciones" },
  ] as const;

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Cobertura de Plantillas por Tipo</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Asegúrese de tener al menos una plantilla activa para cada tipo de código para garantizar que todos los pedidos funcionen correctamente.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sección</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo de Código</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descripción</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Plantilla Asignada</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {codesToCheck.map((item) => {
              const matchingTemplate = templates.find((t) => t.code === item.code && t.isActive);
              const isCovered = !!matchingTemplate;

              return (
                <tr key={item.code} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${item.section === "Vacaciones" ? "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300" : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"}`}>{item.section}</span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {item.label}
                    <div className="text-xs text-gray-400 font-mono mt-0.5">{item.code}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{item.description}</td>
                  <td className="px-4 py-3 text-sm">
                    {isCovered ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/20 text-xs">
                        <FontAwesomeIcon icon={faCheckCircle} /> Cubierto
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium px-2 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-xs">
                        <FontAwesomeIcon icon={faExclamationTriangle} /> Falta Plantilla
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{matchingTemplate ? <span className="font-medium">{matchingTemplate.name}</span> : <span className="text-gray-400 italic">-- Ninguna --</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
