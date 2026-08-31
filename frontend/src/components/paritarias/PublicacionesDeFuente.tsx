import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faArrowUpRightFromSquare, faEyeSlash, faEye, faFilePdf, faTriangleExclamation, faSpinner, faFileLines, faSearch, faXmark, faBoxArchive } from '@fortawesome/free-solid-svg-icons';
import { Modal } from '../ui/Modal';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { sweetAlert } from '../../utils/sweetAlert';
import { formatearInstante } from '../../utils/fechas';
import { paritariasAPI, FuenteParitaria, PublicacionDeFuente, ExtraccionPublicacion, TextoPublicacion } from '../../api/paritarias';

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

/**
 * LAS SEÑALES, COMO ETIQUETAS EN LA FILA.
 *
 * Una sola merece color, y es a propósito: si todas gritan, ninguna se lee. `unidadSospechosa` va en
 * ámbar porque es la única que anuncia un error que ninguna validación posterior puede atrapar
 * —cargar un tarifario «por jornada» como sueldo mensual declara mal la remuneración ante ARCA, y
 * los números están todos bien—. El resto es contexto: útil para decidir, no urgente.
 *
 * Cada etiqueta lleva su FRAGMENTO en el tooltip. Sin él la detección no se puede verificar sin
 * volver a abrir el PDF, que es el trabajo que la extracción vino a evitar.
 */
