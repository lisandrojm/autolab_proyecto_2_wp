import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faCircleInfo, faFilePdf, faEyeSlash, faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { InfoModal } from '../ui/InfoModal';
import { paritariasAPI, EstadoParitarias } from '../../api/paritarias';
import { formatearInstante } from '../../utils/fechas';

/**
 * Los avisos de la vigilancia de paritarias, con la misma forma que los cuatro de `/arca/categorias`.
 *
 * Son DOS avisos distintos y van separados a propósito:
 *
 *   ámbar  publicaciones nuevas sin ver → hay algo para leer
 *   rojo   fuentes con problema         → la vigilancia está CIEGA
 *
 * El rojo es peor que el ámbar y por eso va primero. Una novedad sin leer es trabajo pendiente y se
 * ve; una fuente que devolvió cero enlaces o falló la última revisión significa que puede haber
 * salido un acuerdo y nadie se enteró — y por fuera no se distingue de «no hay novedades», que es
 * exactamente lo que la vuelve peligrosa.
 *
 * Mezclarlos en un solo cartel haría que una fuente caída se leyera como tranquilidad.
 *
 * LA VIGILANCIA ES GLOBAL; EL AVISO ES POR EMPRESA
 *
 * La página del SATSAID se baja UNA vez por día para toda la plataforma y la publicación se guarda
 * UNA vez: bajarla por empresa sería descortés con un sitio del que dependemos y multiplicaría por N
 * el trabajo de arreglar un patrón roto. Lo que cambia por empresa es a quién se le muestra — con
 * `empresaId`, solo las fuentes que alimentan convenios que ESA empleadora tiene registrados.
 *
 * Sin `empresaId` no se filtra nada, y es deliberado: en el catálogo de la plataforma tiene que
 * verse TODO, porque es ahí donde se arregla una fuente ciega. Una fuente rota que solo se le muestra
 * a las empresas afectadas es una fuente rota que nadie con permiso para tocarla ve.
 */
