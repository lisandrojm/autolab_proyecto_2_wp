import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBan, faCheck, faCopy, faDesktop, faLink, faMagnifyingGlass, faMobileScreen, faPlus, faSpinner, faTrash, faUserPlus, faXmark, faCircleCheck } from '@fortawesome/free-solid-svg-icons';
import { InfoModal } from '../ui/InfoModal';
import { sweetAlert } from '../../utils/sweetAlert';
import { mensajeErrorApi } from '../../utils/errorApi';
import { usersAPI, User } from '../../api/users';
import { registroLinksAPI, RegistroLink, RegistradoAdmin, buildRegistroUrl, registroLinkDaysLeft, isRegistroLinkExpired, registroLinkExpiry } from '../../api/registroLinks';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * REGISTRO: LOS LINKS Y QUIÉNES SE REGISTRARON CON ELLOS
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Dos pestañas, porque son dos preguntas distintas:
 *
 *   · LINKS: ¿qué links hay abiertos? Los del panel se generan acá y la duración se elige al crearlos.
 *     Los de la app móvil los generan supervisores y coordinadores; lo único que se decide acá es cuánto
 *     duran, para todos a la vez. Por eso ese ajuste está arriba de la lista y no en cada link.
 *   · REGISTRADOS: ¿quién entró y por dónde? Cada persona con el link que usó y quién se lo compartió.
 *     Es lo que antes no se podía responder: el link sólo decía «3 registros», sin nombres.
 *
 * Las dos se conectan: «N registros» en un link abre Registrados filtrado por ese link.
 */

type Pestania = 'links' | 'registrados';
type Origen = 'todos' | 'web' | 'mobile';

/** Opciones para los links del móvil. Pocas y cortas: es un link que se reparte por WhatsApp. */
const DURACIONES_MOVIL = [1, 3, 7, 15, 30, 60, 90];

const fecha = (d?: string | number | null) => (d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Cliente al que quedan asociados los links que se generan desde el panel. */
  clientId?: string | null;
  /** Abre la ficha de una persona registrada (el modal de edición de Usuarios). */
  onAbrirUsuario: (user: User) => void;
}

