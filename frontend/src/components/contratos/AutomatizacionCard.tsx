import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt, faChevronDown, faChevronRight, faClock, faPlay, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { ClaveAutomatizacion, EstadoAutomatizacion, firmaDigitalAPI, ItemDeCorrida } from '../../api/firmaDigital';
import { sweetAlert } from '../../utils/sweetAlert';

/*
  LA TARJETA DE UNA AUTOMATIZACIÓN DE CONTRATACIÓN (27/11/2026, pedido del usuario), arriba de su bandeja:
  prender o apagar, cada cuántos minutos corre, qué hizo la última corrida y «Correr ahora». Son dos:
  la generación y envío de documentos (Generar Documentos) y la validación del CUIT en ARCA (Trámite
  impositivo › Constancia de CUIT). La regla de qué hace cada una vive en el server
  (`services/automatizacionesContratacion/`); acá sólo se la configura y se la mira.

  Cambiarla es de administrador (el server lo exige); quien no lo es la ve igual, para saber si la
  bandeja se mueve sola o no.
*/

const TEXTO: Record<ClaveAutomatizacion, { titulo: string; que: string; alActivar: string }> = {
  generacionDocumentos: {
    titulo: 'Generación y envío automáticos',
    que: 'Cada tanto toma lo que está en «Envío de documentación» sin enviar, genera el contrato y los releases que falten y lo manda a «Para Firmar». Lo que necesita una decisión (varias empresas sin elegir, contrato custom sin texto, plantilla vacía) queda en esta bandeja y se lista abajo.',
    alActivar: 'Se van a generar y enviar a firmar, sin que nadie apriete nada, todos los contratos que lleguen a esta bandeja con todo lo necesario. Lo que necesite una decisión queda acá.',
  },
  validacionCuit: {
    titulo: 'Validación automática del CUIT',
    que: 'Cada tanto consulta al padrón de ARCA los contratos de Constancia de CUIT con CUIT válido y empleadora cargada que todavía no se validaron, archiva el comprobante y los pasa a Generar Documentos. Los inactivos o desconocidos se reintentan una vez por día; los que no tienen empleadora quedan acá y se listan abajo.',
    alActivar: 'Se va a consultar al padrón de ARCA, sin que nadie apriete nada, el CUIT de cada contrato de Constancia de CUIT que llegue a esta bandeja. Los que den activo pasan solos a Generar Documentos.',
  },
};

/** Los números de un resumen, con su rótulo, en el orden en que se leen. Los que faltan no se muestran. */
const CONTADORES: Array<{ clave: string; rotulo: string }> = [
  { clave: 'revisados', rotulo: 'revisados' },
  { clave: 'consultados', rotulo: 'consultados' },
  { clave: 'activos', rotulo: 'activos' },
  { clave: 'inactivos', rotulo: 'inactivos' },
  { clave: 'desconocidos', rotulo: 'desconocidos' },
  { clave: 'generados', rotulo: 'generados' },
  { clave: 'enviados', rotulo: 'enviados a firmar' },
  { clave: 'avanzados', rotulo: 'pasaron de bandeja' },
  { clave: 'esperando', rotulo: 'esperan el reintento' },
  { clave: 'sinNadaQueFirmar', rotulo: 'sin nada que firmar' },
];

