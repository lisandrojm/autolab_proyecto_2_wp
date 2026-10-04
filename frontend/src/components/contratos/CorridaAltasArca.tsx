import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faCircleXmark, faSpinner, faCircle, faTriangleExclamation, faCopy, faFlask, faCircleQuestion, faDownload, faEye } from '@fortawesome/free-solid-svg-icons';
import { Modal } from '../ui/Modal';
import { projectsAPI, EstadoCorridaAltas, ModoAltasArca } from '../../api/projects';
import { MAX_ALTAS_MASIVAS } from '@compartido/layoutAltaArca';
import { ETIQUETA_ESTADO, EstadoPersonaTanda, detalleDeLoPresentado, progresoPorTandas, resumenCsv } from './progresoTandas';

/**
 * EL TRÁMITE DE ALTA EN ARCA, EN VIVO: Carga Masiva (archivo) o Altas Masivas (pegado, URGENTE).
 *
 * Mismo mecanismo que `PantallaValidarObrasSociales`: la corrida vive en el servidor y esto la mira
 * por polling, reconstruyendo todo desde los eventos en cada vuelta. Por eso cerrar y volver a abrir
 * retoma lo que ya pasó: no hay estado propio que perder.
 *
 * Antes de arrancar pide confirmación explícita con la empleadora, la cantidad y los nombres: lo que
 * sigue no se deshace. «Detener» funciona hasta el paso anterior al envío; después se deshabilita.
 *
 * ALTAS MASIVAS VA POR TANDAS (ARCA admite 9 registros por pegado): una sola confirmación para toda
 * la selección, y después el avance por tanda y por persona (`progresoTandas.ts`). Ahí «Detener» no
 * se deshabilita: corta al terminar la tanda en curso.
 */

const POLL_MS = 2000;
/** Sin eventos nuevos en este tiempo, se avisa que la corrida parece colgada (no se corta nada). */
const TOPE_SIN_EVENTOS_MS = 90_000;

export interface LoteParaPresentar {
  modo: ModoAltasArca;
  empresa: { _id: string; razonSocial: string; cuit: string };
  personas: Array<{ nombre: string; cuil: string }>;
  items: Array<{ userProjectId: string; contractIndex: number; registro: string }>;
  /** Solo URGENTE: el texto que también quedó en el portapapeles, por si hay que pegarlo a mano. */
  texto?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Lo que se va a presentar. Sin lote, el modal solo se engancha a la corrida en curso. */
  lote: LoteParaPresentar | null;
  /** Al terminar (bien o mal): refrescar el listado. */
  onTerminado?: () => void;
}

type EstadoPaso = 'pendiente' | 'en_curso' | 'listo' | 'fallo' | 'omitido';
interface Paso {
  clave: string;
  titulo: string;
  estado: EstadoPaso;
  detalle?: string;
}

/** Cómo se ve cada estado de una persona en la lista de tandas. */
const VISTA_ESTADO: Record<EstadoPersonaTanda, { icon: typeof faCircle; clase: string; spin?: boolean }> = {
  pendiente: { icon: faCircle, clase: 'text-gray-300 dark:text-gray-600' },
  presentando: { icon: faSpinner, clase: 'text-blue-500', spin: true },
  registrada: { icon: faCircleCheck, clase: 'text-green-600 dark:text-green-400' },
  rechazada: { icon: faCircleXmark, clase: 'text-red-600 dark:text-red-400' },
  incierta: { icon: faCircleQuestion, clase: 'text-amber-600 dark:text-amber-400' },
  seco: { icon: faFlask, clase: 'text-gray-400' },
};

const fmtCuit = (c: string) => (c && c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);