export const RegistroModal: React.FC<Props> = ({ isOpen, onClose, clientId, onAbrirUsuario }) => {
  const [pestania, setPestania] = useState<Pestania>('links');

  // Links
  const [links, setLinks] = useState<RegistroLink[]>([]);
  const [cargandoLinks, setCargandoLinks] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [duracionSel, setDuracionSel] = useState('30');
  const [duracionCustom, setDuracionCustom] = useState('30');
  const [origenLinks, setOrigenLinks] = useState<Origen>('todos');
  const [, tick] = useState(0);

  // Duración de los links del móvil
  const [diasMovil, setDiasMovil] = useState<number | null>(null);
  const [guardandoDias, setGuardandoDias] = useState(false);
  const [diasGuardados, setDiasGuardados] = useState(false);

  // Registrados
  const [registrados, setRegistrados] = useState<RegistradoAdmin[] | null>(null);
  const [errorRegistrados, setErrorRegistrados] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [compartidoPor, setCompartidoPor] = useState('');
  const [origenReg, setOrigenReg] = useState<Origen>('todos');
  const [linkFiltro, setLinkFiltro] = useState<RegistroLink | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);

  const cargarLinks = async () => {
    setCargandoLinks(true);
    try {
      setLinks(await registroLinksAPI.list());
    } catch {
      sweetAlert.error('Error', 'No se pudieron cargar los links de registro');
    } finally {
      setCargandoLinks(false);
    }
  };

  const cargarRegistrados = async () => {
    setErrorRegistrados('');
    try {
      setRegistrados(await registroLinksAPI.registrados());
    } catch (e) {
      setRegistrados([]);
      setErrorRegistrados(mensajeErrorApi(e, 'No se pudieron cargar los registrados').detalle);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setPestania('links');
    setCopiadoId(null);
    setLinkFiltro(null);
    setBusqueda('');
    setCompartidoPor('');
    setOrigenReg('todos');
    setRegistrados(null);
    setDiasGuardados(false);
    cargarLinks();
    cargarRegistrados();
    registroLinksAPI
      .config()
      .then((c) => setDiasMovil(c.diasLinkMovil))
      .catch(() => setDiasMovil(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Mientras está abierto, refrescar los días restantes cada minuto.
  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [isOpen]);

  const guardarDiasMovil = async (n: number) => {
    const anterior = diasMovil;
    setDiasMovil(n);
    setDiasGuardados(false);
    setGuardandoDias(true);
    try {
      const c = await registroLinksAPI.guardarConfig(n);
      setDiasMovil(c.diasLinkMovil);
      setDiasGuardados(true);
      setTimeout(() => setDiasGuardados(false), 2500);
    } catch (e) {
      setDiasMovil(anterior);
      const m = mensajeErrorApi(e, 'No se pudo guardar la duración');
      sweetAlert.error(m.titulo, m.detalle);
    } finally {
      setGuardandoDias(false);
    }
  };

  const generarLink = async () => {
    const n = Number(duracionSel === 'custom' ? duracionCustom : duracionSel);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      sweetAlert.error('Duración inválida', 'La duración debe ser un número entero entre 1 y 365 días.');
      return;
    }
    setGenerando(true);
    try {
      await registroLinksAPI.generate(clientId || undefined, n);
      setOrigenLinks('todos');
      await cargarLinks();
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo generar el link de registro');
    } finally {
      setGenerando(false);
    }
  };

  const copiarLink = async (link: RegistroLink) => {
    try {
      await navigator.clipboard.writeText(buildRegistroUrl(link.token));
      setCopiadoId(link._id);
      setTimeout(() => setCopiadoId((prev) => (prev === link._id ? null : prev)), 2000);
    } catch {
      /* se puede copiar a mano desde el campo */
    }
  };

  const revocarLink = async (link: RegistroLink) => {
    const r = await sweetAlert.confirm('¿Revocar link?', 'El link dejará de funcionar de inmediato. Las personas que ya se registraron no se ven afectadas.', 'Sí, revocar');
    if (!r.isConfirmed) return;
    try {
      await registroLinksAPI.revoke(link._id);
      await cargarLinks();
    } catch {
      sweetAlert.error('Error', 'No se pudo revocar el link');
    }
  };

  const eliminarLink = async (link: RegistroLink) => {
    const r = await sweetAlert.confirm('¿Eliminar link?', 'Se eliminará el link de forma permanente. Las personas que se registraron con él siguen apareciendo en Registrados.', 'Sí, eliminar');
    if (!r.isConfirmed) return;
    try {
      await registroLinksAPI.remove(link._id);
      if (linkFiltro?._id === link._id) setLinkFiltro(null);
      await cargarLinks();
    } catch {
      sweetAlert.error('Error', 'No se pudo eliminar el link');
    }
  };

  /** «N registros» de un link: sus registrados, sin otros filtros que confundan. */
  const verRegistradosDe = (link: RegistroLink) => {
    setLinkFiltro(link);
    setBusqueda('');
    setCompartidoPor('');
    setOrigenReg('todos');
    setPestania('registrados');
  };

  const abrirUsuario = async (r: RegistradoAdmin) => {
    setAbriendo(r._id);
    try {
      const user = await usersAPI.get(r._id);
      onClose();
      onAbrirUsuario(user);
    } catch (e) {
      const m = mensajeErrorApi(e, 'No se pudo abrir el usuario');
      sweetAlert.error(m.titulo, m.detalle);
    } finally {
      setAbriendo(null);
    }
  };

  const origenDe = (l: RegistroLink): 'web' | 'mobile' => (l.origen === 'mobile' ? 'mobile' : 'web');
  const conteoLinks = { todos: links.length, web: links.filter((l) => origenDe(l) === 'web').length, mobile: links.filter((l) => origenDe(l) === 'mobile').length };
  const linksVisibles = links.filter((l) => origenLinks === 'todos' || origenDe(l) === origenLinks);

  const quienesComparten = useMemo(() => {
    const m = new Map<string, string>();
    (registrados || []).forEach((r) => r.compartidoPorId && m.set(r.compartidoPorId, r.compartidoPor || 'Sin nombre'));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [registrados]);

  const conteoReg = useMemo(() => {
    const rs = registrados || [];
    return { todos: rs.length, web: rs.filter((r) => r.origen === 'web').length, mobile: rs.filter((r) => r.origen === 'mobile').length };
  }, [registrados]);

  const registradosVisibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const digitos = q.replace(/\D/g, '');
    return (registrados || []).filter((r) => {
      if (linkFiltro && r.linkId !== linkFiltro._id) return false;
      if (compartidoPor && r.compartidoPorId !== compartidoPor) return false;
      if (origenReg !== 'todos' && r.origen !== origenReg) return false;
      if (!q) return true;
      return r.nombre.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (digitos.length >= 3 && (r.cuit || '').replace(/\D/g, '').includes(digitos));
    });
  }, [registrados, busqueda, compartidoPor, origenReg, linkFiltro]);

  const hayFiltros = !!(linkFiltro || compartidoPor || origenReg !== 'todos' || busqueda.trim());

  // ── piezas ──────────────────────────────────────────────────────────────

  const botonPestania = (id: Pestania, label: string, cuenta: number | null) => (
    <button
      type="button"
      onClick={() => setPestania(id)}
      className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${pestania === id ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
    >
      {label}
      {cuenta !== null && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${pestania === id ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>{cuenta}</span>}
    </button>
  );

  /** Todos · Panel · App móvil, con cuántos hay de cada uno. */
  const selectorOrigen = (valor: Origen, onChange: (o: Origen) => void, cuentas: Record<Origen, number>) => (
    <div className="inline-flex shrink-0 rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
      {(
        [
          ['todos', 'Todos', null],
          ['web', 'Panel', faDesktop],
          ['mobile', 'App móvil', faMobileScreen],
        ] as const
      ).map(([id, label, icono]) => (
        <button key={id} type="button" onClick={() => onChange(id)} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${valor === id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
          {icono && <FontAwesomeIcon icon={icono} className="h-3 w-3" />}
          {label}
          <span className="opacity-70">{cuentas[id]}</span>
        </button>
      ))}
    </div>
  );

  const chipOrigen = (origen: 'web' | 'mobile') =>
    origen === 'mobile' ? (
      <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
        <FontAwesomeIcon icon={faMobileScreen} className="h-2.5 w-2.5" /> App móvil
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        <FontAwesomeIcon icon={faDesktop} className="h-2.5 w-2.5" /> Panel
      </span>
    );

  const opcionesDiasMovil = diasMovil !== null && !DURACIONES_MOVIL.includes(diasMovil) ? [...DURACIONES_MOVIL, diasMovil].sort((a, b) => a - b) : DURACIONES_MOVIL;

  const pestaniaLinks = (
    <>
      {/* DURACIÓN DE LOS LINKS DEL MÓVIL: una sola decisión para todos los supervisores y coordinadores */}
      <div className="flex flex-col gap-3 rounded-lg border border-purple-200 bg-purple-50/60 px-3 py-2.5 dark:border-purple-900/60 dark:bg-purple-950/20 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <FontAwesomeIcon icon={faMobileScreen} className="mt-1 h-4 w-4 text-purple-600 dark:text-purple-300" />
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Links de la app móvil</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Los generan coordinadores y supervisores desde Registro y se renuevan solos al vencer. El cambio aplica a los próximos links: los vigentes conservan su vencimiento.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor="dias-link-movil" className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            Duran
          </label>
          <select id="dias-link-movil" value={diasMovil ?? ''} disabled={diasMovil === null || guardandoDias} onChange={(e) => guardarDiasMovil(Number(e.target.value))} className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white disabled:opacity-60">
            {diasMovil === null && <option value="">—</option>}
            {opcionesDiasMovil.map((n) => (
              <option key={n} value={n}>
                {dias(n)}
              </option>
            ))}
          </select>
          <span className="w-20 text-xs">
            {guardandoDias ? (
              <FontAwesomeIcon icon={faSpinner} spin className="text-gray-400" />
            ) : diasGuardados ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                <FontAwesomeIcon icon={faCheck} /> Guardado
              </span>
            ) : null}
          </span>
        </div>
      </div>

      {/* LINKS DEL PANEL: se generan acá, con su propia duración */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="flex-1 text-sm text-gray-600 dark:text-gray-300">
          Compartí un link con quien quieras registrar. Elegí cuántos días dura; <strong>la duración no se puede cambiar una vez creado</strong>. Podés revocarlo cuando quieras.
        </p>
        <div className="flex shrink-0 items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-gray-500 dark:text-gray-400">Duración</label>
            <select value={duracionSel} onChange={(e) => setDuracionSel(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
              <option value="7">7 días</option>
              <option value="15">15 días</option>
              <option value="30">30 días</option>
              <option value="60">60 días</option>
              <option value="90">90 días</option>
              <option value="custom">Personalizado…</option>
            </select>
          </div>
          {duracionSel === 'custom' && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-500 dark:text-gray-400">Días (1-365)</label>
              <input type="number" min={1} max={365} value={duracionCustom} onChange={(e) => setDuracionCustom(e.target.value)} className="w-24 rounded border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
            </div>
          )}
          <button type="button" onClick={generarLink} disabled={generando} className="flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700 disabled:opacity-60">
            <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
            {generando ? 'Generando...' : 'Generar nuevo link'}
          </button>
        </div>
      </div>

      {links.length > 0 && <div className="flex justify-end">{selectorOrigen(origenLinks, setOrigenLinks, conteoLinks)}</div>}

      {cargandoLinks && links.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">Cargando links...</p>
      ) : links.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <FontAwesomeIcon icon={faUserPlus} className="text-xl text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-sm text-gray-500">Todavía no hay links. Generá uno para empezar.</p>
        </div>
      ) : linksVisibles.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">No hay links {origenLinks === 'mobile' ? 'de la app móvil' : 'del panel'}.</p>
      ) : (
        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {linksVisibles.map((link) => {
            const vencido = isRegistroLinkExpired(link);
            const usable = link.active && !vencido;
            const quedan = registroLinkDaysLeft(link);
            const vence = registroLinkExpiry(link);
            return (
              <div key={link._id} className={`rounded-lg border px-3 py-2.5 ${usable ? 'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40' : 'border-gray-200 bg-gray-100/60 opacity-70 dark:border-gray-800 dark:bg-gray-900/20'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {!link.active ? <span className="inline-flex items-center rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:bg-red-900/40 dark:text-red-300">Revocado</span> : vencido ? <span className="inline-flex items-center rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:bg-red-900/40 dark:text-red-300">Vencido</span> : <span className="inline-flex items-center rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Activo</span>}
                    {chipOrigen(origenDe(link))}
                    {link.clientName && <span className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">{link.clientName}</span>}
                    {link.projectName && <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">{[link.projectName, link.areaName, link.shiftName].filter(Boolean).join(' · ')}</span>}
                    {link.usageCount > 0 ? (
                      <button type="button" onClick={() => verRegistradosDe(link)} className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400" title="Ver quiénes se registraron con este link">
                        {link.usageCount} {link.usageCount === 1 ? 'registro' : 'registros'} →
                      </button>
                    ) : (
                      <span className="text-xs text-gray-500 dark:text-gray-400">0 registros</span>
                    )}
                    {usable && quedan !== null && <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${quedan <= 5 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>{quedan === 0 ? 'Vence hoy' : `Vence en ${dias(quedan)}`}</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {usable && (
                      <button type="button" onClick={() => copiarLink(link)} title="Copiar link" className="rounded bg-blue-600 p-2 text-white transition-colors hover:bg-blue-700">
                        <FontAwesomeIcon icon={copiadoId === link._id ? faCheck : faCopy} className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {usable && (
                      <button type="button" onClick={() => revocarLink(link)} title="Revocar link" className="rounded p-2 text-amber-600 transition-colors hover:bg-amber-50 dark:hover:bg-amber-900/30">
                        <FontAwesomeIcon icon={faBan} className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button type="button" onClick={() => eliminarLink(link)} title="Eliminar link" className="rounded p-2 text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-900/30">
                      <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {usable && (
                  <div className="mt-2 flex items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900/60">
                    <FontAwesomeIcon icon={faLink} className="h-3 w-3 shrink-0 text-gray-400" />
                    <input readOnly value={buildRegistroUrl(link.token)} onFocus={(e) => e.currentTarget.select()} className="flex-1 truncate bg-transparent text-xs text-gray-600 outline-none dark:text-gray-300" />
                  </div>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
                  {link.createdByName && <span className="font-medium text-gray-500 dark:text-gray-300">Por: {link.createdByName}</span>}
                  <span>Creado: {fecha(link.createdAt)}</span>
                  {vence !== null && <span>Vence: {fecha(vence)}</span>}
                  {link.lastUsedAt && <span>Último uso: {fecha(link.lastUsedAt)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  const pestaniaRegistrados = (
    <>
      <p className="text-sm text-gray-600 dark:text-gray-300">Quiénes se registraron con un link, cuándo y quién se lo compartió. Tocá una persona para abrir su ficha.</p>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, email o CUIT" className="w-full rounded border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
        </div>
        <select value={compartidoPor} onChange={(e) => setCompartidoPor(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white lg:w-56">
          <option value="">Compartido por: todos</option>
          {quienesComparten.map(([id, nombre]) => (
            <option key={id} value={id}>
              {nombre}
            </option>
          ))}
        </select>
        {selectorOrigen(origenReg, setOrigenReg, conteoReg)}
      </div>

      {linkFiltro && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 py-1 pl-3 pr-1 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
            <FontAwesomeIcon icon={faLink} className="h-3 w-3" />
            Link de {linkFiltro.createdByName || 'sin autor'} · creado el {fecha(linkFiltro.createdAt)}
            <button type="button" onClick={() => setLinkFiltro(null)} aria-label="Quitar filtro de link" className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40">
              <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}

      {errorRegistrados ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{errorRegistrados}</p>
      ) : registrados === null ? (
        <p className="py-6 text-center text-sm text-gray-500">
          <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
          Cargando registrados...
        </p>
      ) : registradosVisibles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <FontAwesomeIcon icon={faUserPlus} className="text-2xl text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500">{registrados.length === 0 ? 'Todavía nadie se registró con un link.' : 'Nadie coincide con los filtros.'}</p>
          {hayFiltros && registrados.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setLinkFiltro(null);
                setCompartidoPor('');
                setOrigenReg('todos');
                setBusqueda('');
              }}
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              Quitar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
          {/* Encabezado de columnas: sólo donde hay ancho para columnas */}
          <div className="sticky top-0 hidden grid-cols-[minmax(0,2fr)_110px_minmax(0,1.5fr)_120px] gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 md:grid">
            <span>Persona</span>
            <span>Se registró</span>
            <span>Link</span>
            <span>Estado</span>
          </div>
          {registradosVisibles.map((r) => (
            <button key={r._id} type="button" onClick={() => abrirUsuario(r)} disabled={abriendo !== null} className="grid w-full grid-cols-1 gap-1.5 border-b border-gray-100 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-blue-50/60 disabled:cursor-wait dark:border-gray-800 dark:hover:bg-gray-800/60 md:grid-cols-[minmax(0,2fr)_110px_minmax(0,1.5fr)_120px] md:items-center md:gap-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {abriendo === r._id && <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3 text-gray-400" />}
                  {r.nombre}
                </span>
                <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                  {r.email}
                  {r.cuit ? ` · ${r.cuit}` : ''}
                </span>
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-300">{fecha(r.registradoAt)}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {chipOrigen(r.origen)}
                <span className="truncate text-xs text-gray-600 dark:text-gray-300">{r.compartidoPor ? `Compartido por ${r.compartidoPor}` : 'Sin autor'}</span>
                {r.linkBorrado && <span className="text-[10px] italic text-gray-400">(link eliminado)</span>}
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {r.validadoEnArca && (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <FontAwesomeIcon icon={faCircleCheck} className="h-2.5 w-2.5" /> ARCA
                  </span>
                )}
                {!r.activo && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">Inactivo</span>}
                {r.activo && !r.validadoEnArca && <span className="text-[11px] text-gray-400">—</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {registrados && registrados.length > 0 && (
        <p className="text-[11px] text-gray-400">
          {hayFiltros ? `${registradosVisibles.length} de ${registrados.length} registrados.` : `${registrados.length} registrados.`} Sólo figuran los registros hechos desde que se guarda con qué link vino cada persona.
        </p>
      )}
    </>
  );

  return (
    <InfoModal isOpen={isOpen} onClose={onClose} title="Registro" size="xl">
      <div className="flex flex-col gap-4 py-1">
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {botonPestania('links', 'Links', links.length)}
          {botonPestania('registrados', 'Registrados', registrados ? registrados.length : null)}
        </div>
        {pestania === 'links' ? pestaniaLinks : pestaniaRegistrados}
      </div>
    </InfoModal>
  );
};
