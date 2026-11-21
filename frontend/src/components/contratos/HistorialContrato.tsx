import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClockRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { usersAPI, EventoAuditoriaContrato } from "../../api/users";
import { LoadingSpinner } from "../ui/LoadingSpinner";

/*
  EL HISTORIAL DE UN CONTRATO (etapa 3, 19/11/2026): lo que registró la auditoría, donde se ve el
  contrato. Cuándo se creó, cada cambio campo por campo (antes → después), la anulación, y quién lo hizo
  (una persona desde la app, un script con su nombre o el sistema). Se pide al abrirlo, no antes.
  Si la consulta falla se dice: un historial vacío por error se confundiría con «nunca cambió».
*/

const TIPO: Record<EventoAuditoriaContrato["tipo"], { texto: string; clase: string }> = {
  creado: { texto: "Creado", clase: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  modificado: { texto: "Modificado", clase: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  anulado: { texto: "Anulado", clase: "bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900" },
  quitado: { texto: "Quitado", clase: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300" },
};

const valor = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "vacío";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
  return typeof v === "object" ? JSON.stringify(v) : String(v);
};

const quien = (e: EventoAuditoriaContrato) => {
  if (e.origen === "app") return e.porNombre || "alguien desde la app";
  if (e.origen === "script") return `${e.detalle || "un script"}${e.porNombre ? ` (${e.porNombre})` : ""}`;
  return e.detalle && e.detalle !== "sin contexto" ? `el sistema (${e.detalle})` : "el sistema";
};

export const HistorialContrato: React.FC<{ userId: string; contratoKey?: string | null }> = ({ userId, contratoKey }) => {
  const [abierto, setAbierto] = useState(false);
  const [eventos, setEventos] = useState<EventoAuditoriaContrato[] | null>(null);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!abierto || eventos || error || !contratoKey) return;
    setError("");
    usersAPI
      .auditoriaDeContrato(userId, contratoKey)
      .then(setEventos)
      .catch((e) => setError(e?.response?.data?.error || "No se pudo cargar el historial."));
  }, [abierto, eventos, error, intento, userId, contratoKey]);

  if (!contratoKey) return null;
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setAbierto((a) => !a)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-300">
        <FontAwesomeIcon icon={faClockRotateLeft} className="h-3 w-3" />
        {abierto ? "Ocultar historial" : "Historial"}
      </button>
      {abierto && (
        <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-3 text-xs">
          {error ? (
            <p className="text-rose-700 dark:text-rose-300">
              {error}{" "}
              <button type="button" className="underline" onClick={() => { setError(""); setIntento((n) => n + 1); }}>
                Reintentar
              </button>
            </p>
          ) : !eventos ? (
            <LoadingSpinner message="Cargando datos..." size="sm" />
          ) : eventos.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">Sin cambios registrados. La auditoría empezó el 19/11/2026: lo anterior no está acá (una anulación anterior se ve en su tarjeta).</p>
          ) : (
            <ol className="space-y-2">
              {eventos.map((e) => (
                <li key={e._id} className="border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded font-bold ${TIPO[e.tipo].clase}`}>{TIPO[e.tipo].texto}</span>
                    <span className="text-gray-700 dark:text-gray-200">{new Date(e.el).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</span>
                    <span className="text-gray-500 dark:text-gray-400">por {quien(e)}</span>
                  </div>
                  {e.motivo && <p className="mt-0.5 text-gray-700 dark:text-gray-300"><span className="font-semibold">Motivo:</span> {e.motivo}</p>}
                  {e.cambios.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {e.cambios.map((c) => (
                        <li key={c.campo} className="text-gray-600 dark:text-gray-300 break-words">
                          <span className="font-mono text-[11px] text-gray-500">{c.campo}</span>: <span className="line-through decoration-gray-400">{valor(c.antes)}</span> → <span className="font-semibold">{valor(c.despues)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {e.nota && <p className="mt-0.5 italic text-gray-500 dark:text-gray-400">{e.nota}</p>}
                  {e.origen === "app" && e.detalle && <p className="mt-0.5 text-[11px] text-gray-400">{e.detalle}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
};

export default HistorialContrato;
