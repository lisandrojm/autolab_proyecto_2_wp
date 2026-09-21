import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faFileExcel, faTriangleExclamation, faCircleInfo, faPlay, faDownload } from '@fortawesome/free-solid-svg-icons';
import { Modal } from '../ui/Modal';
import { liquidacionAPI, Corrida, Regimen } from '../../api/liquidacion';
import { sweetAlert } from '../../utils/sweetAlert';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SACAR LOS ARCHIVOS DEL MES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dos archivos y un anexo:
 *
 *   · NOVEDADES — un renglón por día y por persona, con todo lo que se cargó. Es el que se mira
 *     cuando hay que revisar de dónde salió un número, y el que se cruza contra el reloj.
 *   · IMPORT DE MEMOSOFT — el que se le da de comer al sistema de sueldos. Seis columnas, una hoja
 *     por empresa y centro de costo.
 *   · ANEXO — lo que la corrida no pudo resolver sola.
 *
 * LA PLANILLA SE PUEDE BAJAR SIEMPRE; EL IMPORT NO. Si hay excepciones bloqueantes —gente sin
 * legajo, sin empresa— el import se niega, porque un archivo así se importa igual y liquida mal:
 * es peor que no tenerlo, porque parece que está bien. Se puede forzar para mirarlo, avisando.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** Los últimos doce meses, del más nuevo al más viejo. Nadie liquida más atrás que eso. */
const periodos = () => {
  const hoy = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const enLetras = (p: string) => {
  const [a, m] = p.split('-').map(Number);
  return `${MESES[m - 1]} ${a}`;
};

const selectClass =
  'text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500';

export const LiquidacionModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const opciones = useMemo(periodos, []);
  const [periodo, setPeriodo] = useState(opciones[1] || opciones[0]);
  const [regimen, setRegimen] = useState<'' | Regimen>('');

  const [corrida, setCorrida] = useState<Corrida | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [bajando, setBajando] = useState<string | null>(null);

  /* Al cambiar de período lo anterior deja de valer: mostrarlo sería mentir sobre qué se calculó. */
  useEffect(() => setCorrida(null), [periodo, regimen]);

  const filtros = () => (regimen ? { regimen } : {});

  const calcular = async () => {
    setCalculando(true);
    try {
      setCorrida(await liquidacionAPI.previsualizarCorrida(periodo, filtros()));
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo calcular el período.');
    } finally {
      setCalculando(false);
    }
  };

  const bajar = async (cual: 'planilla' | 'import' | 'anexo') => {
    setBajando(cual);
    try {
      if (cual === 'planilla') {
        await liquidacionAPI.descargarPlanilla(periodo, filtros());
        return;
      }

      /*
        El import y el anexo salen de una corrida GUARDADA, no de la previsualización: el archivo
        que se entrega tiene que quedar registrado con su fecha, sus filtros y su hash.
      */
      const guardada = await liquidacionAPI.correrYGuardar(periodo, filtros());
      setCorrida(guardada);

      if (cual === 'anexo') {
        await liquidacionAPI.descargarAnexo(guardada._id!);
        return;
      }
      await liquidacionAPI.descargarImport(guardada._id!);
    } catch (error: any) {
      const datos = error?.response?.data;
      if (datos?.porMotivo) {
        const detalle = datos.porMotivo.map((x: any) => `${x.cantidad} × ${x.motivo}`).join('\n');
        const seguir = await sweetAlert.confirm(
          'El import tiene excepciones bloqueantes',
          `${datos.error}\n\n${detalle}\n\n¿Descargarlo igual? Ese archivo liquida mal: sirve para mirarlo, no para importarlo.`,
        );
        if (seguir?.isConfirmed && corrida?._id) await liquidacionAPI.descargarImport(corrida._id, true);
        return;
      }
      sweetAlert.error('Error', datos?.error || 'No se pudo generar el archivo.');
    } finally {
      setBajando(null);
    }
  };

  const bloqueantes = corrida?.resumen?.bloqueantes ?? 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Liquidación del período" size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-gray-600 dark:text-gray-300">
            <span className="block mb-1">Período</span>
            <select className={selectClass} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              {opciones.map((p) => (
                <option key={p} value={p}>{enLetras(p)}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-gray-600 dark:text-gray-300">
            <span className="block mb-1">Régimen</span>
            <select className={selectClass} value={regimen} onChange={(e) => setRegimen(e.target.value as '' | Regimen)}>
              <option value="">Todos</option>
              <option value="mensual">Mensualizados</option>
              <option value="jornalero">Jornaleros</option>
            </select>
          </label>

          <button
            onClick={calcular}
            disabled={calculando}
            className="text-sm px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-800 text-white disabled:opacity-50 transition-colors"
          >
            <FontAwesomeIcon icon={calculando ? faSpinner : faPlay} spin={calculando} className="mr-1.5" />
            Ver qué va a salir
          </button>
        </div>

        {/* El resumen antes de bajar nada: cuántas filas, cuántas hojas, cuánto queda sin resolver. */}
        {corrida && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/40 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                ['Partes', corrida.resumen.partes],
                ['Filas del import', corrida.resumen.lineas],
                ['Personas', corrida.resumen.personas],
                ['Hojas', corrida.resumen.hojas],
              ].map(([t, v]) => (
                <div key={String(t)}>
                  <div className="text-xl font-bold text-gray-800 dark:text-gray-100">{String(v)}</div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{String(t)}</div>
                </div>
              ))}
            </div>

            {bloqueantes > 0 ? (
              <p className="mt-3 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5" />
                <span>
                  <strong>{bloqueantes}</strong> excepción(es) impiden generar el import — de {corrida.resumen.excepciones} en total.
                  Están todas en el anexo, con nombre y motivo.
                </span>
              </p>
            ) : (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Sin excepciones bloqueantes{corrida.resumen.excepciones > 0 ? `, y ${corrida.resumen.excepciones} avisos en el anexo` : ''}.
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          {[
            { id: 'planilla' as const, titulo: 'Novedades del período', ayuda: 'Un renglón por día y por persona, con horarios, motivos, horas extra y qué conceptos generó cada uno.' },
            { id: 'import' as const, titulo: 'Import de Memosoft', ayuda: 'Las seis columnas exactas, una hoja por empresa y centro de costo. No se baja si hay excepciones bloqueantes.' },
            { id: 'anexo' as const, titulo: 'Anexo de excepciones', ayuda: 'Lo que no se pudo resolver solo, con la persona y el motivo de cada caso.' },
          ].map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{a.titulo}</div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{a.ayuda}</p>
              </div>
              <button
                onClick={() => bajar(a.id)}
                disabled={bajando !== null}
                className="shrink-0 text-xs px-3 py-2 rounded bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 transition-colors"
              >
                <FontAwesomeIcon icon={bajando === a.id ? faSpinner : a.id === 'planilla' ? faFileExcel : faDownload} spin={bajando === a.id} className="mr-1.5" />
                Descargar
              </button>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-2">
          <FontAwesomeIcon icon={faCircleInfo} className="mt-0.5 text-blue-500" />
          <span>
            Bajar el import o el anexo deja registrada una corrida con su fecha y sus filtros. Volver a liquidar el mismo mes no
            pisa la anterior: crea una nueva, así siempre se puede ver qué se entregó.
          </span>
        </p>
      </div>
    </Modal>
  );
};
