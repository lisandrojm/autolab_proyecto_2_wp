import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRss, faPlus, faTrash, faEdit, faSpinner, faRotate, faArrowUpRightFromSquare, faCircleCheck, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { PageLayout } from '../components/ui/PageLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle';
import { Modal } from '../components/ui/Modal';
import { sweetAlert } from '../utils/sweetAlert';
import { paritariasAPI, FuenteParitaria, ResultadoDeRevision } from '../api/paritarias';
import { getHelp } from '../data/help/helpContent';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../api/simpleCatalog';
import { ConvenioSelector } from '../components/empresas/ConvenioSelector';

/**
 * ABM de fuentes de paritarias: qué páginas se vigilan y con qué patrones.
 *
 * POR QUÉ ESTA PANTALLA EXISTE Y NO UN SEED
 *
 * Las tres fuentes de hoy se podrían haber insertado con un script y nadie lo notaría — hasta que
 * aparezca la cuarta, dentro de unos meses, y ahí se descubra que el alta nunca funcionó. Cargarlas a
 * mano desde acá es lo que prueba que el ABM sirve, y es el mismo camino que va a usar quien agregue
 * la próxima.
 *
 * AL DAR DE ALTA SE OFRECE REVISAR EN EL MISMO PASO. Es cuando la persona quiere ver si los patrones
 * que puso funcionan, y además es la revisión que establece la línea de base: todo lo que encuentre
 * queda registrado como YA VISTO. Sin eso, la primera notificación gritaría treinta acuerdos viejos.
 */

/**
 * `convenios` es una lista de CÓDIGOS de CCT, no de ids del catálogo.
 *
 * El código es lo que usa el resto del circuito: el endpoint de estado arma `porConvenio` con él y
 * la columna de `/convenios` lo busca por ahí. Además sobrevive a que el catálogo se vuelva a
 * sembrar, cosa que un `_id` no. El selector trabaja con ids, así que se traduce en los dos
 * sentidos al abrir y al guardar.
 */
const VACIA = { entidad: '', nombre: '', url: '', convenios: [] as string[], patronIncluir: '', patronExcluir: '', activa: true };

const MOTIVO: Record<string, string> = {
  ok: 'vigilando',
  sin_enlaces: 'no encontró ningún enlace',
  error_red: 'no se pudo alcanzar la página',
  error_parseo: 'no se pudo leer el HTML',
};

const ayuda = getHelp('fuentesParitaria');
const conveniosApi = createSimpleCatalogApi('/convenios');

