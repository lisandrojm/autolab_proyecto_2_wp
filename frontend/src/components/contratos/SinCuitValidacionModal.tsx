import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faUpload, faTrash, faFileLines, faCircleInfo, faDownload } from "@fortawesome/free-solid-svg-icons";
import { ContractOverviewRow, SinCuitValidacion } from "../../api/users";
import { afipAPI } from "../../api/afip";
import { Modal } from "../ui/Modal";
import { sweetAlert } from "../../utils/sweetAlert";
import { getImageUrl } from "../../utils/imageHelpers";

/**
 * Documentación de respaldo del flujo "Sin CUIT".
 *
 * Estas personas (extranjeras) todavía no tienen CUIT/CUIL argentino: el trámite de AFIP/ANSES NO
 * está descartado, queda PENDIENTE hasta que cuenten con la documentación migratoria necesaria
 * (DNI precario, residencia en trámite, etc.). Mientras tanto se avanza con el contrato de forma
 * excepcional, y lo que se carga acá es el respaldo de esa excepción.
 *
 * Reglas del flujo:
 *  - Hace falta AL MENOS un documento cargado para poder marcar la validación.
 *  - Quien valida y la fecha/hora los completa el server (no se editan desde acá).
 *  - La fecha de seguimiento arranca a 90 días del primer respaldo, para revisar más adelante si la
 *    persona ya obtuvo el CUIL y puede pasar al flujo normal de AFIP.
 */

export const TIPOS_DOC_SIN_CUIT: { value: string; label: string }[] = [
  { value: "pasaporte", label: "Pasaporte" },
  { value: "dni_precario", label: "DNI precario" },
  { value: "residencia_tramite", label: "Constancia de residencia en trámite" },
  { value: "cuil_provisorio", label: "CUIL provisorio" },
  { value: "otro", label: "Otro" },
];

const labelTipo = (tipo: string): string => TIPOS_DOC_SIN_CUIT.find((t) => t.value === tipo)?.label || tipo;

const fmtFechaHora = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

interface Props {
  row: ContractOverviewRow;
  isOpen: boolean;
  onClose: () => void;
  /** Se llama con la validación actualizada para refrescar la fila sin recargar toda la tabla. */
  onChange: (validacion: SinCuitValidacion) => void;
}

