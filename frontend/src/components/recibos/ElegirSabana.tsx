import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilePdf, faFileLines, faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import type { LoteRecibos } from "../../api/recibosSueldo";
import { fechaHora, periodoTexto } from "./DetalleRecibo";

/*
  ELEGIR LA SÁBANA (pedido del 21/10/2026): las sábanas subidas en una ventana, cada una con sus números
  como badges (recibos, listos, enviados, firmados, sin persona, de dónde salen los datos y cuándo se
  subió), en vez de un select con todo en una línea de texto.
*/

export interface ConteoLote {
  total: number;
  listos: number;
  sinPersona: number;
  enviados: number;
  firmados: number;
}

/** Los números de un lote: del resumen del listado o, si no viene, de sus recibos. */
export const conteoDe = (l: LoteRecibos): ConteoLote =>
  l.resumen ?? {
    total: l.recibos.length,
    listos: l.recibos.filter((r) => r.estado === "listo").length,
    sinPersona: l.recibos.filter((r) => r.estado === "sin_persona").length,
    enviados: l.recibos.filter((r) => r.estado === "enviado").length,
    firmados: l.recibos.filter((r) => r.estado === "firmado").length,
  };

const Badge: React.FC<{ clase: string; children: React.ReactNode; title?: string }> = ({ clase, children, title }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${clase}`} title={title}>
    {children}
  </span>
);

/** Los badges de un lote. Los que valen cero no se muestran, salvo el total. */
export const BadgesLote: React.FC<{ lote: LoteRecibos; conteo?: ConteoLote; conFecha?: boolean }> = ({ lote, conteo, conFecha = true }) => {
  const c = conteo ?? conteoDe(lote);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge clase="border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-200">
        {c.total} recibo{c.total === 1 ? "" : "s"}
      </Badge>
      {c.listos > 0 && <Badge clase="border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">{c.listos} listos</Badge>}
      {c.enviados > 0 && <Badge clase="border-purple-200 bg-purple-100 text-purple-700 dark:border-purple-800 dark:bg-purple-900/30 dark:text-purple-300">{c.enviados} enviados</Badge>}
      {c.firmados > 0 && <Badge clase="border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300">{c.firmados} firmados</Badge>}
      {c.sinPersona > 0 && <Badge clase="border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">{c.sinPersona} sin persona</Badge>}
      {lote.fuente === "txt" ? (
        <Badge clase="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300" title={lote.nombreTxt || ""}>
          <FontAwesomeIcon icon={faFileLines} className="h-2.5 w-2.5" /> Datos del TXT
        </Badge>
      ) : (
        <Badge clase="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">Leído por OCR</Badge>
      )}
      {lote.paginas > 0 && <Badge clase="border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">{lote.paginas} páginas</Badge>}
      {conFecha && <Badge clase="border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400" title="Cuándo se subió">Subida {fechaHora(lote.createdAt)}</Badge>}
    </span>
  );
};

export const ElegirSabana: React.FC<{ lotes: LoteRecibos[]; actual: string | null; onElegir: (id: string) => void; onClose: () => void }> = ({ lotes, actual, onElegir, onClose }) => {
  const [buscar, setBuscar] = useState("");
  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return q ? lotes.filter((l) => `${l.nombreArchivo} ${l.nombreTxt || ""} ${periodoTexto(l.periodo)}`.toLowerCase().includes(q)) : lotes;
  }, [lotes, buscar]);
  return (
    <Modal isOpen onClose={onClose} title="Elegir sábana" subtitle={`${lotes.length} sábana${lotes.length === 1 ? "" : "s"} subida${lotes.length === 1 ? "" : "s"}, las más nuevas primero`} size="lg">
      <div className="space-y-3">
        <input autoFocus value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por archivo o período…" className="input-field w-full" />
        <ul className="max-h-[60vh] space-y-2 overflow-auto pr-1">
          {filtrados.length === 0 && <li className="py-6 text-center text-sm text-gray-500">Ninguna sábana coincide.</li>}
          {filtrados.map((l) => {
            const elegida = l._id === actual;
            return (
              <li key={l._id}>
                <button
                  type="button"
                  onClick={() => {
                    onElegir(l._id);
                    onClose();
                  }}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${elegida ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-200 hover:border-blue-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/60"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{periodoTexto(l.periodo)}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-semibold text-gray-800 dark:text-gray-100" title={l.nombreArchivo}>
                        <FontAwesomeIcon icon={faFilePdf} className="text-red-500" /> {l.nombreArchivo}
                      </p>
                    </div>
                    {elegida && <FontAwesomeIcon icon={faCircleCheck} className="mt-1 text-blue-600" title="La que estás viendo" />}
                  </div>
                  <div className="mt-2">
                    <BadgesLote lote={l} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
};
