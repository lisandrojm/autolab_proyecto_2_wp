import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faFileCsv, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { dropboxSignAPI, type FirmadoRescatado, type PaginaRescatados } from "../../api/dropboxSign";
import { InfoModal } from "../ui/InfoModal";

/*
  EL REGISTRO DE LOS FIRMADOS RESCATADOS DESDE EL EMAIL (23/10/2026): cada PDF firmado que la
  integración de Dropbox NO depositó en «Requested signatures» y que la lectura de la casilla subió
  desde el adjunto del aviso. Es permanente (colección propia, no el historial de lecturas) y se exporta
  a CSV. Sólo registra lo que entró por ese camino: lo que depositó la integración no figura.
*/

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const POR_PAGINA = 100;

const csvDe = (filas: FirmadoRescatado[]): string => {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cab = ["Rescatado el", "Archivo", "Código", "Firmante", "CUIL", "Tamaño (bytes)", "Carpeta", "Asunto del aviso", "Veces"];
  const cuerpo = filas.map((f) => [fmt(f.rescatadoEl), f.archivo, f.codigo, f.firmante, f.cuit, f.bytes, f.carpeta, f.asunto, f.veces].map(esc).join(";"));
  return `﻿${cab.map(esc).join(";")}\n${cuerpo.join("\n")}`;
};

export const RegistroRescatados: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [q, setQ] = useState("");
  const [buscar, setBuscar] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<PaginaRescatados | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await dropboxSignAPI.rescates({ q: buscar || undefined, desde: desde || undefined, hasta: hasta || undefined, pagina, porPagina: POR_PAGINA }));
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "No se pudo leer el registro.");
    } finally {
      setCargando(false);
    }
  }, [buscar, desde, hasta, pagina]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const exportar = async () => {
    // Todo lo que matchea el filtro, no sólo la página.
    const todo = await dropboxSignAPI.rescates({ q: buscar || undefined, desde: desde || undefined, hasta: hasta || undefined, pagina: 1, porPagina: 500 });
    const blob = new Blob([csvDe(todo.filas)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `firmados-rescatados-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const totalPaginas = datos ? Math.max(1, Math.ceil(datos.total / POR_PAGINA)) : 1;
  const inputClass = "px-3 py-1.5 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30";

  return (
    <InfoModal isOpen onClose={onClose} title="Registro de firmados rescatados desde el email" subtitle={datos ? `${datos.totalTenant} en total · lo que la integración de Dropbox no depositó y se subió desde el adjunto del aviso` : undefined} size="xl" actions={[{ label: "Cerrar", onClick: onClose, variant: "ghost" }]}>
      <div className="space-y-3 text-xs">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPagina(1);
            setBuscar(q.trim());
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por archivo, código, firmante o asunto…" className={`${inputClass} min-w-[260px] flex-1`} />
          <label className="inline-flex items-center gap-1 text-gray-500">
            Desde <input type="date" value={desde} onChange={(e) => (setPagina(1), setDesde(e.target.value))} className={inputClass} />
          </label>
          <label className="inline-flex items-center gap-1 text-gray-500">
            Hasta <input type="date" value={hasta} onChange={(e) => (setPagina(1), setHasta(e.target.value))} className={inputClass} />
          </label>
          <button type="submit" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
            <FontAwesomeIcon icon={faMagnifyingGlass} /> Buscar
          </button>
          <button type="button" onClick={exportar} disabled={!datos || datos.total === 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50" title="Exporta lo que matchea el filtro (hasta 500 filas)">
            <FontAwesomeIcon icon={faFileCsv} /> CSV
          </button>
        </form>

        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        {cargando && !datos ? (
          <p className="flex items-center gap-2 text-gray-500">
            <FontAwesomeIcon icon={faSpinner} spin /> Cargando…
          </p>
        ) : datos && datos.filas.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">{datos.totalTenant === 0 ? "Todavía no hubo rescates: la integración de Dropbox venía depositando todos los firmados." : "Nada coincide con el filtro."}</p>
        ) : datos ? (
          <>
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="min-w-full">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/60 text-[11px] uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left whitespace-nowrap">Rescatado el</th>
                    <th className="px-3 py-2 text-left">Archivo subido a la carpeta de firmados</th>
                    <th className="px-3 py-2 text-left">Código</th>
                    <th className="px-3 py-2 text-left">Firmante</th>
                    <th className="px-3 py-2 text-right">Tamaño</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {datos.filas.map((f) => (
                    <tr key={f._id} className="align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">
                        {fmt(f.rescatadoEl)}
                        {f.veces > 1 && <span className="ml-1 text-gray-400" title="Se rescató más de una vez (alguien borró el archivo de la carpeta y volvió a faltar)">×{f.veces}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-mono break-all text-gray-800 dark:text-gray-100">{f.archivo}</p>
                        <p className="text-gray-500 break-all" title={f.asunto}>
                          {f.carpeta} · aviso: {f.asunto.length > 90 ? `${f.asunto.slice(0, 87)}…` : f.asunto}
                        </p>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-gray-700 dark:text-gray-200">{f.codigo || "—"}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                        {f.firmante || "—"}
                        {f.cuit && <p className="text-gray-500">CUIL {f.cuit}</p>}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-gray-600 dark:text-gray-300">{kb(f.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-gray-500">
              <span>
                {datos.total} resultado{datos.total === 1 ? "" : "s"} · página {datos.pagina} de {totalPaginas}
              </span>
              <span className="flex gap-2">
                <button type="button" disabled={pagina <= 1 || cargando} onClick={() => setPagina((p) => p - 1)} className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40 dark:border-gray-600">
                  Anterior
                </button>
                <button type="button" disabled={pagina >= totalPaginas || cargando} onClick={() => setPagina((p) => p + 1)} className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40 dark:border-gray-600">
                  Siguiente
                </button>
              </span>
            </div>
          </>
        ) : null}
      </div>
    </InfoModal>
  );
};