export const BannerParitarias: React.FC<{ empresaId?: string }> = ({ empresaId }) => {
  const [estado, setEstado] = useState<EstadoParitarias | null>(null);
  const [verNuevas, setVerNuevas] = useState(false);
  const [verProblemas, setVerProblemas] = useState(false);

  const cargar = () =>
    paritariasAPI
      .estado(empresaId)
      .then(setEstado)
      // Si falla, silencio: un aviso sobre la vigilancia disparado por un error de red diría algo
      // falso. La rutina diaria deja su registro en el log del server igual.
      .catch(() => setEstado(null));

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  if (!estado) return null;

  /** Los dos datos que formatea son INSTANTES, no fechas de calendario. Ver `utils/fechas.ts`. */
  const fmt = formatearInstante;

  const marcarVista = async (id: string) => {
    await paritariasAPI.marcarVista(id);
    await cargar();
  };

  const MOTIVO: Record<string, string> = {
    sin_enlaces: 'no encontró ningún enlace',
    error_red: 'no se pudo alcanzar la página',
    error_parseo: 'no se pudo leer el HTML',
  };

  return (
    <div className="space-y-2">
      {/* ── Rojo: la vigilancia está ciega. Va primero porque es lo más grave. ── */}
      {estado.conProblema.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-3 py-2">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
            <span className="text-xs text-red-800 dark:text-red-300 min-w-0 truncate mr-0.5">
              {estado.conProblema.length === 1 ? (
                <>
                  <strong>{estado.conProblema[0].nombre}</strong> no está vigilando
                </>
              ) : (
                <>
                  Hay <strong>{estado.conProblema.length} fuentes</strong> que no están vigilando
                </>
              )}
              <span className="hidden sm:inline text-red-700/80 dark:text-red-400/80"> — puede haber salido una paritaria y nadie se enteró</span>
            </span>
            <button type="button" onClick={() => setVerProblemas(true)} title="Ver qué les pasa" aria-label="Ver las fuentes que no están vigilando" className="shrink-0 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors">
              <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
            </button>
          </div>

          <InfoModal isOpen={verProblemas} onClose={() => setVerProblemas(false)} title={estado.conProblema.length === 1 ? 'Una fuente no está vigilando' : `${estado.conProblema.length} fuentes no están vigilando`} size="md">
            <div className="space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                Estas fuentes fallaron su última revisión. <strong>Cero enlaces no es «no hay novedades»</strong>: si una página venía devolviendo acuerdos y de golpe no devuelve ninguno, cambió de
                estructura o el patrón dejó de servir. Mientras tanto, un acuerdo nuevo pasaría sin que nadie lo vea.
              </p>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                {estado.conProblema.map((f) => (
                  <div key={f._id} className="px-3 py-2.5 text-sm">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{f.nombre}</span>
                      <span className="text-xs text-red-700 dark:text-red-400">
                        {(f.ultimoResultado && (MOTIVO[f.ultimoResultado] || f.ultimoResultado)) || 'no se pudo leer el motivo'} · última revisión {fmt(f.ultimaRevision)}
                      </span>
                    </div>
                    {f.ultimoError && <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{f.ultimoError}</p>}
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline break-all">
                      {f.url} <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2 w-2" />
                    </a>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">Abrí la página a mano y comparala con el patrón de la fuente. Casi siempre es que la entidad reorganizó su sitio.</p>
            </div>
          </InfoModal>
        </>
      )}

      {/* ── Ámbar: hay algo nuevo para leer. ─────────────────────────────────── */}
      {estado.sinVer.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
            <FontAwesomeIcon icon={faFilePdf} className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-xs text-amber-800 dark:text-amber-300 min-w-0 truncate mr-0.5">
              {estado.sinVer.length === 1 ? (
                <>
                  Hay <strong>1 publicación nueva</strong> sin ver
                </>
              ) : (
                <>
                  Hay <strong>{estado.sinVer.length} publicaciones nuevas</strong> sin ver
                </>
              )}
              <span className="hidden sm:inline text-amber-700/80 dark:text-amber-400/80"> — {[...new Set(estado.sinVer.flatMap((p) => p.fuente?.convenios || []))].join(', ')}</span>
            </span>
            <button type="button" onClick={() => setVerNuevas(true)} title="Ver cuáles son" aria-label="Ver las publicaciones nuevas" className="shrink-0 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors">
              <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
            </button>
          </div>

          <InfoModal isOpen={verNuevas} onClose={() => setVerNuevas(false)} title={estado.sinVer.length === 1 ? 'Una publicación nueva' : `${estado.sinVer.length} publicaciones nuevas`} size="md">
            <div className="space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                Apareció esto en las páginas que vigilamos. <strong>El sistema no las abre ni lee los importes</strong>: solo avisa que salieron y deja el enlace. Cargar la escala sigue siendo manual,
                con el botón «Paritaria» del convenio.
              </p>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                {estado.sinVer.map((p) => (
                  <div key={p._id} className="px-3 py-2.5 text-sm">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {p.fuente?.nombre} · {(p.fuente?.convenios || []).join(', ')}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{fmt(p.detectadaEl)}</span>
                    </div>
                    <a href={p.url} target="_blank" rel="noreferrer" className="block text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline mt-0.5">
                      {p.textoEnlace || p.url.split('/').pop()} <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
                    </a>
                    {/* Marcar como vista NO la procesa: la saca del aviso. Es lo que permite decir
                        «esto ya lo miré» sin tener que cargar la escala en el mismo momento. */}
                    <button type="button" onClick={() => marcarVista(p._id)} className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
                      <FontAwesomeIcon icon={faEyeSlash} className="h-3 w-3" />
                      Marcar como vista
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </InfoModal>
        </>
      )}
    </div>
  );
};