/** Los pasos de cada trámite y qué evento marca cada uno como hecho. */
const PASOS: Record<ModoAltasArca, Array<{ clave: string; titulo: string; hecho: string }>> = {
  carga_masiva: [
    { clave: 'sesion', titulo: 'Abriendo sesión en ARCA', hecho: 'sesion' },
    { clave: 'empleadora', titulo: 'Eligiendo la empleadora', hecho: 'empleadoraVerificada' },
    { clave: 'pantalla', titulo: 'Relaciones Laborales → Carga Masiva', hecho: 'pantalla' },
    { clave: 'novedad', titulo: 'Novedad creada', hecho: 'novedadCreada' },
    { clave: 'archivo', titulo: 'Archivo cargado', hecho: 'archivoCargado' },
    { clave: 'validacion', titulo: 'Validación de ARCA', hecho: 'validacion' },
    { clave: 'envio', titulo: 'Enviada', hecho: 'enviada' },
  ],
  altas_masivas: [
    { clave: 'sesion', titulo: 'Abriendo sesión en ARCA', hecho: 'sesion' },
    { clave: 'empleadora', titulo: 'Eligiendo la empleadora', hecho: 'empleadoraVerificada' },
    // Lo que pasa UNA vez. Lo que se repite en cada tanda (pegar, grilla, Aceptar) va en la lista de tandas.
    { clave: 'tope', titulo: 'Relaciones Laborales → Registrar Nuevas Altas', hecho: 'tope' },
    { clave: 'plan', titulo: 'Tandas armadas', hecho: 'plan' },
  ],
};

/** Reconstruye los pasos desde los eventos. Puro: es lo único que el modal sabe de la corrida. */
export function pasosDeLaCorrida(modo: ModoAltasArca, e: EstadoCorridaAltas): Paso[] {
  const ev = e.eventos || [];
  const hay = (tipo: string) => ev.some((x) => x.tipo === tipo);
  const ult = (tipo: string) => [...ev].reverse().find((x) => x.tipo === tipo);
  const fallo = ult('fallo');
  const seco = hay('seco');
  const terminado = !e.corriendo;
  let pendienteVisto = false;
  return PASOS[modo].map((p) => {
    let estado: EstadoPaso;
    let detalle: string | undefined;
    if (hay(p.hecho)) estado = 'listo';
    else if (pendienteVisto) estado = 'pendiente';
    else {
      pendienteVisto = true;
      estado = fallo ? 'fallo' : seco ? 'omitido' : terminado ? 'pendiente' : 'en_curso';
      if (fallo) detalle = fallo.textoArca ? `ARCA dijo: «${fallo.textoArca}»` : fallo.mensaje;
    }
    if (seco && estado === 'pendiente') estado = 'omitido';
    if (p.clave === 'novedad' && hay('novedadCreada')) detalle = `Código ${ult('novedadCreada')?.codigo || '—'}`;
    if (p.clave === 'validacion') {
      const v = ult('validacion');
      if (v) detalle = `${v.estado || 'sin estado'} · ${v.registrosLeidos} de ${v.enviados} registros${v.errores ? ` · ${v.errores}` : ''}`;
    }
    if (p.clave === 'envio') {
      const s = ult('enviada');
      if (s) detalle = `${s.estado} · Nro. de transacción ${s.nroTransaccion || '—'} · presentada el ${s.fechaPresentacion || '—'}`;
    }
    if (p.clave === 'tope' && hay('tope')) detalle = `ARCA admite ${ult('tope')?.enPantalla} registros por pegado · se usan ${ult('tope')?.usado}`;
    if (p.clave === 'plan' && hay('plan')) detalle = `${ult('plan')?.total} alta(s) en ${ult('plan')?.tandas} tanda(s) de hasta ${ult('plan')?.tope}`;
    if (p.clave === 'empleadora' && hay('empleadoraVerificada')) detalle = `CUIT ${fmtCuit(ult('empleadoraVerificada')?.cuit || '')} verificado en pantalla`;
    return { clave: p.clave, titulo: p.titulo, estado, detalle };
  });
}

const ICONO: Record<EstadoPaso, { icon: typeof faCircle; clase: string; spin?: boolean }> = {
  pendiente: { icon: faCircle, clase: 'text-gray-300 dark:text-gray-600' },
  en_curso: { icon: faSpinner, clase: 'text-blue-500', spin: true },
  listo: { icon: faCircleCheck, clase: 'text-green-600 dark:text-green-400' },
  fallo: { icon: faCircleXmark, clase: 'text-red-600 dark:text-red-400' },
  omitido: { icon: faFlask, clase: 'text-gray-400' },
};

