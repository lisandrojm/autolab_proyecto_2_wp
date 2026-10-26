import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faCircleCheck, faCircleXmark, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { dropboxSignBotAPI, type CandidatoAncla, type PrevisualizacionColocacion as Datos, type RectPdf } from "../../api/dropboxSign";
import { InfoModal } from "../ui/InfoModal";

/*
  PREVISUALIZAR LA COLOCACIÓN DE LA FIRMA (22/10/2026): la página del PDF renderizada por el server y,
  encima, EXACTAMENTE lo que el bot va a colocar —el campo de firma, en azul— más el ancla que lo
  definió (verde) y todo lo que se descartó (rojo, con el motivo), por ejemplo «Firma Empleador».
  Las coordenadas vienen en puntos PDF; acá se pasan a porcentajes de la imagen, que tiene la misma
  proporción que la página.
*/

const pct = (v: number, total: number) => `${(v / total) * 100}%`;
const estilo = (r: RectPdf, pagina: { ancho: number; alto: number }): React.CSSProperties => ({ left: pct(r.x, pagina.ancho), top: pct(r.y, pagina.alto), width: pct(Math.max(r.w, 1), pagina.ancho), height: pct(Math.max(r.h, 1), pagina.alto) });

export const PrevisualizacionColocacion: React.FC<{ archivo: string; onClose: () => void }> = ({ archivo, onClose }) => {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setDatos(null);
    setError(null);
    dropboxSignBotAPI
      .previsualizar(archivo)
      .then((d) => vivo && setDatos(d))
      .catch((e: any) => vivo && setError(e?.response?.data?.error || e?.message || "No se pudo previsualizar."));
    return () => {
      vivo = false;
    };
  }, [archivo]);

  const det = datos?.deteccion;
  const ok = det?.ok === true;
  const pagina = datos?.pagina || { numero: 1, total: 1, ancho: 595, alto: 842 };
  const descartadosEnPagina: CandidatoAncla[] = (det?.descartados || []).filter((d) => d.pagina === pagina.numero);
  const descartadosEnOtras: CandidatoAncla[] = (det?.descartados || []).filter((d) => d.pagina !== pagina.numero);

  return (
    <InfoModal isOpen onClose={onClose} title="Previsualizar colocación de la firma" subtitle={archivo} size="xl" zIndex={70} actions={[{ label: "Cerrar", onClick: onClose, variant: "ghost" }]}>
      {error ? (
        <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5" /> {error}
        </p>
      ) : !datos || !det ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <FontAwesomeIcon icon={faSpinner} spin /> Bajando el PDF del Outbox y detectando el ancla…
        </p>
      ) : (
        <div className="space-y-3 text-xs">
          <div className={`rounded-lg border p-3 ${ok ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20" : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"}`}>
            <p className={`flex items-start gap-2 font-semibold ${ok ? "text-green-700 dark:text-green-300" : "text-amber-800 dark:text-amber-300"}`}>
              <FontAwesomeIcon icon={ok ? faCircleCheck : faCircleXmark} className="mt-0.5" />
              <span>
                {det.ok === true
                  ? datos.origen === "plantilla"
                    ? `Posición declarada por la plantilla, en la página ${det.ancla.pagina} de ${pagina.total}: el bot no busca rótulo ni hace OCR. Coloca la firma donde marca el recuadro azul.`
                    : `Ancla encontrada: «${det.ancla.texto}» (${det.ancla.fuente === "ocr" ? "leída por OCR" : "capa de texto"}) en la página ${det.ancla.pagina} de ${pagina.total}. El bot coloca la firma donde marca el recuadro azul.`
                  : `No se envía: ${det.motivo}`}
              </span>
            </p>
            {det.ok === true && <p className="mt-1 text-gray-600 dark:text-gray-300">{det.colocacion.nota}</p>}
            {(datos.avisos || []).map((a) => (
              <p key={a} className="mt-1 text-amber-700 dark:text-amber-300">{a}</p>
            ))}
            <p className="mt-1 text-gray-600 dark:text-gray-300">
              Tipo <strong>{datos.tipo || "sin regla"}</strong>
              {datos.regla ? ` · ${datos.regla.descripcion}` : ""} · Firmante <strong>{datos.firmante ? `${datos.firmante.nombre} (${datos.firmante.email})` : datos.motivoSinFirmante || "no resuelto"}</strong>
              {datos.ocrMs ? ` · OCR ${datos.ocrMs} ms` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600 dark:text-gray-300">
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-5 rounded-sm border-2 border-blue-600 bg-blue-500/20" /> Campo de firma (lo que coloca el bot)</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-5 rounded-sm border-2 border-green-600 bg-green-500/15" /> Ancla elegida</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-5 rounded-sm border-2 border-dashed border-red-600 bg-red-500/10" /> Descartado (no es ancla)</span>
            <span className="ml-auto">
              Página {pagina.numero} de {pagina.total} · {Math.round(pagina.ancho)}×{Math.round(pagina.alto)} pt
            </span>
          </div>

          <div className="mx-auto w-full max-w-[820px] overflow-auto rounded-lg border border-gray-300 bg-gray-100 p-2 dark:border-gray-600 dark:bg-gray-900">
            <div className="relative" style={{ aspectRatio: `${pagina.ancho} / ${pagina.alto}` }}>
              <img src={`data:image/png;base64,${datos.imagen.base64}`} alt={`Página ${pagina.numero}`} className="block h-auto w-full select-none" draggable={false} />
              {descartadosEnPagina.map((d, i) => (
                <div key={`d${i}`} className="absolute border-2 border-dashed border-red-600 bg-red-500/10" style={estilo(d.rect, pagina)} title={`${d.texto} — ${d.motivo}`}>
                  <span className="absolute -top-4 left-0 whitespace-nowrap rounded bg-red-600 px-1 text-[10px] font-semibold text-white">Descartado: {d.texto.slice(0, 30)}</span>
                </div>
              ))}
              {det.ok === true && det.colocacion.linea && <div className="absolute border-t-2 border-green-600" style={{ ...estilo({ ...det.colocacion.linea, h: 0 }, pagina), height: 0 }} title="La línea medida" />}
              {det.ok === true && (
                <div className="absolute border-2 border-green-600 bg-green-500/15" style={estilo(det.ancla.rect, pagina)} title={`Ancla: ${det.ancla.texto}`}>
                  <span className="absolute -bottom-4 left-0 whitespace-nowrap rounded bg-green-600 px-1 text-[10px] font-semibold text-white">Ancla: {det.ancla.texto.slice(0, 30)}</span>
                </div>
              )}
              {det.ok === true && (
                <div className="absolute border-2 border-blue-600 bg-blue-500/20" style={estilo(det.colocacion.campo, pagina)} title={`Campo de firma: ${Math.round(det.colocacion.campo.w)}×${Math.round(det.colocacion.campo.h)} pt`}>
                  <span className="absolute -top-4 left-0 whitespace-nowrap rounded bg-blue-600 px-1 text-[10px] font-semibold text-white">Firma de {datos.firmante?.nombre || "…"}</span>
                </div>
              )}
            </div>
          </div>

          {det.descartados.length > 0 && (
            <div>
              <p className="font-semibold text-gray-700 dark:text-gray-200">Coincidencias descartadas ({det.descartados.length})</p>
              <ul className="mt-1 space-y-0.5 text-gray-600 dark:text-gray-300">
                {det.descartados.map((d, i) => (
                  <li key={i}>
                    <span className="text-red-600 dark:text-red-400">✖</span> pág. {d.pagina}: «{d.texto}» — {d.motivo}
                    {descartadosEnOtras.includes(d) ? " (en otra página)" : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {det.ok === true && (
            <p className="text-gray-500">
              Campo: ({Math.round(det.colocacion.campo.x)}, {Math.round(det.colocacion.campo.y)}) {Math.round(det.colocacion.campo.w)}×{Math.round(det.colocacion.campo.h)} pt · centro ({Math.round(det.colocacion.puntoPdf.x)}, {Math.round(det.colocacion.puntoPdf.y)}) · el bot verifica que el centro del campo colocado quede a ±70 × ±40 pt de ahí.
            </p>
          )}
        </div>
      )}
    </InfoModal>
  );
};
