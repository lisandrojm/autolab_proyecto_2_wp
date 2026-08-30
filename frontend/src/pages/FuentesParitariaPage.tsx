import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRss, faPlus, faTrash, faEdit, faSpinner, faRotate, faArrowUpRightFromSquare, faCircleCheck, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { PageLayout } from '../components/ui/PageLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { sweetAlert } from '../utils/sweetAlert';
import { paritariasAPI, FuenteParitaria, ResultadoDeRevision } from '../api/paritarias';

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

const VACIA = { entidad: '', nombre: '', url: '', convenios: '', patronIncluir: '', patronExcluir: '', activa: true };

const MOTIVO: Record<string, string> = {
  ok: 'vigilando',
  sin_enlaces: 'no encontró ningún enlace',
  error_red: 'no se pudo alcanzar la página',
  error_parseo: 'no se pudo leer el HTML',
};

export const FuentesParitariaPage: React.FC = () => {
  const [fuentes, setFuentes] = useState<FuenteParitaria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState({ ...VACIA });
  const [editando, setEditando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [revisando, setRevisando] = useState<string | null>(null);

  const cargar = async () => {
    try {
      setFuentes(await paritariasAPI.fuentes());
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
    setAbierto(true);
  };
  const abrirEditar = (f: FuenteParitaria) => {
    setEditando(f._id);
    setForm({ entidad: f.entidad, nombre: f.nombre, url: f.url, convenios: (f.convenios || []).join(', '), patronIncluir: f.patronIncluir, patronExcluir: f.patronExcluir || '', activa: f.activa });
    setAbierto(true);
  };

  /** Muestra el resultado de una revisión con las palabras del caso, no con el código crudo. */
  const contar = (r: ResultadoDeRevision) => {
    if (r.resultado !== 'ok') return sweetAlert.error(`${r.nombre}: ${MOTIVO[r.resultado]}`, r.error || '');
    if (r.lineaBase) return sweetAlert.success('Línea de base establecida', `${r.nombre}: se registraron ${r.enlaces} publicación(es) que ya estaban. Ninguna se reporta como novedad — a partir de la próxima revisión, lo que aparezca sí lo es.`);
    if (r.aviso) return sweetAlert.error('Revisión con aviso', `${r.nombre}: ${r.aviso}`);
    return sweetAlert.success(`${r.nombre}`, r.nuevas > 0 ? `${r.nuevas} publicación(es) nueva(s).` : `Sin novedades. ${r.enlaces} enlace(s) encontrados.`);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const datos = {
        entidad: form.entidad.trim(),
        nombre: form.nombre.trim(),
        url: form.url.trim(),
        convenios: form.convenios.split(',').map((c) => c.trim()).filter(Boolean),
        patronIncluir: form.patronIncluir.trim(),
        patronExcluir: form.patronExcluir.trim(),
        activa: form.activa,
      };
      if (editando) {
        await paritariasAPI.actualizarFuente(editando, datos);
        sweetAlert.success('Guardado', 'La fuente se actualizó.');
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

  const revisarTodas = async () => {
    setRevisando('todas');
    try {
      const rs = await paritariasAPI.revisarTodas();
      const nuevas = rs.reduce((a, r) => a + r.nuevas, 0);
      const mal = rs.filter((r) => r.resultado !== 'ok');
      // El recuento nombra los problemas aunque haya novedades: una fuente caída no se compensa con
      // que otra haya funcionado.
      if (mal.length > 0) sweetAlert.error(`${mal.length} fuente(s) con problema`, mal.map((r) => `${r.nombre}: ${MOTIVO[r.resultado]}`).join('\n'));
      else sweetAlert.success('Listo', nuevas > 0 ? `${nuevas} publicación(es) nueva(s).` : 'Sin novedades en ninguna fuente.');
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

  const input = 'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200';

  return (
    <PageLayout
      title="Fuentes de paritarias"
      subtitle="Las páginas que se vigilan para saber cuándo sale un acuerdo nuevo"
      faIcon={{ icon: faRss }}
      itemCount={cargando ? undefined : fuentes.length}
      headerActions={
        <div className="flex gap-2">
          <button onClick={revisarTodas} disabled={!!revisando} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            <FontAwesomeIcon icon={revisando === 'todas' ? faSpinner : faRotate} spin={revisando === 'todas'} /> Revisar todas
          </button>
          <button onClick={abrirNueva} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            <FontAwesomeIcon icon={faPlus} /> Nueva fuente
          </button>
        </div>
      }
    >
      {cargando ? (
        <LoadingSpinner />
      ) : fuentes.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">Todavía no hay ninguna fuente. Cargá una con «Nueva fuente»: hace falta la página de listado de la entidad y un patrón que distinga los acuerdos del resto de los PDF que cuelgan ahí.</div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 overflow-hidden">
          {fuentes.map((f) => (
            <div key={f._id} className="px-4 py-3 flex items-start gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  {f.nombre}
                  {!f.activa && <span className="text-[10px] px-1.5 py-px rounded border border-gray-300 dark:border-gray-600 text-gray-500">pausada</span>}
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{f.entidad}</span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {(f.convenios || []).join(', ') || 'sin convenios asignados'} ·{' '}
                  <a href={f.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-all">
                    {f.url} <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2 w-2" />
                  </a>
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-0.5 font-mono">
                  incluir: /{f.patronIncluir}/i {f.patronExcluir && <>· excluir: /{f.patronExcluir}/i</>}
                </p>
                {/* El estado en palabras, no el código: «sin_enlaces» no le dice nada a nadie. */}
                <p className={`text-xs mt-1 inline-flex items-center gap-1.5 ${f.conProblema ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                  <FontAwesomeIcon icon={f.conProblema ? faTriangleExclamation : faCircleCheck} className="h-3 w-3" />
                  {!f.ultimaRevision ? 'nunca revisada — su primera revisión establece la línea de base' : `${MOTIVO[f.ultimoResultado || 'ok']} · ${f.publicaciones} publicación(es)${f.sinVer > 0 ? ` · ${f.sinVer} sin ver` : ''} · última revisión ${new Date(f.ultimaRevision).toLocaleDateString('es-AR')}`}
                </p>
                {f.conProblema && f.ultimoError && <p className="text-xs text-red-600 dark:text-red-400">{f.ultimoError}</p>}
              </div>
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
            </div>
          ))}
        </div>
      )}

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-gray-800 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editando ? 'Editar fuente' : 'Nueva fuente'}</h3>
            </div>
            <div className="p-5 space-y-3">
              {[
                { k: 'entidad' as const, label: 'Entidad', ph: 'SATSAID' },
                { k: 'nombre' as const, label: 'Nombre', ph: 'Actores · televisión' },
                { k: 'url' as const, label: 'URL de la página de listado', ph: 'https://…' },
                { k: 'convenios' as const, label: 'Convenios que alimenta', ph: '0131/75, 0634/11' },
                { k: 'patronIncluir' as const, label: 'Patrón de inclusión', ph: 'ACUERDO +SALARIAL' },
                { k: 'patronExcluir' as const, label: 'Patrón de exclusión', ph: 'convenio|texto|protocolo' },
              ].map((c) => (
                <div key={c.k}>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{c.label}</label>
                  <input value={form[c.k]} onChange={(e) => setForm((p) => ({ ...p, [c.k]: e.target.value }))} placeholder={c.ph} className={input} />
                  {/* La ayuda va donde se toma la decisión, no en un manual: quien carga una fuente
                      tiene la página abierta al lado y necesita saber contra qué se prueba. */}
                  {c.k === 'url' && <p className="text-[11px] text-gray-500 mt-1">La página de LISTADO, no el PDF: lo que se vigila es qué aparece ahí.</p>}
                  {c.k === 'convenios' && <p className="text-[11px] text-gray-500 mt-1">Separados por coma. Un acuerdo del SATSAID cubre dos convenios a la vez.</p>}
                  {c.k === 'patronIncluir' && <p className="text-[11px] text-gray-500 mt-1">Se prueba contra el texto del enlace y el nombre del archivo. Sin él entraría cualquier PDF de la página.</p>}
                  {c.k === 'patronExcluir' && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                      Lo que NO es una escala aunque matchee lo anterior. <strong>No lo dejes vacío sin mirar la página</strong>: al lado de los acuerdos suele colgar el texto del convenio colectivo, y
                      si entra, el sistema avisa de una novedad que no existe.
                    </p>
                  )}
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={form.activa} onChange={(e) => setForm((p) => ({ ...p, activa: e.target.checked }))} />
                Activa (entra en la revisión diaria)
              </label>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button onClick={() => setAbierto(false)} className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2">
                {guardando && <FontAwesomeIcon icon={faSpinner} spin />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};
