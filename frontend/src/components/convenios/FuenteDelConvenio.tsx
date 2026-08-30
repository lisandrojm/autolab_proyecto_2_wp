import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faCircleCheck, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { sweetAlert } from '../../utils/sweetAlert';
import { paritariasAPI, FuenteParitaria, DeclaracionFuente, EstadoDeclarado } from '../../api/paritarias';
import { formatearInstante } from '../../utils/fechas';

/**
 * DÓNDE PUBLICA SUS PARITARIAS UN CONVENIO. Un solo bloque, usado desde los dos lados.
 *
 * Vive acá y no dentro de la pantalla de convenios porque se abre desde dos lugares —la acción de la
 * fila y el modal de edición del convenio— y ya vimos qué pasa cuando el mismo gesto se escribe dos
 * veces: divergen, y una de las dos copias queda atrás sin que nadie se entere.
 *
 * NO ES UNA PANTALLA DE VIGILANCIA. Acá se anota conocimiento sobre el convenio: qué página publica
 * sus acuerdos, o que se buscó y no hay ninguna. Si esa página se baja todos los días es otra
 * decisión y vive en el `activa` de la fuente. Mezclarlas fue el error de la primera entrega: con
 * 2.669 convenios de gremios de todos los rubros, la columna «No vigilado» se leía como 2.664
 * pendientes operativos, cuando son 2.664 casillas de conocimiento que la plataforma todavía no
 * acumuló — y cada una que alguien completa vale para siempre y para todas las empresas.
 *
 * LAS OPCIONES SON EXCLUYENTES ENTRE SÍ, incluidas las declaradas: un convenio tiene una fuente, o
 * no tiene y se sabe por qué. Por eso prender una apaga la otra, y por eso las declaradas quedan
 * bloqueadas mientras haya una fuente asignada — el server además rechaza esa combinación con un 409,
 * porque guardar una contradicción que la derivación después ignora es guardar basura con cara de dato.
 */

interface Props {
  /** El convenio que se está anotando. El código es lo que la fuente guarda. */
  convenio: { _id: string; externalId?: string; name: string };
  fuentes: FuenteParitaria[];
  /** Lo declarado a mano, si alguien lo declaró. */
  declarado?: DeclaracionFuente;
  /** Refrescar las dos puntas después de escribir. */
  onCambiado: () => Promise<void> | void;
}

