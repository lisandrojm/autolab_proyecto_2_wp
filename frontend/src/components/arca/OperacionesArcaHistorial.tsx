import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileCode } from "@fortawesome/free-solid-svg-icons";
import { arcaOperacionesAPI, NOMBRE_OPERACION_ARCA, type OperacionArca, type RegistroOperacionArca } from "../../api/arcaOperaciones";
import { sweetAlert } from "../../utils/sweetAlert";
import { LoadingSpinner } from "../ui/LoadingSpinner";

/*
  EL REGISTRO DE BAJAS, MODIFICACIONES Y ANULACIONES EN ARCA (20/11/2026): una fila por operación, con el
  resultado, de qué lado estuvo el problema cuando falló, lo que se mandó y el acuse. Es el mismo log de las altas
  (`arca_altas_logs`), filtrado por tipo. Se puede acotar a un contrato.
*/

const RESULTADO: Record<string, { texto: string; clase: string }> = {
  presentada: { texto: "ARCA la tomó", clase: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800" },
  ya_hecha: { texto: "Ya estaba hecha", clase: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800" },
  seco: { texto: "En seco", clase: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800" },
  rechazada: { texto: "Rechazada por ARCA", clase: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800" },
  fallida: { texto: "No se pudo", clase: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800" },
  indeterminado: { texto: "Sin confirmar", clase: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800" },
  en_curso: { texto: "En curso", clase: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700" },
  fallo: { texto: "Falló", clase: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800" },
};

const fechaHora = (v?: string) => (v ? new Date(v).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "");

export const OperacionesArcaHistorial: React.FC<{ userProjectId?: string; contratoKey?: string | null }> = ({ userProjectId, contratoKey }) => {
  const [filas, setFilas] = useState<RegistroOperacionArca[] | null>(null);
  const [filtro, setFiltro] = useState<"" | OperacionArca>("");
  const [buscar, setBuscar] = useState("");

  useEffect(() => {
    setFilas(null);
    arcaOperacionesAPI
      .historial({ userProjectId, contratoKey: contratoKey || undefined })
      .then(setFilas)
      .catch((e) => {
        sweetAlert.error("No se pudo cargar el registro", e?.response?.data?.error || e?.message || "");
        setFilas([]);
      });
  }, [userProjectId, contratoKey]);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (filas || []).filter((f) => (!filtro || f.tipo === filtro) && (!q || `${f.contrato?.nombre || ""} ${f.contrato?.cuil || ""} ${f.empresaRazonSocial} ${f.quien}`.toLowerCase().includes(q)));
  }, [filas, filtro, buscar]);

  const verPantalla = async (f: RegistroOperacionArca) => {
    try {
      const html = await arcaOperacionesAPI.htmlDe(f._id);
      const w = window.open("", "_blank");
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
      }
    } catch (e: any) {
      sweetAlert.error("No se pudo abrir la pantalla", e?.response?.data?.error || e?.message || "");
    }
  };

  if (filas === null) return <LoadingSpinner message="Cargando datos..." />;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as any)} className="input-field text-sm w-auto">
          <option value="">Todas las operaciones</option>
          {(["baja", "modificacion", "anulacion"] as OperacionArca[]).map((k) => (
            <option key={k} value={k}>
              {NOMBRE_OPERACION_ARCA[k]}
            </option>
          ))}
        </select>
        {!userProjectId && <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre, CUIL, empresa o quién…" className="input-field text-sm w-72" />}
        <span className="text-xs text-gray-500">{visibles.length} de {filas.length}</span>
      </div>
      {visibles.length === 0 ? (
        <p className="text-sm text-gray-500">Todavía no hay bajas, modificaciones ni anulaciones hechas desde acá.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 pr-3">Cuándo</th>
                <th className="py-2 pr-3">Operación</th>
                {!userProjectId && <th className="py-2 pr-3">Persona</th>}
                <th className="py-2 pr-3">Empleadora</th>
                <th className="py-2 pr-3">Qué se mandó</th>
                <th className="py-2 pr-3">Resultado</th>
                <th className="py-2 pr-3">Acuse</th>
                <th className="py-2 pr-3">Quién</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const r = RESULTADO[f.resultado] || RESULTADO.fallo;
                const payload = Object.entries(f.operacion?.payload || {}).filter(([k]) => k !== "obraSocialTexto");
                const acuse = Object.entries(f.operacion?.acuse || {}).filter(([, v]) => v);
                return (
                  <tr key={f._id} className="border-b border-gray-100 dark:border-gray-800 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{fechaHora(f.fecha)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {NOMBRE_OPERACION_ARCA[f.tipo]}
                      {f.operacion?.que ? ` (${f.operacion.que})` : ""}
                      {f.enSeco && <span className="ml-1 text-blue-700 dark:text-blue-300">· seco</span>}
                    </td>
                    {!userProjectId && (
                      <td className="py-2 pr-3">
                        {f.contrato?.nombre || "—"}
                        {f.operacion?.sinContrato && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] font-bold uppercase" title="La relación no tenía contrato en WeProdu: el resultado quedó sólo en este registro.">sin contrato</span>}
                        <div className="text-gray-500">{f.contrato?.cuil}</div>
                      </td>
                    )}
                    <td className="py-2 pr-3">{f.empresaRazonSocial}</td>
                    <td className="py-2 pr-3">
                      {payload.map(([k, v]) => (
                        <div key={k}>
                          <span className="text-gray-500">{k}:</span> {String(v)}
                        </div>
                      ))}
                      {(f.operacion?.cambios || []).map((c) => (
                        <div key={c.campo}>
                          <span className="text-gray-500">{c.campo}:</span> {c.antes || "vacío"} → {c.despues}
                        </div>
                      ))}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${r.clase}`}>{r.texto}</span>
                      {f.operacion?.clase === "regla_arca" && <div className="text-red-700 dark:text-red-400 mt-1 max-w-xs">ARCA: {f.textoArca || f.contrato?.motivo || f.error}</div>}
                      {f.operacion?.clase === "navegacion" && <div className="text-amber-800 dark:text-amber-300 mt-1 max-w-xs">Navegación: {f.error || f.contrato?.motivo}</div>}
                      {f.resultado === "indeterminado" && <div className="text-amber-800 dark:text-amber-300 mt-1 max-w-xs">{f.contrato?.motivo || f.error}</div>}
                      {f.operacion?.pantallaDesconocida && <div className="text-amber-800 dark:text-amber-300 mt-1">Pantalla desconocida guardada: hay que relevarla.</div>}
                    </td>
                    <td className="py-2 pr-3 font-mono">{acuse.length ? acuse.map(([k, v]) => `${k.toUpperCase()} ${String(v)}`).join(" · ") : f.operacion?.leidoDe === "listado" ? "leído del listado" : "—"}</td>
                    <td className="py-2 pr-3">{f.quien || (f.enSeco ? "" : "—")}</td>
                    <td className="py-2">
                      {!f.enSeco && f.resultado !== "en_curso" && (
                        <button type="button" onClick={() => verPantalla(f)} title="La pantalla de ARCA como quedó, anonimizada" className="text-gray-500 hover:text-blue-600">
                          <FontAwesomeIcon icon={faFileCode} className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default OperacionesArcaHistorial;
