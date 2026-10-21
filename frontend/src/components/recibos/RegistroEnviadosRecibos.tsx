import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilePdf, faAlignLeft, faFileCsv, faSpinner, faCircleCheck, faClock } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { Modal } from "../ui/Modal";
import { recibosSueldoAPI, type PaginaEnviados, type ReciboEnviado } from "../../api/recibosSueldo";
import { getImageUrl } from "../../utils/imageHelpers";
import { sweetAlert } from "../../utils/sweetAlert";
import { DetalleRecibo, fechaHora, fmtCuil, periodoTexto, pesos } from "./DetalleRecibo";

/*
  REGISTRO DE RECIBOS ENVIADOS (pedido del 21/10/2026: «que quede guardado lo enviado, no perder los
  datos»). Cada recibo que salió a firmar queda en la base con la foto de lo que se mandó: la persona,
  los datos del recibo, el archivo, el código, quién y cuándo, y si volvió firmado. No depende del lote
  y no se borra. Se filtra por período, estado y texto, y se baja entero como CSV.
*/

const POR_PAGINA = 100;

const celdaCsv = (v: unknown) => {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const RegistroEnviadosRecibos: React.FC = () => {
  const [datos, setDatos] = useState<PaginaEnviados | null>(null);
  const [cargando, setCargando] = useState(false);
  const [periodo, setPeriodo] = useState("");
  const [estado, setEstado] = useState("");
  const [buscar, setBuscar] = useState("");
  const [q, setQ] = useState("");
  const [pagina, setPagina] = useState(1);
  const [detalle, setDetalle] = useState<ReciboEnviado | null>(null);
  const [exportando, setExportando] = useState(false);

  // La búsqueda se aplica un rato después de dejar de escribir.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(buscar.trim());
      setPagina(1);
    }, 350);
    return () => clearTimeout(t);
  }, [buscar]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(
        await recibosSueldoAPI.enviados({
          periodo,
          estado,
          q,
          pagina,
          porPagina: POR_PAGINA,
        }),
      );
    } catch (e: any) {
      sweetAlert.error("No se pudo cargar el registro", e?.response?.data?.error || e?.message || "");
    } finally {
      setCargando(false);
    }
  }, [periodo, estado, q, pagina]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrirDetalle = async (fila: ReciboEnviado) => {
    setDetalle(fila);
    try {
      setDetalle(await recibosSueldoAPI.enviado(fila._id));
    } catch {
      /* Queda lo del listado, sin los conceptos. */
    }
  };

  /** Todo lo que coincide con los filtros (no sólo esta página), como CSV para Excel. */
  const exportar = async () => {
    setExportando(true);
    try {
      const filas: ReciboEnviado[] = [];
      for (let p = 1; ; p++) {
        const r = await recibosSueldoAPI.enviados({
          periodo,
          estado,
          q,
          pagina: p,
          porPagina: 500,
        });
        filas.push(...r.items);
        if (filas.length >= r.total || r.items.length === 0) break;
      }
      const cabecera = [
        "Enviado",
        "Enviado por",
        "Persona",
        "Nombre en el recibo",
        "Legajo",
        "CUIL",
        "Proyecto",
        "Período",
        "Categoría",
        "Tarea",
        "Sector",
        "Ingreso",
        "Bruto",
        "Descuentos",
        "Neto a cobrar",
        "N° recibo",
        "Fecha de pago",
        "Código",
        "Archivo enviado",
        "Estado",
        "Firmado",
        "Sábana",
        "TXT",
      ];
      const lineas = filas.map((f) =>
        [
          fechaHora(f.enviadoEl),
          f.nombreEnviadoPor,
          f.nombreUsuario,
          f.datos?.nombre,
          f.datos?.legajo,
          fmtCuil(f.datos?.cuil || ""),
          f.nombreProyecto,
          periodoTexto(f.periodo),
          f.datos?.categoria,
          f.datos?.tarea,
          f.datos?.sector,
          f.datos?.ingreso,
          f.datos?.sueldoBruto,
          f.datos?.descuentos,
          f.datos?.neto,
          f.datos?.numeroRecibo,
          f.datos?.fechaPago,
          f.codigo,
          f.nombreEnviado,
          f.estado,
          f.firmadoEl ? fechaHora(f.firmadoEl) : "",
          f.nombreSabana,
          f.nombreTxt,
        ]
          .map(celdaCsv)
          .join(";"),
      );
      // Con BOM, para que Excel lea las tildes.
      const url = window.URL.createObjectURL(
        new Blob(["﻿" + [cabecera.join(";"), ...lineas].join("\n")], {
          type: "text/csv;charset=utf-8",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `recibos-enviados${periodo ? `-${periodo}` : ""}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      sweetAlert.error("No se pudo exportar", e?.response?.data?.error || e?.message || "");
    } finally {
      setExportando(false);
    }
  };

  const th = "px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 text-left";
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / POR_PAGINA)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={periodo} onChange={(e) => (setPeriodo(e.target.value), setPagina(1))} className="input-field py-2 text-sm w-48">
          <option value="">Todos los períodos</option>
          {(datos?.periodos || []).map((p) => (
            <option key={p} value={p}>
              {periodoTexto(p)}
            </option>
          ))}
        </select>
        <select value={estado} onChange={(e) => (setEstado(e.target.value), setPagina(1))} className="input-field py-2 text-sm w-44">
          <option value="">Enviados y firmados</option>
          <option value="enviado">Esperando firma</option>
          <option value="firmado">Firmados</option>
        </select>
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre, CUIL, legajo, proyecto o código…" className="input-field py-2 text-sm w-80" />
        <span className="text-xs text-gray-500">{datos ? `${datos.total} recibo${datos.total === 1 ? "" : "s"} en el registro` : ""}</span>
        <button
          type="button"
          disabled={exportando || !datos?.total}
          onClick={exportar}
          className="btn-secondary ml-auto flex items-center gap-2 text-sm px-3 py-2 disabled:opacity-50"
          title="Bajar todo lo que coincide con los filtros como CSV (se abre con Excel)"
        >
          <FontAwesomeIcon icon={exportando ? faSpinner : faFileCsv} spin={exportando} /> Descargar CSV
        </button>
      </div>

      {!datos ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : (
        <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto ${cargando ? "opacity-60" : ""}`}>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className={th}>Enviado</th>
                <th className={th}>Persona</th>
                <th className={th}>Legajo</th>
                <th className={th}>CUIL</th>
                <th className={th}>Período</th>
                <th className={th}>Categoría · Tarea</th>
                <th className={`${th} text-right`}>Neto a cobrar</th>
                <th className={th}>Código</th>
                <th className={th}>Estado</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {datos.items.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-500">
                    {datos.total === 0 && !q && !periodo && !estado ? "Todavía no se envió ningún recibo a firmar." : "Ningún recibo enviado coincide con los filtros."}
                  </td>
                </tr>
              )}
              {datos.items.map((f) => (
                <tr key={f._id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <div className="flex flex-col whitespace-nowrap">
                      <span className="text-sm">{fechaHora(f.enviadoEl)}</span>
                      {f.nombreEnviadoPor && <span className="text-[11px] text-gray-400">por {f.nombreEnviadoPor}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col min-w-[12rem]">
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{f.nombreUsuario || f.datos?.nombre || "—"}</span>
                      {f.datos?.nombre && <span className="text-xs text-gray-500">En el recibo: {f.datos.nombre}</span>}
                      {f.nombreProyecto && <span className="text-[11px] text-gray-400">{f.nombreProyecto}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono">{f.datos?.legajo || "—"}</td>
                  <td className="px-4 py-3 text-sm font-mono whitespace-nowrap">{fmtCuil(f.datos?.cuil || "")}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{periodoTexto(f.periodo)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col min-w-[10rem]">
                      <span className="text-sm">{f.datos?.categoria || "—"}</span>
                      {f.datos?.tarea && <span className="text-xs text-gray-500">{f.datos.tarea}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap text-right font-semibold">{pesos(f.datos?.neto)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-mono">{f.codigo || "—"}</span>
                      <span className="text-[11px] text-gray-400 max-w-[16rem] truncate" title={f.nombreEnviado}>
                        {f.nombreEnviado}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {f.estado === "firmado" ? (
                      <span className="inline-flex flex-col">
                        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300">
                          <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" /> Firmado
                        </span>
                        {f.firmadoEl && <span className="text-[11px] text-green-600">{fechaHora(f.firmadoEl)}</span>}
                      </span>
                    ) : (
                      <span className="inline-flex w-fit items-center gap-1 rounded-full border border-purple-200 bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:border-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                        <FontAwesomeIcon icon={faClock} className="h-3 w-3" /> Esperando firma
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {f.archivoUrl && (
                        <a href={getImageUrl(f.archivoUrl)} target="_blank" rel="noreferrer" className="p-2 text-violet-600 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-900/20 rounded-lg" title="Abrir el PDF que se envió">
                          <FontAwesomeIcon icon={faFilePdf} />
                        </a>
                      )}
                      <button type="button" onClick={() => abrirDetalle(f)} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Ver el detalle de lo que se envió">
                        <FontAwesomeIcon icon={faAlignLeft} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {datos && paginas > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} className="btn-secondary px-3 py-1 disabled:opacity-50">
            Anterior
          </button>
          <span className="text-gray-500">
            Página {pagina} de {paginas}
          </span>
          <button type="button" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)} className="btn-secondary px-3 py-1 disabled:opacity-50">
            Siguiente
          </button>
        </div>
      )}

      {detalle && (
        <Modal isOpen onClose={() => setDetalle(null)} title="Recibo enviado" subtitle={`${detalle.nombreUsuario || detalle.datos?.nombre || ""} · enviado ${fechaHora(detalle.enviadoEl)}${detalle.codigo ? ` · ${detalle.codigo}` : ""}`} size="lg">
          <div className="space-y-3">
            <DetalleRecibo datos={detalle.datos} />
            <p className="text-[11px] text-gray-400">
              Salió como «{detalle.nombreEnviado}». Sábana: {detalle.nombreSabana}
              {detalle.nombreTxt ? ` + ${detalle.nombreTxt}` : ""} (páginas {detalle.paginas.join("-")}).
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
};
