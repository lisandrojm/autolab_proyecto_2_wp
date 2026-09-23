import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalculator, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

import { AdicionalConValor, escalasConvenioAPI, LiquidacionDeReferencia } from '../../../api/escalasConvenio';
import { Modal } from '../../ui/Modal';
import { sweetAlert } from '../../../utils/sweetAlert';
import { formatearFechaCalendario } from '../../../utils/fechas';
import { pesos, TEXTO_TIPO_CALCULO, textoRemunerativo } from './piezas';

/**
 * LIQUIDACIÓN DE REFERENCIA: cuánto cobraría este grupo a esta fecha, y de dónde sale cada peso.
 *
 * No es un recibo. Es la cuenta del convenio —escala más los adicionales que se devenguen— y sirve para tres cosas
 * concretas: cotizar un proyecto, poder explicar el número que se le ofrece a alguien, y notar que una escala
 * quedó vieja porque el total no da.
 *
 * LAS ADVERTENCIAS SON PARTE DEL RESULTADO, NO UN ADORNO. El factor del neto (0,81) no figura en ninguna acta y el
 * carácter remunerativo de los adicionales tampoco: la cuenta se entrega igual, porque negarse no ayuda a nadie,
 * pero nunca sin decir qué parte está apoyada en un supuesto.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  convenio: string;
  fecha: string;
  grupos: number[];
  adicionales: AdicionalConValor[];
}

export const LiquidacionReferenciaModal: React.FC<Props> = ({ isOpen, onClose, convenio, fecha, grupos, adicionales }) => {
  const [grupo, setGrupo] = useState<number | ''>(grupos[0] ?? '');
  const [anios, setAnios] = useState('0');
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<LiquidacionDeReferencia | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setGrupo(grupos[0] ?? '');
      setResultado(null);
    }
  }, [isOpen, grupos]);

  /** Los que se devengan por cantidad: los que tiene sentido preguntar «¿cuántas?». */
  const porEvento = useMemo(() => adicionales.filter((a) => a.tipoCalculo === 'por_evento'), [adicionales]);
  const mensuales = useMemo(() => adicionales.filter((a) => a.tipoCalculo === 'mensual' || a.tipoCalculo === 'monto_fijo' || a.tipoCalculo === 'a_confirmar'), [adicionales]);
  const porAntiguedad = useMemo(() => adicionales.filter((a) => a.tipoCalculo === 'por_anio_antiguedad'), [adicionales]);

  const calcular = async () => {
    if (grupo === '') return void sweetAlert.error('Elegí un grupo.');
    setCargando(true);
    try {
      const numeros: Record<string, number> = {};
      for (const [codigo, valor] of Object.entries(cantidades)) {
        const n = Number(valor);
        if (Number.isFinite(n) && n > 0) numeros[codigo] = n;
      }
      setResultado(await escalasConvenioAPI.liquidacion({ convenio, grupo: Number(grupo), fecha, aniosAntiguedad: Number(anios || 0), cantidades: numeros }));
    } catch (e: any) {
      sweetAlert.error(e?.response?.data?.error || 'No se pudo calcular.');
    } finally {
      setCargando(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
        Cerrar
      </button>
      <button type="button" onClick={() => void calcular()} disabled={cargando} className="btn-primary disabled:opacity-40">
        {cargando ? 'Calculando…' : 'Calcular'}
      </button>
    </div>
  );

  const fila = (etiqueta: string, valor: number, clase = '') => (
    <div className={`flex items-center justify-between py-1.5 ${clase}`}>
      <span className="text-sm text-gray-600 dark:text-gray-300">{etiqueta}</span>
      <span className="text-sm font-mono text-gray-900 dark:text-gray-100">{pesos(valor)}</span>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Liquidación de referencia" subtitle={`Convenio ${convenio} · escala vigente al ${formatearFechaCalendario(fecha)}`} size="lg" footer={footer}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Grupo</span>
            <select value={grupo} onChange={(e) => setGrupo(e.target.value === '' ? '' : Number(e.target.value))} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm">
              <option value="">Elegir…</option>
              {grupos.map((g) => (
                <option key={g} value={g}>
                  Grupo {g}
                </option>
              ))}
            </select>
          </label>
          {porAntiguedad.length > 0 && (
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Años de antigüedad</span>
              <input type="number" min={0} value={anios} onChange={(e) => setAnios(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-right font-mono" />
            </label>
          )}
        </div>

        {(porEvento.length > 0 || mensuales.length > 0) && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <p className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide mb-2">Adicionales que se devengan</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {porEvento.map((a) => (
                <label className="block" key={a._id}>
                  <span className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
                    {a.nombre} <span className="text-gray-400">({a.unidad || 'cantidad'})</span>
                  </span>
                  <input type="number" min={0} value={cantidades[a.codigo] || ''} onChange={(e) => setCantidades({ ...cantidades, [a.codigo]: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-right font-mono" placeholder="0" />
                </label>
              ))}
              {mensuales.map((a) => (
                <label className="flex items-center gap-2 cursor-pointer self-end pb-1.5" key={a._id}>
                  <input type="checkbox" checked={Number(cantidades[a.codigo] || 0) > 0} onChange={(e) => setCantidades({ ...cantidades, [a.codigo]: e.target.checked ? '1' : '0' })} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-300">{a.nombre}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {resultado && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-3">
            <div className="bg-gray-50 dark:bg-gray-900/40 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <FontAwesomeIcon icon={faCalculator} className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Grupo {resultado.grupo} · escala {resultado.escalaDe.desde ? `del ${formatearFechaCalendario(resultado.escalaDe.desde)}` : 'vigente del grupo'}
                </span>
              </div>

              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {fila('Básico', resultado.basico)}
                {fila('Adicional del convenio', resultado.adicional)}
                {fila('Presentismo', resultado.presentismo)}
                {resultado.lineas.map((l) => (
                  <div className="flex items-center justify-between py-1.5" key={l.codigo}>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {l.nombre}
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {' '}
                        · {TEXTO_TIPO_CALCULO[l.tipoCalculo] || l.tipoCalculo} × {l.cantidad} a {pesos(l.unitario)} · remunerativo: {textoRemunerativo(l.remunerativo)}
                      </span>
                    </span>
                    <span className="text-sm font-mono text-gray-900 dark:text-gray-100">{pesos(l.monto)}</span>
                  </div>
                ))}
                {fila('Bruto remunerativo', resultado.brutoRemunerativo, 'font-semibold')}
                {resultado.brutoNoRemunerativo > 0 && fila('No remunerativo', resultado.brutoNoRemunerativo)}
                {resultado.sinClasificar > 0 && fila('Sin clasificar (se paga, no tributa en el cálculo)', resultado.sinClasificar)}
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Bruto total</span>
                  <span className="text-base font-mono font-bold text-gray-900 dark:text-gray-100">{pesos(resultado.bruto)}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Neto estimado <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(factor {resultado.netoFactor})</span>
                  </span>
                  <span className="text-base font-mono font-bold text-green-700 dark:text-green-400">{pesos(resultado.netoSugerido)}</span>
                </div>
              </div>
            </div>

            {resultado.advertencias.length > 0 && (
              <div className="rounded border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 mb-1">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5" />
                  Supuestos de esta cuenta
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  {resultado.advertencias.map((a, i) => (
                    <li key={i} className="text-xs text-amber-800 dark:text-amber-300">
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
