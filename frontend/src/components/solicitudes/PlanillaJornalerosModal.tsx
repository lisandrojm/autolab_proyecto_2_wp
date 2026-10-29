import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExcel, faSpinner, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { planillaJornalerosAPI, ResumenPlanillaJornaleros } from "../../api/planillaJornaleros";

/*
  LA PLANILLA DE JORNALEROS DEL MES: se elige el mes, se ve qué va a salir (contratos, jornadas, neto
  pactado y los avisos: sin legajo, montos de prueba, fechas fuera del mes…) y se descarga el .xlsx.
  Los avisos no frenan la descarga: son lo que hay que revisar antes de liquidar.
*/

const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const pesos = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

/** `mesInicial` ("YYYY-MM"): el mes con que abre (en Reportes de Novedades, el de «Fecha desde»). */
export const PlanillaJornalerosModal: React.FC<{ isOpen: boolean; onClose: () => void; mesInicial?: string; zIndex?: number }> = ({ isOpen, onClose, mesInicial, zIndex }) => {
  const [mes, setMes] = useState(() => mesInicial || mesActual());
  const [resumen, setResumen] = useState<ResumenPlanillaJornaleros | null>(null);
  const [cargando, setCargando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState("");

  // Cada vez que se abre, arranca en el mes del reporte.
  useEffect(() => {
    if (isOpen && mesInicial) setMes(mesInicial);
  }, [isOpen, mesInicial]);

  useEffect(() => {
    if (!isOpen || !mes) return;
    let vigente = true;
    setCargando(true);
    setError("");
    planillaJornalerosAPI
      .resumen(mes)
      .then((r) => vigente && setResumen(r))
      .catch((e) => vigente && (setResumen(null), setError(e?.response?.data?.message || "No se pudo armar la planilla.")))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [isOpen, mes]);

  const descargar = async () => {
    if (!resumen) return;
    setDescargando(true);
    setError("");
    try {
      const blob = await planillaJornalerosAPI.xlsx(mes);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = resumen.archivo;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo generar la planilla.");
    } finally {
      setDescargando(false);
    }
  };

  const vacia = !!resumen && resumen.totales.jornadas === 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Planilla de jornaleros"
      subtitle="Solicitudes aprobadas de tipo Jornada que empiezan en el mes"
      size="lg"
      zIndex={zIndex}
      footer={
        <div className="flex w-full justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cerrar
          </button>
          <button type="button" onClick={() => void descargar()} disabled={!resumen || vacia || cargando || descargando} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
            <FontAwesomeIcon icon={descargando ? faSpinner : faFileExcel} spin={descargando} />
            {resumen ? `Descargar ${resumen.archivo}` : "Descargar"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <label className="block">
          <span className="mb-1 block font-semibold text-gray-700 dark:text-gray-300">Mes</span>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
        </label>

        {cargando ? (
          <p className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <FontAwesomeIcon icon={faSpinner} spin /> Armando la planilla…
          </p>
        ) : error ? (
          <p className="text-red-600 dark:text-red-400">{error}</p>
        ) : resumen ? (
          <>
            {vacia ? (
              <p className="text-gray-600 dark:text-gray-300">No hay solicitudes de Jornada aprobadas que empiecen en este mes.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Contratos", String(resumen.totales.contratos)],
                  ["Jornadas", String(resumen.totales.jornadas)],
                  ["Personas", String(resumen.totales.personas)],
                  ["Neto pactado", pesos(resumen.totales.netoPactado)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
                    <dt className="text-xs text-gray-500 dark:text-gray-400">{k}</dt>
                    <dd className="font-semibold text-gray-900 dark:text-white">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {resumen.advertencias.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="mb-2 flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  Revisar antes de liquidar ({resumen.advertencias.length})
                </p>
                <ul className="max-h-64 list-disc space-y-1 overflow-y-auto pl-5 text-amber-900 dark:text-amber-200">
                  {resumen.advertencias.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
};