export const CorridaAltasArca: React.FC<Props> = ({ isOpen, onClose, lote, onTerminado }) => {
  const [estado, setEstado] = useState<EstadoCorridaAltas | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [arrancando, setArrancando] = useState(false);
  const [error, setError] = useState<{ mensaje: string; detalle?: Array<string | { etiqueta: string; campo: string; esperado: string; recibido: string }> } | null>(null);
  const [enSecoPedido, setEnSecoPedido] = useState(false);
  const [ultimoCambio, setUltimoCambio] = useState(Date.now());
  const [deteniendo, setDeteniendo] = useState(false);
  /** El modal «Lo presentado»: cada registro tal cual se mandó a ARCA, campo por campo. */
  const [verPresentado, setVerPresentado] = useState(false);
  const intervalo = useRef<number | null>(null);
  const cantEventos = useRef(0);
  const avisoTerminado = useRef(false);

  const parar = () => {
    if (intervalo.current) window.clearInterval(intervalo.current);
    intervalo.current = null;
  };

  const consultar = useCallback(async () => {
    try {
      const r = await projectsAPI.estadoAltasArca();
      setEstado(r);
      if ((r.eventos?.length || 0) !== cantEventos.current) {
        cantEventos.current = r.eventos?.length || 0;
        setUltimoCambio(Date.now());
      }
      if (!r.corriendo) {
        parar();
        if (r.hay && !avisoTerminado.current) {
          avisoTerminado.current = true;
          onTerminado?.();
        }
      }
      return r;
    } catch {
      return null; // un tick perdido no corta nada: el próximo vuelve a preguntar
    }
  }, [onTerminado]);

  const seguir = useCallback(() => {
    parar();
    avisoTerminado.current = false;
    intervalo.current = window.setInterval(consultar, POLL_MS);
  }, [consultar]);

  // Al abrir: si hay una corrida en curso, se engancha (aunque se haya abierto para otra cosa).
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setConfirmado(false);
    consultar().then((r) => {
      if (r?.corriendo) {
        setConfirmado(true);
        seguir();
      }
    });
    return parar;
  }, [isOpen, consultar, seguir]);

  const presentar = async () => {
    if (!lote) return;
    setArrancando(true);
    setError(null);
    try {
      await projectsAPI.arrancarAltasArca({ modo: lote.modo, empresaId: lote.empresa._id, items: lote.items, enSeco: enSecoPedido });
      setConfirmado(true);
      cantEventos.current = 0;
      await consultar();
      seguir();
    } catch (e: any) {
      setError({ mensaje: e?.response?.data?.error || e?.message || 'No se pudo arrancar la corrida.', detalle: e?.response?.data?.detalle });
    } finally {
      setArrancando(false);
    }
  };

  const detener = async () => {
    setDeteniendo(true);
    try {
      const r = await projectsAPI.detenerAltasArca();
      if (!r.detenida && r.motivo) setError({ mensaje: r.motivo });
    } finally {
      setDeteniendo(false);
    }
  };

  const copiar = async () => {
    if (!lote?.texto) return;
    try {
      await navigator.clipboard.writeText(lote.texto);
    } catch {
      /* el textarea de abajo permite copiarlo a mano */
    }
  };

  const corriendo = !!estado?.corriendo;
  const modo: ModoAltasArca | undefined = (corriendo || confirmado ? estado?.tipo : undefined) || lote?.modo || estado?.tipo;
  const pasos = useMemo(() => (estado && modo && (confirmado || corriendo) ? pasosDeLaCorrida(modo, estado) : []), [estado, modo, confirmado, corriendo]);
  const ev = estado?.eventos || [];
  const indeterminado = [...ev].reverse().find((x) => x.tipo === 'indeterminado');
  const fin = [...ev].reverse().find((x) => x.tipo === 'fin');
  const falloEv = [...ev].reverse().find((x) => x.tipo === 'fallo');
  const seco = ev.find((x) => x.tipo === 'seco');
  const personasResultado = ev.filter((x) => x.tipo === 'persona');
  const nombreDe = (cuil: string) => estado?.personas?.find((p) => p.cuil === cuil)?.nombre || fmtCuit(cuil);
  const colgada = corriendo && Date.now() - ultimoCambio > TOPE_SIN_EVENTOS_MS;
  const otraCorrida = !corriendo && !confirmado && estado?.ocupadaPor;
  const titulo = modo === 'altas_masivas' ? 'Altas Masivas en ARCA (URGENTE)' : 'Carga Masiva en ARCA';
  // Por tandas: Altas Masivas. Antes de arrancar se muestra el plan con el tope de siempre; una vez
  // que corre, manda lo que el servidor leyó de la pantalla de ARCA.
  const porTandas = modo === 'altas_masivas';
  const tandasDelLote = lote ? Math.ceil(lote.personas.length / MAX_ALTAS_MASIVAS) : 0;
  const progreso = useMemo(
    () => (porTandas && estado && (confirmado || corriendo) ? progresoPorTandas({ eventos: estado.eventos || [], personas: estado.personas || [], descartadas: estado.descartadas }) : null),
    [porTandas, estado, confirmado, corriendo],
  );
  const bajarResumen = () => {
    if (!progreso) return;
    // Con BOM: sin él Excel abre los acentos rotos.
    const url = URL.createObjectURL(new Blob(['\ufeff' + resumenCsv(progreso, { razonSocial: estado?.empresaRazonSocial, cuit: estado?.empresaCuit })], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `altas-masivas-${estado?.empresaCuit || 'arca'}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const enSecoEfectivo = corriendo || confirmado ? !!estado?.enSeco : !!estado?.enSecoForzado || enSecoPedido;

  const pie = (
    <div className="flex items-center justify-end gap-2">
      {(corriendo || confirmado) && (
        <button type="button" onClick={detener} disabled={!corriendo || (!porTandas && !!estado?.irreversible) || !!estado?.detenerPedido || deteniendo} title={porTandas ? (estado?.detenerPedido ? 'Se detiene al terminar la tanda en curso.' : 'Corta al terminar la tanda en curso: lo ya presentado queda guardado.') : estado?.irreversible ? 'Ya se apretó el botón que presenta: no se puede detener.' : 'Corta antes del próximo paso. No se presenta nada.'} className="px-4 py-2 rounded-lg text-sm font-semibold border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed">
          {porTandas && estado?.detenerPedido && corriendo ? 'Deteniendo…' : 'Detener'}
        </button>
      )}
      {progreso && (estado?.personas || []).some((p) => p.registro) && (
        <button type="button" onClick={() => setVerPresentado(true)} title="Cada registro tal cual se mandó a ARCA, campo por campo" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
          <FontAwesomeIcon icon={faEye} className="h-3.5 w-3.5" />
          Ver lo presentado
        </button>
      )}
      {progreso && !corriendo && (
        <button type="button" onClick={bajarResumen} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
          <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5" />
          Bajar resumen
        </button>
      )}
      {!confirmado && !corriendo && lote && (
        <button type="button" onClick={presentar} disabled={arrancando || !!otraCorrida} className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${lote.modo === 'altas_masivas' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {arrancando && <FontAwesomeIcon icon={faSpinner} spin className="h-3.5 w-3.5" />}
          {enSecoEfectivo ? 'Probar en seco' : 'Presentar en ARCA'}
        </button>
      )}
      <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
        {corriendo ? 'Cerrar (sigue corriendo)' : 'Cerrar'}
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={titulo} size={porTandas ? 'lg' : 'md'} zIndex={80} footer={pie}>
      <div className="space-y-4 text-sm text-gray-700 dark:text-gray-200">
        {enSecoEfectivo && (
          <div className="rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-xs">
            <FontAwesomeIcon icon={faFlask} className="mr-1.5" />
            <strong>En seco:</strong> llega hasta justo antes de presentar y no envía nada.
            {modo === 'carga_masiva' ? ' Deja la novedad creada en ARCA, sin enviar.' : ' Recorre todas las tandas: en cada una pega el texto pero no lo pasa a la grilla.'}
          </div>
        )}

        {/* ── Confirmación ── */}
        {!confirmado && !corriendo && lote && (
          <>
            {otraCorrida && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                Hay otra corrida de ARCA en curso en esta cuenta. Usan la misma sesión: esperá a que termine.
              </div>
            )}
            <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 px-3 py-2.5">
              <p className="font-semibold text-red-800 dark:text-red-300">
                <FontAwesomeIcon icon={faTriangleExclamation} className="mr-1.5" />
                Esto presenta {lote.personas.length} alta(s) ante ARCA y no se deshace.
              </p>
              <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                Empleadora: <strong>{lote.empresa.razonSocial}</strong> · CUIT {fmtCuit(lote.empresa.cuit)}. Se verifica en la pantalla de ARCA antes de escribir.
              </p>
              {porTandas && (
                <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                  Se presentan en <strong>{tandasDelLote} tanda(s)</strong> de hasta {MAX_ALTAS_MASIVAS}, una después de la otra, con esta única confirmación. Lo que ya esté presentado se saltea. «Detener» corta al terminar la tanda en curso: lo presentado hasta ahí queda presentado.
                </p>
              )}
            </div>
            <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
              {lote.personas.map((p) => (
                <li key={p.cuil} className="px-3 py-1.5 flex justify-between gap-2">
                  <span>{p.nombre}</span>
                  <span className="font-mono text-xs text-gray-500">{fmtCuit(p.cuil)}</span>
                </li>
              ))}
            </ul>
            {!estado?.enSecoForzado && (
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={enSecoPedido} onChange={(e) => setEnSecoPedido(e.target.checked)} />
                Probar en seco (llega hasta antes de presentar)
              </label>
            )}
          </>
        )}

        {lote?.texto && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Texto de Altas Masivas (ya está en el portapapeles)</span>
              <button type="button" onClick={copiar} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
                <FontAwesomeIcon icon={faCopy} className="mr-1" />
                Copiar
              </button>
            </div>
            <textarea readOnly value={lote.texto} rows={Math.min(6, lote.personas.length) + 1} className="w-full font-mono text-[11px] p-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-800 dark:text-red-300">
            <p className="font-semibold">{error.mensaje}</p>
            {error.detalle && error.detalle.length > 0 && (
              <ul className="mt-1 list-disc pl-4 space-y-0.5 max-h-40 overflow-y-auto">
                {error.detalle.map((d, i) => (
                  <li key={i}>{typeof d === 'string' ? d : `${d.etiqueta}: ${d.campo} — se esperaba «${d.esperado}» y vino «${d.recibido}»`}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── En vivo ── */}
        {pasos.length > 0 && (
          <>
            {estado?.empresaRazonSocial && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {estado.empresaRazonSocial} · CUIT {fmtCuit(estado.empresaCuit || '')} · {estado.total} alta(s)
              </p>
            )}
            <ol className="space-y-2">
              {pasos.map((p) => {
                const i = ICONO[p.estado];
                return (
                  <li key={p.clave} className="flex items-start gap-2">
                    <FontAwesomeIcon icon={i.icon} spin={i.spin} className={`h-4 w-4 mt-0.5 shrink-0 ${i.clase}`} />
                    <div>
                      <p className={p.estado === 'pendiente' || p.estado === 'omitido' ? 'text-gray-400' : ''}>
                        {p.titulo}
                        {p.estado === 'omitido' && <span className="text-xs"> (en seco: no se hizo)</span>}
                      </p>
                      {p.detalle && <p className={`text-xs ${p.estado === 'fallo' ? 'text-red-700 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{p.detalle}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* ── Por tandas: cada tanda con sus personas ── */}
            {progreso && (
              <>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  {progreso.cuenta.registrada} registrada(s) · {progreso.cuenta.rechazada} rechazada(s) · {progreso.cuenta.incierta} incierta(s) · {progreso.cuenta.pendiente + progreso.cuenta.presentando} sin presentar
                  {progreso.cuenta.seco > 0 ? ` · ${progreso.cuenta.seco} en seco` : ''}
                </p>
                {(estado?.descartadas || []).some((d) => d.motivo === 'presentada') && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{(estado?.descartadas || []).filter((d) => d.motivo === 'presentada').length} contrato(s) de la selección ya estaban presentados y se saltearon.</p>
                )}
                <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                  {progreso.consultadas.length > 0 && (
                    <div className="border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-t-lg">Sin resultado de una corrida anterior: no se presentan, se consultan en ARCA</p>
                      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                        {progreso.consultadas.map((f) => (
                          <li key={f.cuil} className="px-3 py-1 flex items-center gap-2 text-xs">
                            <FontAwesomeIcon icon={VISTA_ESTADO[f.estado].icon} spin={VISTA_ESTADO[f.estado].spin} className={`h-3 w-3 shrink-0 ${VISTA_ESTADO[f.estado].clase}`} />
                            <span className="flex-1">{f.nombre}</span>
                            <span className="text-gray-500">{f.estado === 'pendiente' ? 'Por consultar' : f.estado === 'registrada' ? 'Figura en ARCA: registrada' : 'Sigue incierta'}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {progreso.tandas.map((t) => (
                    <div key={t.n} className="border border-gray-200 dark:border-gray-700 rounded-lg">
                      <p className="px-3 py-1.5 text-xs font-semibold bg-gray-50 dark:bg-gray-900/40 rounded-t-lg flex items-center justify-between">
                        <span>
                          Tanda {t.n} de {progreso.tandas.length} · {t.personas.length} persona(s)
                        </span>
                        <span className={t.estado === 'presentando' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}>
                          {t.estado === 'pendiente' ? 'Pendiente' : t.estado === 'presentando' ? 'Presentando…' : `Terminada${t.duracionMs ? ` en ${Math.round(t.duracionMs / 1000)} s` : ''}`}
                        </span>
                      </p>
                      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                        {t.personas.map((f) => (
                          <li key={f.cuil} className="px-3 py-1 flex items-start gap-2 text-xs">
                            <FontAwesomeIcon icon={VISTA_ESTADO[f.estado].icon} spin={VISTA_ESTADO[f.estado].spin} className={`h-3 w-3 mt-0.5 shrink-0 ${VISTA_ESTADO[f.estado].clase}`} />
                            <div className="flex-1 min-w-0">
                              <p className="flex justify-between gap-2">
                                <span className="truncate">{f.nombre}</span>
                                <span className="shrink-0 text-gray-500 dark:text-gray-400">
                                  {ETIQUETA_ESTADO[f.estado]}
                                  {f.cat ? ` · C.A.T. ${f.cat}` : ''}
                                  {f.porConsulta ? ' · por consulta' : ''}
                                </span>
                              </p>
                              {f.motivo && <p className={f.estado === 'rechazada' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}>{f.motivo}</p>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                {/* Un fallo después de armar las tandas no cae en ningún paso de arriba: se dice acá. */}
                {falloEv && pasos.every((p) => p.estado === 'listo') && (
                  <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-800 dark:text-red-300">
                    <p className="font-semibold">La corrida falló: {falloEv.mensaje}</p>
                    <p className="mt-0.5">Lo que quedó «presentando» no se vuelve a presentar: la próxima corrida lo consulta en ARCA.</p>
                  </div>
                )}
                {progreso.corte && (
                  <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                    <p className="font-semibold">
                      <FontAwesomeIcon icon={faTriangleExclamation} className="mr-1.5" />
                      {progreso.corte.motivo === 'detenida' ? 'Corrida detenida.' : 'La corrida se cortó sola.'}
                    </p>
                    <p className="mt-0.5">{progreso.corte.mensaje}</p>
                    <p className="mt-0.5">Lo presentado quedó guardado. Para seguir, volvé a lanzarla con la misma selección: lo ya presentado se saltea.</p>
                  </div>
                )}
              </>
            )}

            {!porTandas && personasResultado.length > 0 && (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
                {personasResultado.map((p) => (
                  <li key={p.cuil} className="px-3 py-1.5 flex items-start gap-2">
                    <FontAwesomeIcon icon={p.estado === 'alta' ? faCircleCheck : p.estado === 'rechazada' ? faCircleXmark : faCircleQuestion} className={`h-3.5 w-3.5 mt-0.5 ${p.estado === 'alta' ? 'text-green-600' : p.estado === 'rechazada' ? 'text-red-600' : 'text-amber-500'}`} />
                    <div>
                      <p>{nombreDe(p.cuil)}</p>
                      {p.motivo && <p className="text-xs text-red-700 dark:text-red-400">{p.motivo}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {colgada && <p className="text-xs text-amber-700 dark:text-amber-400">Hace más de un minuto y medio que ARCA no avanza. La corrida sigue; si no se mueve, mirá la pantalla de ARCA antes de hacer nada.</p>}

            {indeterminado && !porTandas && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-semibold">
                  <FontAwesomeIcon icon={faCircleQuestion} className="mr-1.5" />
                  No se pudo confirmar el resultado.
                </p>
                <p className="mt-0.5">{indeterminado.comoVerificar}</p>
              </div>
            )}
            {seco && !corriendo && (
              <p className="text-xs text-gray-600 dark:text-gray-300">
                Prueba en seco terminada: no se presentó nada.{seco.codigoNovedad ? ` La novedad ${seco.codigoNovedad} quedó creada en ARCA, sin enviar.` : ''}
              </p>
            )}
            {/* ── Cierre: éxito a la vista si quedaron TODAS registradas; si no, qué quedó sin resolver ── */}
            {porTandas && fin && !seco && !progreso?.corte && progreso && progreso.cuenta.registrada > 0 && progreso.cuenta.incierta + progreso.cuenta.rechazada + progreso.cuenta.pendiente === 0 && (
              <div className="rounded-lg border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-green-800 dark:text-green-300">
                <p className="text-sm font-semibold">
                  <FontAwesomeIcon icon={faCircleCheck} className="mr-1.5" />
                  {progreso.cuenta.registrada === 1 ? 'El alta quedó registrada en ARCA.' : `Las ${progreso.cuenta.registrada} altas quedaron registradas en ARCA.`}
                </p>
                <p className="text-xs mt-1">Cada contrato quedó marcado como presentado. El estado avanza cuando se cargue la constancia de alta temprana de cada persona.</p>
              </div>
            )}
            {porTandas && fin && !seco && !progreso?.corte && progreso && progreso.cuenta.incierta + progreso.cuenta.rechazada + progreso.cuenta.pendiente > 0 && (
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                Corrida terminada: {progreso.cuenta.registrada} registrada(s), {progreso.cuenta.rechazada} rechazada(s), {progreso.cuenta.incierta} incierta(s){progreso.cuenta.pendiente > 0 ? `, ${progreso.cuenta.pendiente} sin presentar` : ''}.
                {progreso.cuenta.incierta > 0 ? ' Las inciertas NO se vuelven a presentar desde acá: miralas en ARCA → Relaciones Laborales → Consultas.' : ''}
              </p>
            )}
            {!porTandas && fin && !seco && !indeterminado && fin.resultado !== 'fallo' && (
              <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                <FontAwesomeIcon icon={faCircleCheck} className="mr-1.5" />
                {modo === 'carga_masiva' ? 'Novedad enviada.' : 'Altas registradas.'} Los contratos quedaron marcados como presentados; el estado avanza cuando llegue la constancia.
              </p>
            )}
          </>
        )}
      </div>
      {verPresentado && progreso && (
        <Modal isOpen={verPresentado} onClose={() => setVerPresentado(false)} title={`Lo presentado en ARCA · ${estado?.empresaRazonSocial || ''}`} size="lg" zIndex={90}>
          <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
            <p className="text-xs text-gray-500 dark:text-gray-400">El registro de 85 posiciones de cada persona, tal cual se le mandó a ARCA, partido en sus campos. Los códigos se muestran como viajaron.</p>
            {[...progreso.tandas.flatMap((t) => t.personas)]
              .sort((a, b) => Number(b.estado === 'registrada') - Number(a.estado === 'registrada'))
              .map((f, _i, todas) => {
                const registro = estado?.personas?.find((p) => p.cuil === f.cuil)?.registro || '';
                const v = VISTA_ESTADO[f.estado];
                return (
                  <details key={f.cuil} open={todas.length <= 2} className="border border-gray-200 dark:border-gray-700 rounded-lg">
                    <summary className="px-3 py-2 cursor-pointer flex items-center gap-2">
                      <FontAwesomeIcon icon={v.icon} spin={v.spin} className={`h-3.5 w-3.5 shrink-0 ${v.clase}`} />
                      <span className="flex-1 font-semibold">{f.nombre}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {ETIQUETA_ESTADO[f.estado]}
                        {f.tanda ? ` · tanda ${f.tanda}` : ''}
                      </span>
                    </summary>
                    <div className="px-3 pb-3 space-y-2">
                      {f.motivo && <p className={`text-xs ${f.estado === 'rechazada' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>{f.motivo}</p>}
                      <pre className="font-mono text-[11px] p-2 rounded bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-x-auto whitespace-pre">{registro}</pre>
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {detalleDeLoPresentado(registro).map((c) => (
                            <tr key={c.posiciones}>
                              <td className="py-1 pr-2 text-gray-400 w-14">{c.posiciones}</td>
                              <td className="py-1 pr-2 text-gray-600 dark:text-gray-400">{c.nombre}</td>
                              <td className="py-1 pr-2 font-mono text-gray-900 dark:text-gray-100 whitespace-pre">{c.valor}</td>
                              <td className="py-1 text-gray-500 dark:text-gray-400">{c.legible || ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                );
              })}
          </div>
        </Modal>
      )}
    </Modal>
  );
};