export const FuentesParitariaPage: React.FC = () => {
  const [fuentes, setFuentes] = useState<FuenteParitaria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState({ ...VACIA });
  const [editando, setEditando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [revisando, setRevisando] = useState<string | null>(null);
  /**
   * Foto del formulario al abrirlo, para saber si alguien lo tocó.
   *
   * `Modal` cierra al clickear el fondo oscuro, y con seis campos cargados un click al costado se
   * llevaría todo puesto. Comparar contra esta foto es lo que permite preguntar SOLO cuando hay algo
   * que perder: quien abrió a mirar y cierra no tiene por qué contestar nada.
   */
  const [formInicial, setFormInicial] = useState({ ...VACIA });
  const [verAyuda, setVerAyuda] = useState(false);
  /** Tarjetas o tabla, igual que el resto de los nomencladores. Se recuerda por pantalla. */
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [esGrande, setEsGrande] = useState(window.innerWidth >= 1024);
  useEffect(() => {
    const alRedimensionar = () => setEsGrande(window.innerWidth >= 1024);
    const guardado = localStorage.getItem('catalog_fuentes_paritaria_viewMode');
    if (window.innerWidth >= 1024 && (guardado === 'table' || guardado === 'cards')) setViewMode(guardado as ViewMode);
    window.addEventListener('resize', alRedimensionar);
    return () => window.removeEventListener('resize', alRedimensionar);
  }, []);
  useEffect(() => {
    if (esGrande) localStorage.setItem('catalog_fuentes_paritaria_viewMode', viewMode);
  }, [viewMode, esGrande]);
  const vista: ViewMode = esGrande ? viewMode : 'cards';

  /**
   * Cuáles revisar. Vacío = todas.
   *
   * Revisar las tres siempre es lo normal, pero cuando una falla o se le acaba de tocar el patrón,
   * lo que se quiere es probar ESA — y golpear los otros dos sitios de gremios al pasar es una
   * descortesía gratuita con páginas de las que dependemos.
   */
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const alternarElegida = (id: string) =>
    setElegidas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  /**
   * El nomenclador entero (2.669). No se vuelca en pantalla: el selector muestra solo lo elegido y
   * busca al escribir, que es lo que lo vuelve usable con ese volumen.
   */
  const [catalogoConvenios, setCatalogoConvenios] = useState<SimpleCatalogItem[]>([]);
  const [cargandoConvenios, setCargandoConvenios] = useState(true);
  useEffect(() => {
    void conveniosApi
      .list()
      .then(setCatalogoConvenios)
      .catch(() => setCatalogoConvenios([]))
      .finally(() => setCargandoConvenios(false));
  }, []);

  const cargar = async () => {
    try {
      const lista = await paritariasAPI.fuentes();
      setFuentes(lista);
      // Una fuente eliminada no puede seguir seleccionada: si no, «Revisar 3 seleccionadas» contaría
      // una que ya no existe, y el «todas» del encabezado nunca volvería a quedar tildado.
      const vivos = new Set(lista.map((f) => f._id));
      setElegidas((prev) => new Set([...prev].filter((id) => vivos.has(id))));
    } catch {
      setFuentes([]);
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => {
    void cargar();
  }, []);

  const abrirNueva = () => {
    setEditando(null);
    setForm({ ...VACIA });
    setFormInicial({ ...VACIA });
    setAbierto(true);
  };
  const abrirEditar = (f: FuenteParitaria) => {
    setEditando(f._id);
    const datos = { entidad: f.entidad, nombre: f.nombre, url: f.url, convenios: [...(f.convenios || [])], patronIncluir: f.patronIncluir, patronExcluir: f.patronExcluir || '', activa: f.activa };
    setForm(datos);
    setFormInicial(datos);
    setAbierto(true);
  };

  /** Muestra el resultado de una revisión con las palabras del caso, no con el código crudo. */
  const contar = (r: ResultadoDeRevision) => {
    if (r.resultado !== 'ok') return sweetAlert.error(`${r.nombre}: ${MOTIVO[r.resultado]}`, r.error || '');
    if (r.lineaBase) return sweetAlert.success('Línea de base establecida', `${r.nombre}: se registraron ${r.enlaces} publicación(es) que ya estaban. Ninguna se reporta como novedad — a partir de la próxima revisión, lo que aparezca sí lo es.`);
    if (r.aviso) return sweetAlert.error('Revisión con aviso', `${r.nombre}: ${r.aviso}`);
    return sweetAlert.success(`${r.nombre}`, r.nuevas > 0 ? `${r.nuevas} publicación(es) nueva(s).` : `Sin novedades. ${r.enlaces} enlace(s) encontrados.`);
  };

  /**
   * Código ↔ id, en los dos sentidos.
   *
   * Se compara con `.trim()` porque en el nomenclador conviven códigos casi iguales —«0131/75» y
   * «0131/75 E» son convenios DISTINTOS— y una diferencia de espacios haría que un convenio guardado
   * no se reconozca al reabrir la fuente: al guardar se borraría, sin ningún aviso.
   */
  const codigoDe = (c: SimpleCatalogItem) => String(c.externalId || '').trim();
  const idsElegidos = useMemo(() => catalogoConvenios.filter((c) => form.convenios.includes(codigoDe(c))).map((c) => c._id), [catalogoConvenios, form.convenios]);
  const elegirConvenios = (ids: string[]) => {
    const porId = new Map(catalogoConvenios.map((c) => [c._id, codigoDe(c)]));
    setForm((prev) => ({ ...prev, convenios: ids.map((id) => porId.get(id)).filter(Boolean) as string[] }));
  };

  /**
   * La única salida del modal, y por eso el único lugar donde se pregunta.
   *
   * `Modal` llama a `onClose` tanto desde la X del encabezado como desde el click en el fondo, así
   * que pasándole esto quedan cubiertos los tres caminos —X, fondo y Cancelar— sin repetir la
   * condición en ninguno.
   */
  const cerrar = async () => {
    if (JSON.stringify(form) !== JSON.stringify(formInicial)) {
      const r = await sweetAlert.confirm('¿Descartar los cambios?', 'Lo que cargaste en esta fuente no se guardó.', 'Sí, descartar');
      if (!r.isConfirmed) return;
    }
    setAbierto(false);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const datos = {
        entidad: form.entidad.trim(),
        nombre: form.nombre.trim(),
        url: form.url.trim(),
        convenios: form.convenios,
        patronIncluir: form.patronIncluir.trim(),
        patronExcluir: form.patronExcluir.trim(),
        activa: form.activa,
      };
      if (editando) {
        const r = await paritariasAPI.actualizarFuente(editando, datos);
        // Cambiar un patrón cambia QUÉ se considera una escala en esa página, así que todo lo que la
        // línea de base había dado por visto se calculó con la definición vieja. El server la borra;
        // acá se dice, porque quien lo hizo tiene que saber que la próxima revisión no va a reportar
        // novedades. Ahora que una fuente alimenta convenios de muchas empresas, callarlo sería dejar
        // a todas ellas creyendo que están cubiertas.
        if (r.lineaBaseReiniciada) {
          sweetAlert.success('Guardado — la línea de base se reinició', 'Cambiaste un patrón, así que lo que estaba dado por visto ya no vale: se calculó con la definición anterior. La próxima revisión vuelve a ser línea de base y registra todo lo que encuentre como ya visto.');
        } else {
          sweetAlert.success('Guardado', 'La fuente se actualizó.');
        }
      } else {
        const creada = await paritariasAPI.crearFuente(datos);
        setAbierto(false);
        // Se ofrece revisar EN EL MISMO PASO: es cuando se quiere ver si los patrones sirven, y es la
        // revisión que establece la línea de base.
        const r = await sweetAlert.confirm('¿Revisar ahora?', 'Es la primera revisión: todo lo que encuentre queda registrado como ya visto, y de la próxima en adelante lo que aparezca es novedad. También sirve para ver si los patrones que pusiste funcionan.', 'Sí, revisar');
        if (r.isConfirmed) {
          setRevisando(creada._id);
          contar(await paritariasAPI.revisar(creada._id));
          setRevisando(null);
        }
      }
      setAbierto(false);
      await cargar();
    } catch (e: any) {
      sweetAlert.error('No se pudo guardar', e?.response?.data?.error || 'Revisá los datos.');
    } finally {
      setGuardando(false);
      setRevisando(null);
    }
  };

  const revisar = async (id: string) => {
    setRevisando(id);
    try {
      contar(await paritariasAPI.revisar(id));
      await cargar();
    } catch (e: any) {
      sweetAlert.error('No se pudo revisar', e?.response?.data?.error || '');
    } finally {
      setRevisando(null);
    }
  };

  /**
   * Revisa LO SELECCIONADO, y nada más.
   *
   * Sin nada tildado no hay nada que revisar y el botón está apagado: «todas» por omisión sería una
   * salida de red a cada sitio gremial disparada por un click distraído, y el contador entre
   * paréntesis ya dice cuántas van — con (0) el botón no tiene sentido.
   */
  const revisarLote = async () => {
    const objetivo = fuentes.filter((f) => elegidas.has(f._id));
    if (objetivo.length === 0) return;
    setRevisando('lote');
    try {
      const rs: ResultadoDeRevision[] = [];
      // En serie, como el cron: son sitios chicos de entidades gremiales y no hay ningún apuro que
      // justifique golpearlos a la vez.
      for (const f of objetivo) {
        try {
          rs.push(await paritariasAPI.revisar(f._id));
        } catch {
          /* que una falle no frena a las otras, igual que en la rutina diaria */
        }
      }
      const nuevas = rs.reduce((a, r) => a + r.nuevas, 0);
      const mal = rs.filter((r) => r.resultado !== 'ok');
      // El recuento nombra los problemas aunque haya novedades: una fuente caída no se compensa con
      // que otra haya funcionado.
      if (mal.length > 0) sweetAlert.error(`${mal.length} fuente(s) con problema`, mal.map((r) => `${r.nombre}: ${MOTIVO[r.resultado]}`).join(String.fromCharCode(10)));
      else sweetAlert.success('Listo', nuevas > 0 ? `${nuevas} publicación(es) nueva(s).` : `Sin novedades en ${objetivo.length === 1 ? `«${objetivo[0].nombre}»` : `las ${objetivo.length} fuentes`}.`);
      await cargar();
    } finally {
      setRevisando(null);
    }
  };

  const eliminar = async (f: FuenteParitaria) => {
    const r = await sweetAlert.confirm(`¿Eliminar «${f.nombre}»?`, `Se borran también sus ${f.publicaciones} publicación(es) detectadas. Si la volvés a dar de alta, su primera revisión vuelve a establecer la línea de base.`, 'Sí, eliminar');
    if (!r.isConfirmed) return;
    await paritariasAPI.eliminarFuente(f._id);
    await cargar();
  };

  /** El estado de una fuente en palabras: «sin_enlaces» no le dice nada a nadie. */
  const lineaEstado = (f: FuenteParitaria) =>
    !f.ultimaRevision
      ? 'nunca revisada — su primera revisión establece la línea de base'
      : `${MOTIVO[f.ultimoResultado || 'ok']} · ${f.publicaciones} publicación(es)${f.sinVer > 0 ? ` · ${f.sinVer} sin ver` : ''} · última revisión ${new Date(f.ultimaRevision).toLocaleDateString('es-AR')}`;

  /** Las mismas tres acciones en las dos vistas: si divergen, una de las dos queda atrás. */
  const acciones = (f: FuenteParitaria) => (
    <div className="flex items-center gap-1 shrink-0">
      <button onClick={() => revisar(f._id)} disabled={!!revisando} title="Revisar ahora" className="p-2 rounded text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50">
        <FontAwesomeIcon icon={revisando === f._id ? faSpinner : faRotate} spin={revisando === f._id} />
      </button>
      <button onClick={() => abrirEditar(f)} title="Editar" className="p-2 rounded text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
        <FontAwesomeIcon icon={faEdit} />
      </button>
      <button onClick={() => eliminar(f)} title="Eliminar" className="p-2 rounded text-gray-500 hover:text-red-600 dark:hover:text-red-400">
        <FontAwesomeIcon icon={faTrash} />
      </button>
    </div>
  );
  const input = 'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200';

  return (
    <PageLayout
      title="Fuentes de paritarias"
      subtitle="Las páginas que se vigilan para saber cuándo sale un acuerdo nuevo"
      faIcon={{ icon: faRss }}
      /*
        El ⓘ explica el mecanismo entero, que no se deduce mirando la pantalla: qué hace la primera
        revisión, por qué cero enlaces es un error y no «sin novedades», y qué NO hace el sistema
        —no abre los PDF ni carga escalas—. Sin eso, la lista de fuentes se lee como si cargar una
        alcanzara para que las escalas se actualicen solas.
      */
      shouldShowInfo
      infoModal={{
        isOpen: verAyuda,
        onOpen: () => setVerAyuda(true),
        onClose: () => setVerAyuda(false),
        title: ayuda.title,
        size: ayuda.size,
        content: ayuda.content,
      }}
      itemCount={cargando ? undefined : fuentes.length}
      /* Solo el «+», como Convenios y el resto: el rótulo lo pone el título de la pantalla. */
      headerActions={
        <button onClick={abrirNueva} title="Nueva fuente" aria-label="Nueva fuente" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          <FontAwesomeIcon icon={faPlus} />
        </button>
      }
    >
      {/*
        La barra va ARRIBA de la lista y no en el encabezado de la pantalla: «Revisar» actúa sobre lo
        que está seleccionado en la tabla, y un control que depende de la selección tiene que estar al
        lado de ella.
      */}
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <button onClick={revisarLote} disabled={!!revisando || elegidas.size === 0} title={elegidas.size === 0 ? 'Tildá las fuentes que quieras revisar' : undefined} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
          <FontAwesomeIcon icon={revisando === 'lote' ? faSpinner : faRotate} spin={revisando === 'lote'} />
          {/* Rótulo fijo y contador: se ve cuántas van a salir ANTES de tocarlo. */}
          Revisar ({elegidas.size})
        </button>
        {esGrande && <ViewToggle value={viewMode} onChange={setViewMode} />}
      </div>

      {cargando ? (
        <LoadingSpinner />
      ) : fuentes.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">Todavía no hay ninguna fuente. Cargá una con «+»: hace falta la página de listado de la entidad y un patrón que distinga los acuerdos del resto de los PDF que cuelgan ahí.</div>
      ) : vista === 'table' ? (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 w-px">
                  {/* Todas de una: con tres filas es cómodo, y con quince es la diferencia entre
                      elegir y rendirse. */}
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todas"
                    checked={elegidas.size === fuentes.length && fuentes.length > 0}
                    onChange={(e) => setElegidas(e.target.checked ? new Set(fuentes.map((f) => f._id)) : new Set())}
                    className="accent-blue-600"
                  />
                </th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fuente</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Convenios</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Patrones</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {fuentes.map((f) => (
                <tr key={f._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20 align-top">
                  <td className="px-4 py-3">
                    <input type="checkbox" aria-label={`Seleccionar ${f.nombre}`} checked={elegidas.has(f._id)} onChange={() => alternarElegida(f._id)} className="accent-blue-600" />
                  </td>
                  <td className="px-5 py-3">
                    <span className="block text-sm font-medium text-gray-900 dark:text-white">
                      {f.nombre}
                      {!f.activa && <span className="ml-2 text-[10px] px-1.5 py-px rounded border border-gray-300 dark:border-gray-600 text-gray-500">pausada</span>}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{f.entidad}</span>
                    <a href={f.url} target="_blank" rel="noreferrer" className="block text-xs text-blue-600 dark:text-blue-400 hover:underline break-all">
                      {f.url} <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2 w-2" />
                    </a>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{(f.convenios || []).join(", ") || <span className="text-gray-400">—</span>}</td>
                  <td className="px-5 py-3 text-[11px] font-mono text-gray-500 dark:text-gray-400">
                    <span className="block">incluir: /{f.patronIncluir}/i</span>
                    {f.patronExcluir && <span className="block">excluir: /{f.patronExcluir}/i</span>}
                  </td>
                  <td className={`px-5 py-3 text-xs ${f.conProblema ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                    <span className="inline-flex items-start gap-1.5">
                      <FontAwesomeIcon icon={f.conProblema ? faTriangleExclamation : faCircleCheck} className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>
                        {lineaEstado(f)}
                        {f.conProblema && f.ultimoError && <span className="block">{f.ultimoError}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">{acciones(f)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
          {fuentes.map((f) => (
            <div key={f._id} className={`rounded-xl border p-4 bg-white dark:bg-gray-800 transition-colors ${elegidas.has(f._id) ? 'border-blue-500' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" aria-label={`Seleccionar ${f.nombre}`} checked={elegidas.has(f._id)} onChange={() => alternarElegida(f._id)} className="accent-blue-600 mt-1" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {f.nombre}
                    {!f.activa && <span className="ml-2 text-[10px] px-1.5 py-px rounded border border-gray-300 dark:border-gray-600 text-gray-500">pausada</span>}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{f.entidad}</p>
                </div>
                {acciones(f)}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">{(f.convenios || []).join(", ") || "—"}</p>
              <a href={f.url} target="_blank" rel="noreferrer" className="block text-xs text-blue-600 dark:text-blue-400 hover:underline break-all">
                {f.url} <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2 w-2" />
              </a>
              <p className="text-[11px] font-mono text-gray-500 dark:text-gray-500 mt-1">incluir: /{f.patronIncluir}/i</p>
              {f.patronExcluir && <p className="text-[11px] font-mono text-gray-500 dark:text-gray-500">excluir: /{f.patronExcluir}/i</p>}
              <p className={`text-xs mt-2 inline-flex items-start gap-1.5 ${f.conProblema ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                <FontAwesomeIcon icon={f.conProblema ? faTriangleExclamation : faCircleCheck} className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{lineaEstado(f)}</span>
              </p>
              {f.conProblema && f.ultimoError && <p className="text-xs text-red-600 dark:text-red-400">{f.ultimoError}</p>}
            </div>
          ))}
        </div>
      )}

      {/*
        El modal sale del componente compartido y no de un `fixed inset-0` propio.

        El que había acá tenía el scroll sobre el panel entero, así que el footer con Cancelar y
        Guardar se iba con el contenido: con seis campos y sus textos de ayuda, no quedaba ninguna
        forma de salir salvo recargar la página —y perder lo cargado—. `Modal` pone el body en su
        propio `overflow-y-auto` y el footer como hermano `sticky bottom-0`, y de paso trae la X del
        encabezado, el cierre al clickear el fondo y el bloqueo del scroll de atrás.
      */}
      <Modal
        isOpen={abierto}
        onClose={cerrar}
        title={editando ? 'Editar fuente' : 'Nueva fuente'}
        subtitle={editando ? form.url : 'Una página que publica acuerdos, y cómo distinguirlos del resto'}
        size="md"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <button onClick={cerrar} className="btn-secondary" disabled={guardando}>
              Cancelar
            </button>
            <button onClick={guardar} className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : editando ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        }
      >
        {/* Sin `p-5`: el body de `Modal` ya trae su propio padding. */}
        <div className="space-y-3">
          {[
            { k: 'entidad' as const, label: 'Entidad', ph: 'SATSAID' },
            { k: 'nombre' as const, label: 'Nombre', ph: 'Actores · televisión' },
            { k: 'url' as const, label: 'URL de la página de listado', ph: 'https://…' },
            { k: 'patronIncluir' as const, label: 'Patrón de inclusión', ph: 'ACUERDO +SALARIAL' },
            { k: 'patronExcluir' as const, label: 'Patrón de exclusión', ph: 'convenio|texto|protocolo' },
          ].map((c) => (
            <div key={c.k}>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{c.label}</label>
              <input value={form[c.k]} onChange={(e) => setForm((p) => ({ ...p, [c.k]: e.target.value }))} placeholder={c.ph} className={input} />
              {/* La ayuda va donde se toma la decisión, no en un manual: quien carga una fuente
                  tiene la página abierta al lado y necesita saber contra qué se prueba. */}
              {c.k === 'url' && <p className="text-[11px] text-gray-500 mt-1">La página de LISTADO, no el PDF: lo que se vigila es qué aparece ahí.</p>}
              {c.k === 'patronIncluir' && <p className="text-[11px] text-gray-500 mt-1">Se prueba contra el texto del enlace y el nombre del archivo. Sin él entraría cualquier PDF de la página.</p>}
              {/* El aviso va al lado del campo y solo al editar: en un alta no hay línea de base que
                  perder, y enterarse recién en el mensaje de «guardado» es enterarse tarde. */}
              {editando && (c.k === 'patronIncluir' || c.k === 'patronExcluir') && form[c.k] !== formInicial[c.k] && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                  Al cambiar este patrón cambia qué se considera una escala en esta página, así que <strong>la línea de base se reinicia</strong>: la próxima revisión vuelve a registrar todo lo que
                  encuentre como ya visto.
                </p>
              )}
              {c.k === 'patronExcluir' && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                  Lo que NO es una escala aunque matchee lo anterior. <strong>No lo dejes vacío sin mirar la página</strong>: al lado de los acuerdos suele colgar el texto del convenio colectivo, y
                  si entra, el sistema avisa de una novedad que no existe.
                </p>
              )}
            </div>
          ))}
          {/*
            Los convenios se ELIGEN del nomenclador, no se tipean.

            Era un campo de texto con comas contra un catálogo de 2.669 códigos parecidísimos entre sí:
            «0131/75» y «0131/75 E» son convenios distintos, y hay cuatro que empiezan con 0131. Un
            dedazo dejaba la fuente alimentando a nadie sin ningún error visible — la columna de
            /convenios diría «No vigilado» y no habría forma de saber por qué.

            Es el mismo selector que usa la ficha de empresa: mismo gesto, misma pantalla.
          */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Convenios que alimenta</label>
            <ConvenioSelector
              convenios={catalogoConvenios}
              cargando={cargandoConvenios}
              value={idsElegidos}
              onChange={elegirConvenios}
              textoVacio="Todavía no hay ningún convenio elegido: esta fuente no va a avisarle a nadie."
            />
            <p className="text-[11px] text-gray-500 mt-1">Un acuerdo del SATSAID cubre dos convenios a la vez, por eso se eligen varios.</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={form.activa} onChange={(e) => setForm((p) => ({ ...p, activa: e.target.checked }))} />
            Activa (entra en la revisión diaria)
          </label>
        </div>
      </Modal>
    </PageLayout>
  );
};
