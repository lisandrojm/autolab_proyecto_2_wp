import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faArrowUpRightFromSquare, faEyeSlash, faEye, faFilePdf, faTriangleExclamation, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { Modal } from '../ui/Modal';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { sweetAlert } from '../../utils/sweetAlert';
import { formatearInstante } from '../../utils/fechas';
import { paritariasAPI, FuenteParitaria, PublicacionDeFuente } from '../../api/paritarias';

/**
 * QUÉ SE DETECTÓ EN ESTA FUENTE. La pantalla que faltaba.
 *
 * El ABM decía «31 publicación(es)» y no había ninguna forma de verlas: ni lista, ni enlace, ni
 * archivo. Había 33 publicaciones en la base y cero pantallas que las mostraran — el sistema avisaba
 * de algo que nadie podía abrir, que es la mitad de un aviso.
 *
 * EL PDF GUARDADO ES LA ACCIÓN PRINCIPAL, y el enlace al sitio es el dato secundario. Es al revés de
 * como estaba: la `url` apunta al sitio del gremio, y los gremios reorganizan sus webs. El día que
 * muevan ese PDF, el enlace deja de servir y el archivo guardado es lo único que queda para
 * respaldar el importe con el que se liquidó.
 *
 * ESTA PANTALLA NO LEE NADA. Muestra qué se bajó y deja descargarlo. Extraer importes es otra capa,
 * con otra confiabilidad, y termina en una decisión de una persona.
 */

interface Props {
  fuente: FuenteParitaria;
  onClose: () => void;
  /** Para que el contador de la fila se actualice al marcar algo como visto. */
  onCambiado: () => Promise<void> | void;
}

const enKb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

export const PublicacionesDeFuente: React.FC<Props> = ({ fuente, onClose, onCambiado }) => {
  const [pubs, setPubs] = useState<PublicacionDeFuente[] | null>(null);
  const [ocupado, setOcupado] = useState('');

  const cargar = async () => {
    try {
      setPubs(await paritariasAPI.publicacionesDeFuente(fuente._id));
    } catch {
      setPubs([]);
    }
  };
  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuente._id]);

  const descargar = async (p: PublicacionDeFuente) => {
    setOcupado(p._id);
    try {
      const blob = await paritariasAPI.descargarArchivo(p._id);
      // Mismo gesto que la plantilla de los catálogos: blob + enlace efímero. El endpoint pide token,
      // así que un `<a href>` directo no serviría.
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = p.archivo?.nombreOriginal || 'acuerdo.pdf';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      sweetAlert.error('No se pudo descargar', e?.response?.data?.error || 'El archivo no está disponible.');
    } finally {
      setOcupado('');
    }
  };

  const alternarVista = async (p: PublicacionDeFuente) => {
    setOcupado(p._id);
    try {
      await paritariasAPI.marcarVista(p._id);
      await cargar();
      await onCambiado();
    } finally {
      setOcupado('');
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Publicaciones detectadas" subtitle={`${fuente.nombre} · ${(fuente.convenios || []).join(', ') || 'sin convenios'}`} size="lg">
      {pubs === null ? (
        <LoadingSpinner />
      ) : pubs.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">Esta fuente todavía no detectó ningún acuerdo.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Lo que apareció en la página del gremio. <strong>El sistema no los abre ni lee los importes</strong>: guarda el archivo y deja el enlace. Cargar la escala sigue siendo manual.
          </p>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
            {pubs.map((p) => (
              <div key={p._id} className={`px-3 py-2.5 ${!p.vista ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                      {p.textoEnlace || p.url.split('/').pop()}
                      {!p.vista && <span className="ml-2 text-[10px] px-1.5 py-px rounded bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-bold uppercase tracking-wide">sin ver</span>}
                    </span>
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                      detectada el {formatearInstante(p.detectadaEl)}
                      {p.archivo && ` · ${enKb(p.archivo.bytes)}`}
                    </span>
                    {/* El enlace al sitio queda como dato secundario: es el que puede morirse. */}
                    <a href={p.url} target="_blank" rel="noreferrer" className="block text-[11px] text-blue-600 dark:text-blue-400 hover:underline break-all mt-0.5">
                      {p.url} <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2 w-2" />
                    </a>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => descargar(p)}
                      disabled={!p.archivo?.disponible || !!ocupado}
                      title={p.archivo?.disponible ? `Descargar ${p.archivo.nombreOriginal}` : 'No hay PDF guardado de esta publicación'}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FontAwesomeIcon icon={ocupado === p._id ? faSpinner : p.archivo?.disponible ? faDownload : faFilePdf} spin={ocupado === p._id} className="h-3 w-3" />
                      PDF
                    </button>
                    {/* Marcar como vista no procesa nada: la saca del aviso. Es lo que permite decir
                        «esto ya lo miré» sin cargar la escala en el mismo momento. */}
                    <button
                      onClick={() => alternarVista(p)}
                      disabled={p.vista || !!ocupado}
                      title={p.vista ? 'Ya está marcada como vista' : 'Marcar como vista'}
                      className="p-2 rounded text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FontAwesomeIcon icon={p.vista ? faEye : faEyeSlash} className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/*
                  El motivo por el que NO hay archivo, cuando lo hay.

                  Casi siempre significa que el PDF cambió o desapareció del sitio del gremio — que es
                  exactamente el riesgo que guardar el archivo viene a cubrir, ocurriendo. Decirlo es
                  más útil que un botón gris sin explicación.
                */}
                {!p.archivo && p.archivoError && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                    <span>{p.archivoError}</span>
                  </p>
                )}
                {!p.archivo && !p.archivoError && <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">Sin PDF guardado: se detectó antes de que el sistema guardara los archivos.</p>}
                {p.archivo && !p.archivo.disponible && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-red-600 dark:text-red-400">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                    <span>El registro dice que hay un archivo pero no está en el disco.</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};