const Etiqueta: React.FC<{ tono?: 'gris' | 'ambar' | 'rojo'; titulo?: string; children: React.ReactNode }> = ({ tono = 'gris', titulo, children }) => {
  const tonos = {
    gris: 'bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300 border-gray-200 dark:border-gray-600',
    ambar: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-bold',
    rojo: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300 dark:border-red-800 font-bold',
  };
  return (
    <span title={titulo} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${tonos[tono]} ${titulo ? 'cursor-help' : ''}`}>
      {children}
    </span>
  );
};

const SenalesDeExtraccion: React.FC<{ e: ExtraccionPublicacion | null; conveniosDeLaFuente: string[] }> = ({ e, conveniosDeLaFuente }) => {
  if (!e) return <Etiqueta titulo="Todavía no se extrajo el texto de este PDF. Se genera con: npm run paritarias-texto">sin texto extraído</Etiqueta>;

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1.5">
      {/*
        CERO CARACTERES NO ES ÉXITO. Un PDF escaneado extrae nada, y mostrarlo como una publicación
        normal haría que más adelante alguien concluya «este acuerdo no menciona ningún convenio»
        cuando lo que pasa es que nunca se leyó.
      */}
      {e.estado !== 'ok' && (
        <Etiqueta tono="rojo" titulo={e.motivo}>
          {e.estado === 'vacio' ? 'sin capa de texto' : 'no se pudo extraer'}
        </Etiqueta>
      )}

      {e.unidadSospechosa && (
        <Etiqueta tono="ambar" titulo={`El documento dice «${e.unidadSospechosa.valor}». Sus importes NO son mensuales: cargarlos como sueldo bruto declararía mal la remuneración ante ARCA.\n\n…${e.unidadSospechosa.fragmento}…`}>
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" />
          {e.unidadSospechosa.valor}
        </Etiqueta>
      )}

      {e.conveniosMencionados.map((c) => (
        <Etiqueta key={c.valor} titulo={`…${c.fragmento}…`}>
          <span className="font-mono">{c.valor}</span>
        </Etiqueta>
      ))}

      {/*
        Se SEÑALA, no se descarta. «Este acuerdo no menciona ninguno de los convenios de esta fuente»
        es información para quien decide, no una regla para borrar.
      */}
      {e.cotejoConvenios === 'ajeno' && (
        <Etiqueta titulo={`Cita ${e.conveniosMencionados.map((c) => c.valor).join(', ')} y esta fuente alimenta ${conveniosDeLaFuente.join(', ')}. No se descarta: mirala y decidí.`}>ajeno a esta fuente</Etiqueta>
      )}
      {e.cotejoConvenios === 'sin_mencion' && e.estado === 'ok' && (
        <Etiqueta titulo="El texto no nombra ningún CCT. No quiere decir que sea ajeno: los tarifarios de actores son tablas de escala que no citan el número de convenio.">sin CCT citado</Etiqueta>
      )}

      {e.periodoMencionado && <Etiqueta titulo={`…${e.periodoMencionado.fragmento}…`}>{e.periodoMencionado.valor}</Etiqueta>}
      {e.periodoCoincide === false && <Etiqueta tono="ambar" titulo="El período que dice el PDF no cae dentro del que anuncia el enlace. Puede ser que el gremio haya colgado otro documento: la vigencia que se cargue saldría mal.">período distinto al del enlace</Etiqueta>}
      {e.expediente && <Etiqueta titulo={`…${e.expediente.fragmento}…`}>{e.expediente.valor}</Etiqueta>}
    </div>
  );
};

/** El texto plano, en un panel. Se pide al abrir: no viaja con la lista. */
const PanelTexto: React.FC<{ publicacionId: string; onClose: () => void }> = ({ publicacionId, onClose }) => {
  const [t, setT] = useState<TextoPublicacion | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    paritariasAPI
      .textoDePublicacion(publicacionId)
      .then(setT)
      .catch((e) => setError(e?.response?.data?.error || 'No se pudo leer el texto.'));
  }, [publicacionId]);

  return (
    <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <FontAwesomeIcon icon={faFileLines} className="h-3 w-3 text-gray-500" />
        <span className="text-[11px] text-gray-600 dark:text-gray-300 min-w-0 truncate">
          {t ? `${t.nombreArchivo} · ${t.paginas} pág · ${t.caracteres.toLocaleString('es-AR')} caracteres` : 'cargando…'}
          {t?.extractor && <span className="text-gray-400"> · {t.extractor}</span>}
        </span>
        <button onClick={onClose} title="Cerrar el texto" className="ml-auto shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
        </button>
      </div>
      {error ? (
        <p className="px-3 py-3 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : !t ? (
        <p className="px-3 py-3 text-[11px] text-gray-500">Leyendo…</p>
      ) : (
        <>
          {t.motivo && <p className="px-3 pt-2 text-[11px] text-amber-700 dark:text-amber-400">{t.motivo}</p>}
          {/* Monoespaciado y con los saltos tal cual: el texto conserva las columnas de las tablas,
              y reflowearlo perdería qué importe corresponde a qué grupo. */}
          <pre className="px-3 py-2 text-[10.5px] font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words max-h-72 overflow-y-auto">{t.texto || '(vacío)'}</pre>
        </>
      )}
    </div>
  );
};

export const PublicacionesDeFuente: React.FC<Props> = ({ fuente, onClose, onCambiado }) => {
  const [pubs, setPubs] = useState<PublicacionDeFuente[] | null>(null);
  const [ocupado, setOcupado] = useState('');
  /*
    El buscador va CONTRA EL SERVIDOR, no filtrando en el cliente.

    Lo que hay que buscar es el texto de los PDF —«¿cuál acuerdo cubría julio?»— y son ~25 KB por
    publicación: traer los 31 para filtrarlos acá serían 800 KB por cada tecla. Mongo lo resuelve con
    su índice de texto y devuelve solo las que coinciden.
  */
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState('');
  const [textoAbierto, setTextoAbierto] = useState('');

  const cargar = async (q = buscando) => {
    try {
      setPubs(await paritariasAPI.publicacionesDeFuente(fuente._id, q));
    } catch {
      setPubs([]);
    }
  };
  useEffect(() => {
    void cargar('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuente._id]);

  const buscar = async (q: string) => {
    setBuscando(q);
    setPubs(null);
    setTextoAbierto('');
    await cargar(q);
  };

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
      {/*
        BUSCAR ADENTRO DE LOS PDF, no en el título del enlace.

        Con 31 acuerdos del SATSAID, «¿cuál cubría julio?» no puede exigir abrirlos de a uno — que es
        exactamente el trabajo que la extracción de texto vino a evitar.
      */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void buscar(busqueda);
        }}
        className="flex items-stretch gap-2 mb-3"
      >
        <div className="relative flex-1">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en el texto de los acuerdos: «julio», «presentismo», un expediente…"
            className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
        <button type="submit" className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
          Buscar
        </button>
        {buscando && (
          <button
            type="button"
            onClick={() => {
              setBusqueda('');
              void buscar('');
            }}
            title="Ver todas de nuevo"
            className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          >
            <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
          </button>
        )}
      </form>

      {pubs === null ? (
        <LoadingSpinner />
      ) : pubs.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
          {buscando ? `Ningún acuerdo de esta fuente menciona «${buscando}».` : 'Esta fuente todavía no detectó ningún acuerdo.'}
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Lo que apareció en la página del gremio. El sistema extrae el <strong>texto</strong> y detecta señales, pero <strong>no lee importes ni tablas</strong>: cargar la escala sigue siendo manual.
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
                    {/* Leer sin abrir el PDF. Es lo que hace que revisar 31 acuerdos sea posible. */}
                    <button
                      onClick={() => setTextoAbierto((x) => (x === p._id ? '' : p._id))}
                      disabled={!p.extraccion || p.extraccion.estado === 'error'}
                      title={p.extraccion ? (p.extraccion.estado === 'error' ? p.extraccion.motivo : 'Ver el texto extraído') : 'Todavía no se extrajo el texto de este PDF'}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FontAwesomeIcon icon={faFileLines} className="h-3 w-3" />
                      {textoAbierto === p._id ? 'Ocultar' : 'Ver texto'}
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

                <SenalesDeExtraccion e={p.extraccion} conveniosDeLaFuente={fuente.convenios || []} />

                {/*
                  EL ESPEJO SE INFORMA, NO SE OFRECE COMO DESCARGA. La copia de Dropbox existe para
                  que la evidencia no viva en un solo disco; el botón de arriba sigue bajando del
                  server, que es lo que no falla nunca. Si alguien movió el archivo allá, esta ruta
                  miente — por eso se muestra como dato y no como enlace.
                */}
                {p.dropbox && p.dropbox.estado !== 'ok' && p.dropbox.motivo && (
                  <p className="mt-1 flex items-start gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                    <FontAwesomeIcon icon={faBoxArchive} className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                    <span>Sin copia en Dropbox: {p.dropbox.motivo}</span>
                  </p>
                )}
                {p.dropbox?.estado === 'ok' && (
                  <p className="mt-1 flex items-start gap-1.5 text-[11px] text-gray-500 dark:text-gray-400" title="Copia de respaldo. La descarga sigue saliendo del server.">
                    <FontAwesomeIcon icon={faBoxArchive} className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                    <span className="break-all">{p.dropbox.path}</span>
                  </p>
                )}

                {textoAbierto === p._id && <PanelTexto publicacionId={p._id} onClose={() => setTextoAbierto('')} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};