/** El mismo switch que el resto de la app: prender o apagar una relación, no elegir de una lista. */
const Switch: React.FC<{ on: boolean; disabled?: boolean; onClick: () => void; label: string }> = ({ on, disabled, onClick, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${on ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

const DECLARABLES: Array<{ valor: EstadoDeclarado; titulo: string; detalle: string }> = [
  {
    valor: 'sin_fuente_conocida',
    titulo: 'Se buscó y no hay fuente conocida',
    // Es el estado que justifica todo el mecanismo: sin él, «nadie buscó» y «buscamos y no hay» se
    // ven iguales —los dos como una celda vacía— y la próxima persona repite la búsqueda entera.
    detalle: 'Queda registrado quién lo revisó y cuándo, para que nadie más repita la búsqueda.',
  },
  {
    valor: 'no_aplica',
    titulo: 'No aplica: no tiene paritaria',
    detalle: 'Para los que no la van a tener nunca, como 9999/99 «Excluido de convenio».',
  },
];

export const FuenteDelConvenio: React.FC<Props> = ({ convenio, fuentes, declarado, onCambiado }) => {
  const [guardando, setGuardando] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [nota, setNota] = useState(declarado?.nota || '');

  const codigo = String(convenio.externalId || '').trim();
  /**
   * DOS NIVELES QUE CONVIVEN, y por eso son dos grupos y no una lista excluyente.
   *
   * El gremio publica el acuerdo apenas lo firma: es la alerta temprana, y de esas hay UNA sola
   * —dos páginas anunciando el mismo acuerdo lo registrarían dos veces—. El buscador oficial del
   * Ministerio publica la homologación, meses después: es el respaldo, no avisa nada, y por eso
   * puede estar además de la del gremio sin duplicar ningún aviso.
   *
   * Si fueran un solo grupo excluyente, registrar la oficial obligaría a borrar la del gremio.
   */
  const vigilantes = useMemo(() => fuentes.filter((f) => f.tipo !== 'manual'), [fuentes]);
  const manuales = useMemo(() => fuentes.filter((f) => f.tipo === 'manual'), [fuentes]);
  const actual = useMemo(() => vigilantes.find((f) => (f.convenios || []).includes(codigo)), [vigilantes, codigo]);
  const actualManual = useMemo(() => manuales.find((f) => (f.convenios || []).includes(codigo)), [manuales, codigo]);
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return vigilantes;
    return vigilantes.filter((f) => `${f.entidad} ${f.nombre} ${(f.convenios || []).join(' ')}`.toLowerCase().includes(q));
  }, [vigilantes, busqueda]);
  // La nota llega asincrónica y puede cambiar al refrescar: el campo la sigue. Después de guardar
  // vale lo mismo que se acaba de escribir, así que no pisa nada que esté a medio tipear.
  useEffect(() => setNota(declarado?.nota || ''), [declarado?.nota]);

  /*
    Sin código no hay forma de asociarlo: la fuente guarda CÓDIGOS de CCT, no ids. Y el código es
    opcional en este ABM, así que el caso existe. Se dice, en vez de mostrar controles que no harían
    nada. Va DESPUÉS de los hooks: un `return` antes cambiaría su orden entre renders.
  */
  if (!codigo) {
    return <p className="text-xs text-amber-700 dark:text-amber-400">Este convenio no tiene código cargado. Las fuentes se asocian por código de CCT, así que primero completá ese campo.</p>;
  }

  /**
   * Mover el convenio de una fuente a otra son DOS escrituras, y en este orden.
   *
   * Primero se lo saca de donde estaba y después se lo pone donde va: al revés, un fallo entre las
   * dos lo dejaría en las dos fuentes a la vez, que es justamente el estado que esto viene a impedir
   * —el mismo PDF entraría dos veces y el aviso diría que salieron dos acuerdos donde salió uno—.
   * Con este orden, un fallo lo deja sin fuente: visible, y arreglable con un click.
   */
  const asignar = async (destinoId: string, previa?: FuenteParitaria) => {
    if (guardando) return;
    setGuardando(destinoId || 'ninguna');
    try {
      if (previa && previa._id !== destinoId) {
        await paritariasAPI.actualizarFuente(previa._id, { convenios: (previa.convenios || []).filter((c) => c !== codigo) });
      }
      if (destinoId && (!previa || previa._id !== destinoId)) {
        const destino = fuentes.find((f) => f._id === destinoId);
        if (destino) await paritariasAPI.actualizarFuente(destinoId, { convenios: [...(destino.convenios || []), codigo] });
      }
      await onCambiado();
    } catch (err: any) {
      sweetAlert.error('Error', err?.response?.data?.error || 'No se pudo cambiar la fuente de este convenio.');
    } finally {
      setGuardando('');
    }
  };

  const declarar = async (estado: EstadoDeclarado) => {
    if (guardando) return;
    setGuardando(estado);
    try {
      await paritariasAPI.declararEstadoFuente(convenio._id, estado, estado === 'sin_revisar' ? '' : nota);
      await onCambiado();
    } catch (err: any) {
      sweetAlert.error('Error', err?.response?.data?.error || 'No se pudo guardar el estado de este convenio.');
    } finally {
      setGuardando('');
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Qué página publica sus acuerdos ──────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Página que publica sus acuerdos</label>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
          Es una propiedad del convenio, no de tu empresa: sirve igual para cualquiera que lo use. Cada cambio se guarda solo.
        </p>

        {vigilantes.length === 0 ? (
          <p className="text-xs text-gray-400">No hay ninguna fuente de vigilancia cargada todavía. Se dan de alta en Configuración → ARCA → Fuentes de paritarias.</p>
        ) : (
          <>
            {/* El buscador aparece solo cuando hay suficientes como para tener que buscar. */}
            {vigilantes.length > 6 && (
              <div className="relative mb-2">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por entidad o nombre…"
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                />
              </div>
            )}
            <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
              {visibles.length === 0 && <p className="px-3 py-3 text-xs text-gray-400 italic">Ninguna fuente coincide con «{busqueda}».</p>}
              {visibles.map((f) => {
                const elegida = actual?._id === f._id;
                return (
                  <div key={f._id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-800 dark:text-gray-200 truncate">{f.nombre}</span>
                      <span className="block text-[11px] text-gray-400 truncate">
                        {f.entidad}
                        {/* Que la fuente exista no quiere decir que se esté bajando. Son dos cosas y
                            callarse la segunda haría creer que el convenio está cubierto. */}
                        {!f.activa && <span className="ml-1.5 text-amber-600 dark:text-amber-400">· vigilancia pausada</span>}
                      </span>
                    </span>
                    <Switch on={elegida} disabled={!!guardando} onClick={() => asignar(elegida ? '' : f._id, actual)} label={`${elegida ? 'Desasociar' : 'Asociar'} ${codigo} de ${f.nombre}`} />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/*
        LA RED DE CONTENCIÓN. Separada del bloque de arriba porque no hace lo mismo.

        Estas no avisan: se consultan. Registrar el buscador oficial del Ministerio no convierte al
        convenio en vigilado, pero sí lo saca de «nadie sabe dónde mirar» — que es el estado que
        obliga a la próxima persona a repetir la búsqueda desde cero.
      */}
      {manuales.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Dónde consultarlo a mano</label>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">No avisa cuando sale un acuerdo: dice dónde ir a buscarlo. Convive con la página del gremio, no la reemplaza.</p>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
            {manuales.map((f) => {
              const elegida = actualManual?._id === f._id;
              return (
                <div key={f._id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-800 dark:text-gray-200 truncate">{f.nombre}</span>
                    <span className="block text-[11px] text-gray-400 truncate">{f.entidad}</span>
                  </span>
                  <Switch on={elegida} disabled={!!guardando} onClick={() => asignar(elegida ? '' : f._id, actualManual)} label={`${elegida ? 'Desasociar' : 'Asociar'} ${codigo} de ${f.nombre}`} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Y si no hay ninguna, anotarlo ────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Si no hay ninguna</label>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">Anotar que se buscó vale tanto como encontrarla: es lo que evita que la próxima persona repita el trabajo.</p>

        {actual ? (
          <p className="flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
            <span>
              Este convenio ya tiene fuente (<strong>{actual.nombre}</strong>). Para marcarlo de otra manera, apagá el switch de arriba primero.
            </span>
          </p>
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
            {DECLARABLES.map((d) => {
              const on = declarado?.estado === d.valor;
              return (
                <div key={d.valor} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-800 dark:text-gray-200">{d.titulo}</span>
                      <span className="block text-[11px] text-gray-400">{d.detalle}</span>
                    </span>
                    {/* Apagarlo lo devuelve a «sin revisar», que es un estado legítimo: quien se
                        equivocó de marca tiene que poder deshacerlo sin dejar el dato falso puesto. */}
                    <Switch on={on} disabled={!!guardando} onClick={() => declarar(on ? 'sin_revisar' : d.valor)} label={`${on ? 'Quitar' : 'Marcar'} ${d.titulo} en ${codigo}`} />
                  </div>
                  {on && d.valor === 'sin_fuente_conocida' && (
                    <div className="mt-2">
                      <input
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        onBlur={() => nota !== (declarado?.nota || '') && declarar('sin_fuente_conocida')}
                        placeholder="Dónde se buscó, ej: el sitio del gremio no tiene sección de acuerdos"
                        className="w-full px-3 py-2 rounded-lg text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                      />
                      <p className="text-[11px] text-gray-500 mt-1">Se guarda al salir del campo.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {declarado && !actual && (
          <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
            Revisado por {declarado.revisadaPor || 'alguien sin identificar'}
            {declarado.revisadaEl ? ` el ${formatearInstante(declarado.revisadaEl)}` : ''}.
          </p>
        )}
        {declarado && actual && (
          // La declaración vieja no se borra al asignar una fuente: dice algo que fue cierto en su
          // momento y con su firma. Pero acá se avisa que ya no es lo que rige, para que nadie la lea
          // como el estado actual.
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5 mt-0.5 shrink-0" />
            <span>
              Queda una anotación anterior ({declarado.estado === 'no_aplica' ? 'no aplica' : 'sin fuente conocida'}
              {declarado.revisadaEl ? `, del ${formatearInstante(declarado.revisadaEl)}` : ''}) que ya no rige: manda la fuente asignada.
            </span>
          </p>
        )}
      </div>
    </div>
  );
};