export const SinCuitValidacionModal: React.FC<Props> = ({ row, isOpen, onClose, onChange }) => {
  const validacion = row.sinCuitValidacion || { documentos: [] };
  const documentos = validacion.documentos || [];

  const [tipo, setTipo] = useState(TIPOS_DOC_SIN_CUIT[0].value);
  const [numero, setNumero] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<number | null>(null);
  const [cambiandoValidado, setCambiandoValidado] = useState(false);

  const target = { projectId: row.projectId, userId: row.userId, contractIndex: row.contractIndex };

  const limpiarForm = () => {
    setTipo(TIPOS_DOC_SIN_CUIT[0].value);
    setNumero("");
    setObservaciones("");
    setArchivo(null);
  };

  const agregar = async () => {
    if (!numero.trim()) {
      sweetAlert.error("Falta el número", "Cargá el número o identificador del documento.");
      return;
    }
    setGuardando(true);
    try {
      const res = await afipAPI.sinCuitAgregarDocumento({ ...target, tipo, numero: numero.trim(), observaciones: observaciones.trim() || undefined, archivo });
      onChange(res.sinCuitValidacion);
      limpiarForm();
      sweetAlert.success("Documentación cargada", "Se agregó el documento de respaldo.");
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo guardar la documentación.");
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (docIndex: number) => {
    const res = await sweetAlert.confirm("¿Eliminar el documento?", "Se va a quitar este respaldo. Si es el último, la validación vuelve a quedar pendiente.", "Sí, eliminar");
    if (!res.isConfirmed) return;
    setBorrando(docIndex);
    try {
      const r = await afipAPI.sinCuitBorrarDocumento({ ...target, docIndex });
      onChange(r.sinCuitValidacion);
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo eliminar el documento.");
    } finally {
      setBorrando(null);
    }
  };

  const cambiarValidado = async (valor: boolean) => {
    setCambiandoValidado(true);
    try {
      const r = await afipAPI.sinCuitSetValidado({ ...target, validado: valor });
      onChange(r.sinCuitValidacion);
    } catch (e: any) {
      sweetAlert.error("No se pudo validar", e?.response?.data?.error || "No se pudo guardar la validación.");
    } finally {
      setCambiandoValidado(false);
    }
  };

  const cambiarSeguimiento = async (fecha: string) => {
    try {
      const r = await afipAPI.sinCuitSetValidado({ ...target, validado: !!validacion.validado, fechaSeguimiento: fecha });
      onChange(r.sinCuitValidacion);
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo guardar la fecha de seguimiento.");
    }
  };

  const inputClass = "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white";
  const labelClass = "block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Documentación de respaldo — ${row.userName}`} size="lg" zIndex={80}>
      <div className="space-y-5">
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 px-3 py-2.5">
          <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-800 dark:text-blue-200">
            El trámite de AFIP/ANSES de esta persona queda <strong>pendiente</strong> hasta que cuente con la documentación migratoria necesaria. Mientras tanto, el contrato avanza de forma excepcional
            respaldado por lo que se cargue acá. Hace falta al menos un documento para poder validar.
          </p>
        </div>

        {/* Documentos ya cargados */}
        <div>
          <p className="text-sm font-bold text-gray-900 dark:text-white mb-2">Documentos cargados ({documentos.length})</p>
          {documentos.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Todavía no se cargó ningún documento de respaldo.</p>
          ) : (
            <div className="space-y-2">
              {documentos.map((d, i) => (
                <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {labelTipo(d.tipo)} <span className="font-mono text-xs text-gray-500">{d.numero}</span>
                    </p>
                    {d.observaciones && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{d.observaciones}</p>}
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {d.cargadoPorNombre ? `Cargado por ${d.cargadoPorNombre}` : "Cargado"} {d.cargadoAt ? `· ${fmtFechaHora(d.cargadoAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {d.archivoUrl && (
                      <a href={getImageUrl(d.archivoUrl)} target="_blank" rel="noopener noreferrer" title={d.archivoNombre || "Ver archivo"} className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                        <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
                      </a>
                    )}
                    <button type="button" onClick={() => borrar(i)} disabled={borrando === i} title="Eliminar" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 transition-colors disabled:opacity-50">
                      <FontAwesomeIcon icon={borrando === i ? faSpinner : faTrash} spin={borrando === i} className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alta de un documento nuevo */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Agregar documento</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Tipo de documento *</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputClass}>
                {TIPOS_DOC_SIN_CUIT.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Número / identificador *</label>
              <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} className={inputClass} placeholder="Ej: AB123456" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Archivo adjunto</label>
            <label className="flex items-center gap-3 px-3 py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/30">
              <FontAwesomeIcon icon={faFileLines} className="text-gray-400" />
              <span className="text-xs text-gray-600 dark:text-gray-300">{archivo ? archivo.name : "Seleccionar PDF o imagen (JPG/PNG), hasta 10 MB"}</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
            </label>
          </div>
          <div>
            <label className={labelClass}>Observaciones</label>
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} className={inputClass} placeholder="Notas sobre el estado del trámite migratorio, vencimientos, etc." />
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={agregar} disabled={guardando} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-60">
              <FontAwesomeIcon icon={guardando ? faSpinner : faUpload} spin={guardando} className="h-4 w-4" />
              {guardando ? "Guardando..." : "Agregar documento"}
            </button>
          </div>
        </div>

        {/* Validación + seguimiento */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white">Validación</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {documentos.length === 0
                  ? "Cargá al menos un documento de respaldo para poder validar."
                  : validacion.validado
                    ? `Validado${validacion.validadoPorNombre ? ` por ${validacion.validadoPorNombre}` : ""}${validacion.validadoAt ? ` · ${fmtFechaHora(validacion.validadoAt)}` : ""}`
                    : "Pendiente de validación."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!validacion.validado}
              disabled={documentos.length === 0 || cambiandoValidado}
              onClick={() => cambiarValidado(!validacion.validado)}
              title={documentos.length === 0 ? "Cargá al menos un documento de respaldo" : validacion.validado ? "Quitar la validación" : "Marcar como validado"}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${validacion.validado ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${validacion.validado ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          <div>
            <label className={labelClass}>Fecha de seguimiento</label>
            <input type="date" value={validacion.fechaSeguimiento || ""} onChange={(e) => cambiarSeguimiento(e.target.value)} className={`${inputClass} max-w-xs`} />
            <p className="text-[11px] text-gray-400 mt-1">Cuándo volver a revisar si ya obtuvo el CUIL y puede pasar al flujo normal de AFIP. Por defecto, 90 días desde la primera carga.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
};
