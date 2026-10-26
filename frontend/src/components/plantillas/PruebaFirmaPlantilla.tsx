import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faSpinner, faTriangleExclamation, faCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { InfoModal } from "../ui/InfoModal";
import type { PruebaFirmaPlantilla } from "../../api/pruebaFirma";

/**
 * DÓNDE VA A QUEDAR LA FIRMA, EN EL ABM (25/10/2026). La plantilla manda: el documento generado lleva
 * la posición donde cayó {{firma}}, y el bot de Dropbox Sign la usa sin buscar rótulos. Esta ventana
 * la muestra ANTES de generar nada: la página con el recuadro azul, igual que la previsualización del
 * bot, y lo que conviene saber (no está, cae en una página del medio, hay varias).
 */
export const PruebaFirmaPlantillaModal: React.FC<{ probar: () => Promise<PruebaFirmaPlantilla>; onClose: () => void; titulo?: string }> = ({ probar, onClose, titulo }) => {
  const [r, setR] = useState<PruebaFirmaPlantilla | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let vivo = true;
    probar()
      .then((x) => vivo && setR(x))
      .catch((e: any) => vivo && setError(e?.response?.data?.error || e?.message || "No se pudo probar la firma."));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const escala = r?.imagen && r.paginaSize ? r.imagen.ancho / r.paginaSize.w : 1;
  const estado = !r ? null : !r.declara ? "sin" : !r.ok ? "mal" : !r.enviable ? "revision" : "bien";

  return (
    <InfoModal isOpen onClose={onClose} title={titulo || "Dónde va la firma"} subtitle="Con datos de ejemplo, tal como se va a generar el documento" size="lg" zIndex={90} actions={[{ label: "Cerrar", onClick: onClose, variant: "primary" }]}>
      <div className="space-y-3 text-sm">
        {!r && !error && (
          <p className="flex items-center gap-2 text-gray-500">
            <FontAwesomeIcon icon={faSpinner} spin /> Generando un PDF de prueba y ubicando {"{{firma}}"}…
          </p>
        )}
        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        {r && (
          <div
            className={`rounded-lg border px-3 py-2 ${estado === "bien" ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300" : estado === "sin" ? "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300" : estado === "revision" ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300" : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"}`}
          >
            <p className="flex items-start gap-2 font-semibold">
              <FontAwesomeIcon icon={estado === "bien" ? faCircleCheck : estado === "mal" ? faCircleXmark : faTriangleExclamation} className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {estado === "bien" && `Lista para firmar: la firma va en la página ${r.pagina} de ${r.totalPaginas}, donde marca el recuadro azul. El bot la coloca ahí sin buscar rótulos.`}
                {estado === "revision" && `La firma cae en la página ${r.pagina} de ${r.totalPaginas}: el bot sólo coloca en la primera o la última, así que estos documentos van a quedar en revisión.`}
                {estado === "mal" && `${r.motivo} Mientras no se arregle, los documentos de esta plantilla NO se van a poder generar.`}
                {estado === "sin" && r.motivo}
              </span>
            </p>
            {r.avisos.filter((a) => estado !== "revision" || !/página del medio|sólo coloca/.test(a)).map((a) => (
              <p key={a} className="mt-1 text-xs">{a}</p>
            ))}
          </div>
        )}
        {r?.imagen && r.campo && (
          <div className="relative mx-auto overflow-hidden rounded border border-gray-200 dark:border-gray-700" style={{ width: r.imagen.ancho, maxWidth: "100%" }}>
            <img src={`data:image/png;base64,${r.imagen.base64}`} alt={`Página ${r.pagina}`} className="block w-full" />
            {/* El recuadro en puntos PDF → píxeles de la imagen, en porcentajes para que escale con el ancho. */}
            <div
              className="absolute rounded-sm border-2 border-blue-600 bg-blue-500/20"
              style={{
                left: `${((r.campo.x * escala) / r.imagen.ancho) * 100}%`,
                top: `${((r.campo.y * escala) / r.imagen.alto) * 100}%`,
                width: `${((r.campo.w * escala) / r.imagen.ancho) * 100}%`,
                height: `${((r.campo.h * escala) / r.imagen.alto) * 100}%`,
              }}
              title="Campo de firma"
            />
          </div>
        )}
      </div>
    </InfoModal>
  );
};