const fechaHora = (iso?: string | null): string => (iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const frecuenciaTexto = (min: number): string => (min % 1440 === 0 ? `${min / 1440} ${min === 1440 ? 'día' : 'días'}` : min % 60 === 0 ? `${min / 60} ${min === 60 ? 'hora' : 'horas'}` : `${min} min`);

const ListaDeItems: React.FC<{ titulo: string; items: ItemDeCorrida[]; tono: 'ambar' | 'rojo' }> = ({ titulo, items, tono }) => {
  const [abierta, setAbierta] = useState(false);
  if (!items.length) return null;
  const color = tono === 'rojo' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300';
  return (
    <div className="text-xs">
      <button type="button" onClick={() => setAbierta((v) => !v)} className={`inline-flex items-center gap-1 font-semibold ${color}`}>
        <FontAwesomeIcon icon={abierta ? faChevronDown : faChevronRight} className="h-2.5 w-2.5" />
        {items.length} {titulo}
      </button>
      {abierta && (
        <ul className="mt-1 ml-4 list-disc space-y-0.5 text-gray-600 dark:text-gray-300">
          {items.map((x, i) => (
            <li key={i}>
              <span className="font-medium text-gray-800 dark:text-gray-100">{x.persona || '—'}</span>
              {x.proyecto ? ` (${x.proyecto})` : ''}: {x.motivo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const AutomatizacionCard: React.FC<{ clave: ClaveAutomatizacion; /** Después de «Correr ahora»: la bandeja se recarga. */ onCorrida?: () => void }> = ({ clave, onCorrida }) => {
  const texto = TEXTO[clave];
  const [estado, setEstado] = useState<EstadoAutomatizacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [corriendo, setCorriendo] = useState(false);
  const [verQue, setVerQue] = useState(false);

  useEffect(() => {
    let vigente = true;
    firmaDigitalAPI
      .automatizacion()
      .then((r) => vigente && setEstado(r[clave]))
      .catch(() => vigente && setEstado(null))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [clave]);

  const guardar = async (cambios: Partial<{ activa: boolean; cadaMinutos: number }>) => {
    setGuardando(true);
    try {
      setEstado(await firmaDigitalAPI.setAutomatizacion(clave, cambios));
    } catch (e: any) {
      sweetAlert.error('No se pudo guardar', e?.response?.data?.error || e?.message || '');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarActiva = async (valor: boolean) => {
    if (valor) {
      const r = await sweetAlert.confirm(`Activar: ${texto.titulo}`, `${texto.alActivar} Corre cada ${frecuenciaTexto(estado?.cadaMinutos || 30)}.`, 'Sí, activar', 'Cancelar');
      if (!r.isConfirmed) return;
    }
    await guardar({ activa: valor });
  };

  const correr = async () => {
    setCorriendo(true);
    try {
      const r = await firmaDigitalAPI.correrAutomatizacion(clave);
      const { resumen, error, ...resto } = r;
      setEstado(resto);
      if (error) sweetAlert.error('La corrida falló', error);
      else {
        const partes = CONTADORES.filter((c) => typeof resumen?.[c.clave] === 'number').map((c) => `${resumen[c.clave]} ${c.rotulo}`);
        sweetAlert.success('Corrida terminada', `${partes.join(' · ') || 'Nada para hacer.'}${resumen?.paraResolver?.length ? ` · ${resumen.paraResolver.length} para resolver` : ''}${resumen?.errores?.length ? ` · ${resumen.errores.length} con error` : ''}.`);
      }
      onCorrida?.();
    } catch (e: any) {
      sweetAlert.error('No se pudo correr', e?.response?.data?.error || e?.message || '');
    } finally {
      setCorriendo(false);
    }
  };

  if (cargando) return null;
  if (!estado) return null;
  const ultima = estado.ultimaCorrida;
  const contadores = ultima ? CONTADORES.filter((c) => typeof ultima[c.clave] === 'number') : [];
  const ocupado = guardando || corriendo || estado.enCurso;

  return (
    <div className={`rounded-xl border p-3 ${estado.activa ? 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20' : 'border-gray-200 bg-gray-50/60 dark:border-gray-700 dark:bg-gray-900/30'}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FontAwesomeIcon icon={faBolt} className={`h-3.5 w-3.5 ${estado.activa ? 'text-blue-500' : 'text-gray-400'}`} />
          <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{texto.titulo}</span>
          <button type="button" onClick={() => setVerQue((v) => !v)} className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400">
            {verQue ? 'ocultar' : '¿qué hace?'}
          </button>
        </div>
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>{estado.activa ? 'Prendida' : 'Apagada'}</span>
          <span className={`flex h-6 w-10 shrink-0 items-center rounded-full p-1 duration-300 ease-in-out ${estado.activa ? 'bg-blue-500 dark:bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
            <span className={`h-4 w-4 transform rounded-full bg-white shadow-md duration-300 ease-in-out ${estado.activa ? 'translate-x-4' : ''}`} />
          </span>
          <input type="checkbox" className="hidden" checked={estado.activa} disabled={ocupado} onChange={(e) => void cambiarActiva(e.target.checked)} />
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <FontAwesomeIcon icon={faClock} className="h-3 w-3 text-gray-400" />
          cada
          <select className="input-field !w-auto !py-1 text-xs" value={estado.cadaMinutos} disabled={ocupado} onChange={(e) => void guardar({ cadaMinutos: Number(e.target.value) })}>
            {(estado.frecuencias.includes(estado.cadaMinutos) ? estado.frecuencias : [...estado.frecuencias, estado.cadaMinutos].sort((a, b) => a - b)).map((m) => (
              <option key={m} value={m}>
                {frecuenciaTexto(m)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void correr()} disabled={ocupado} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
          <FontAwesomeIcon icon={corriendo || estado.enCurso ? faSpinner : faPlay} spin={corriendo || estado.enCurso} className="h-3 w-3" />
          {corriendo || estado.enCurso ? 'Corriendo…' : 'Correr ahora'}
        </button>
      </div>
      {verQue && <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">{texto.que}</p>}
      <div className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-300">
        <p>
          <span className="font-semibold text-gray-700 dark:text-gray-200">Última corrida:</span> {fechaHora(estado.ultimaCorridaAt)}
          {contadores.length > 0 && <> · {contadores.map((c) => `${ultima[c.clave]} ${c.rotulo}`).join(' · ')}</>}
          {ultima?.origen === 'a mano' && ' (a mano)'}
          {estado.activa && estado.proximaAt && (
            <>
              {' '}
              · <span className="font-semibold text-gray-700 dark:text-gray-200">Próxima:</span> {fechaHora(estado.proximaAt)}
            </>
          )}
        </p>
        {estado.ultimoError && (
          <p className="flex items-start gap-1.5 text-red-700 dark:text-red-300">
            <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{estado.ultimoError}</span>
          </p>
        )}
        <ListaDeItems titulo="para resolver a mano" items={ultima?.paraResolver || []} tono="ambar" />
        <ListaDeItems titulo="con error (se reintentan)" items={ultima?.errores || []} tono="rojo" />
      </div>
    </div>
  );
};
