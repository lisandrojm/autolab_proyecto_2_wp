import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faMagnifyingGlass, faTrash, faTriangleExclamation, faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { dropboxSignBotAPI, type EstadoBorradores, type ResultadoBorradores } from "../../api/dropboxSign";
import { sweetAlert } from "../../utils/sweetAlert";

/*
  «BORRADORES EN DROPBOX SIGN» (26/10/2026). Cada documento que el bot carga y no envía deja un borrador.
  Dos pasos: «Revisar» (en seco: lista qué se eliminaría y qué se saltea, sin borrar) y «Eliminar los N»,
  que pide escribir el número y borra sólo los títulos de esa revisión. Borrar en Dropbox Sign es
  permanente: no hay papelera.
*/

const POLL_MS = 2000;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export const BorradoresCard: React.FC = () => {
  const [estado, setEstado] = useState<EstadoBorradores | null>(null);
  const [arrancando, setArrancando] = useState(false);
  const [verTodos, setVerTodos] = useState(false);

  const cargar = useCallback(async () => {
    const e = await dropboxSignBotAPI.borradores().catch(() => null);
    if (e) setEstado(e);
    return e;
  }, []);

  const corriendo = !!estado?.ultimo?.corriendo;
  useEffect(() => {
    void cargar();
  }, [cargar]);
  useEffect(() => {
    if (!corriendo) return;
    const t = window.setInterval(() => void cargar(), POLL_MS);
    return () => window.clearInterval(t);
  }, [corriendo, cargar]);

  const revisar = async () => {
    setArrancando(true);
    try {
      await dropboxSignBotAPI.revisarBorradores();
      await cargar();
    } catch (e: any) {
      sweetAlert.error("No se pudo revisar", e?.response?.data?.error || e?.message || "");
    } finally {
      setArrancando(false);
    }
  };

  const rev = estado?.revision || null;
  const vencida = !!rev?.terminadaEl && Date.now() - new Date(rev.terminadaEl).getTime() > (estado?.vigenciaMin || 60) * 60_000;
  const n = rev?.candidatos.length || 0;

  const limpiar = async () => {
    if (!rev || !n) return;
    const r = await sweetAlert.prompt(`Eliminar ${n} borrador(es) en Dropbox Sign`, {
      text: `Se eliminan para siempre (no hay papelera) los ${n} borradores de la revisión del ${fmt(rev.terminadaEl)}, cuyos títulos son exactamente archivos del bot. Los salteados no se tocan. Para confirmar, escribí ${n}.`,
      placeholder: String(n),
      confirmText: `Eliminar los ${n}`,
      mensajeVacio: `Escribí ${n} para confirmar.`,
      validar: (v) => (v.trim() === String(n) ? null : `Escribí ${n} para confirmar.`),
    });
    if (!r.isConfirmed) return;
    setArrancando(true);
    try {
      await dropboxSignBotAPI.limpiarBorradores(n);
      await cargar();
    } catch (e: any) {
      sweetAlert.error("No se pudo limpiar", e?.response?.data?.error || e?.message || "");
    } finally {
      setArrancando(false);
    }
  };

  const ultimo: ResultadoBorradores | null = estado?.ultimo || null;
  const btn = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-50";
  const lista = rev ? (verTodos ? rev.candidatos : rev.candidatos.slice(0, 8)) : [];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <FontAwesomeIcon icon={faTrash} /> Borradores en Dropbox Sign
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Cada documento que el bot carga y no envía (en seco, sin verificar, límite) deja un borrador. Primero se revisa en seco; eliminar es permanente.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={revisar} disabled={arrancando || corriendo} className={`${btn} border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`}>
            <FontAwesomeIcon icon={corriendo && ultimo?.tipo === "revision" ? faSpinner : faMagnifyingGlass} spin={corriendo && ultimo?.tipo === "revision"} /> Revisar (en seco)
          </button>
          <button type="button" onClick={limpiar} disabled={arrancando || corriendo || !n || vencida} className={`${btn} border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20`} title={vencida ? "La revisión tiene más de una hora: volvé a revisar." : !n ? "Primero revisá." : undefined}>
            <FontAwesomeIcon icon={corriendo && ultimo?.tipo === "limpieza" ? faSpinner : faTrash} spin={corriendo && ultimo?.tipo === "limpieza"} /> {n ? `Eliminar los ${n}` : "Eliminar"}
          </button>
        </div>
      </div>

      {corriendo && ultimo && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
          <p className="font-semibold">
            <FontAwesomeIcon icon={faSpinner} spin /> {ultimo.tipo === "revision" ? "Revisando en seco…" : "Eliminando borradores…"}
          </p>
          <p className="mt-1 font-mono text-[11px]">{ultimo.eventos[ultimo.eventos.length - 1]?.texto}</p>
        </div>
      )}

      {!corriendo && ultimo?.tipo === "limpieza" && (
        <div className={`rounded-lg border p-3 text-xs ${ultimo.error || ultimo.cortada ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200" : "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200"}`}>
          <p className="font-semibold">
            <FontAwesomeIcon icon={ultimo.error || ultimo.cortada ? faTriangleExclamation : faCircleCheck} /> {fmt(ultimo.terminadaEl)}: {ultimo.borrados.length} de {ultimo.candidatos.length} eliminado(s).
          </p>
          {(ultimo.error || ultimo.cortada) && <p className="mt-1">Se cortó: {ultimo.error || ultimo.cortada}. No se borró nada más; el detalle queda en los logs.</p>}
        </div>
      )}

      {!corriendo && ultimo?.tipo === "revision" && ultimo.error && (
        <p className="text-xs text-red-600 dark:text-red-400">
          <FontAwesomeIcon icon={faTriangleExclamation} /> La revisión falló: {ultimo.error}
        </p>
      )}

      {rev && !corriendo && (
        <div className="space-y-2 text-xs">
          <p className="text-gray-700 dark:text-gray-200">
            Revisión del {fmt(rev.terminadaEl)}
            {vencida && <span className="text-amber-600"> (vencida: volvé a revisar)</span>}: <strong>{rev.total ?? "?"}</strong> borradores en Dropbox Sign · <strong className="text-red-700 dark:text-red-300">{n}</strong> del bot para eliminar · <strong>{rev.salteados.length}</strong> salteados.
          </p>
          {n > 0 && (
            <ul className="max-h-64 overflow-auto rounded border border-gray-200 p-2 font-mono text-[11px] text-gray-600 dark:border-gray-700 dark:text-gray-300">
              {lista.map((c, i) => (
                <li key={i} className="truncate" title={c.titulo}>
                  {c.titulo}
                </li>
              ))}
              {rev.candidatos.length > 8 && (
                <li>
                  <button type="button" onClick={() => setVerTodos((v) => !v)} className="text-blue-600 hover:underline dark:text-blue-400">
                    {verTodos ? "Ver menos" : `Ver los ${rev.candidatos.length}`}
                  </button>
                </li>
              )}
            </ul>
          )}
          {rev.salteados.length > 0 && (
            <details>
              <summary className="cursor-pointer text-gray-500">Salteados ({rev.salteados.length}): no se tocan</summary>
              <ul className="mt-1 max-h-48 overflow-auto font-mono text-[11px] text-gray-500">
                {rev.salteados.map((s, i) => (
                  <li key={i}>
                    {s.texto.slice(0, 90)} — <span className="italic">{s.motivo}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
};
