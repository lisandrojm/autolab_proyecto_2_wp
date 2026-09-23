import React, { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPercent, faCalculator } from '@fortawesome/free-solid-svg-icons';

import { EscalaDelConvenio, escalasConvenioAPI } from '../../../api/escalasConvenio';
import { AplicarParitariaModal } from './AplicarParitariaModal';
import { LiquidacionReferenciaModal } from './LiquidacionReferenciaModal';

/**
 * Los dos botones que la pestaña de escala suma a la barra de acciones: «Paritaria %» y «Liquidación».
 *
 * Es un componente aparte —y no dos botones más dentro de `CategoriasArcaTab`, que ya tiene 1.500 líneas— porque
 * carga sus propios datos y maneja sus propios modales. Así la pantalla de siempre suma una línea y nada más.
 *
 * «Paritaria %» convive con el botón «Paritaria» de Excel que ya existía, no lo reemplaza: para un acta que publica
 * importes absolutos, subir la planilla sigue siendo el camino más corto. Este otro es para las actas que publican
 * un porcentaje, que son la mayoría.
 */

interface Props {
  convenio: string;
  canManage: boolean;
  /** Se llama después de aplicar una paritaria, para que la tabla de grupos vuelva a leer los importes. */
  onAplicado: () => void;
}

export const AccionesEscalaConvenio: React.FC<Props> = ({ convenio, canManage, onAplicado }) => {
  const hoy = new Date().toISOString().slice(0, 10);
  const [datos, setDatos] = useState<EscalaDelConvenio | null>(null);
  const [verParitaria, setVerParitaria] = useState(false);
  const [verLiquidacion, setVerLiquidacion] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setDatos(await escalasConvenioAPI.delConvenio(convenio, hoy));
    } catch {
      // Silencio a propósito: son dos botones auxiliares. Si el convenio no tiene nada versionado todavía, la
      // pantalla principal tiene que seguir funcionando igual.
      setDatos(null);
    }
  }, [convenio, hoy]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const grupos = (datos?.filas || []).map((f) => f.grupo).filter((g) => Number.isFinite(g));

  return (
    <>
      {canManage && (
        <button
          type="button"
          onClick={() => setVerParitaria(true)}
          className="px-3 py-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex items-center gap-2 text-sm font-semibold active:scale-95"
          title="Aplicar un aumento por porcentaje, con previsualización editable"
        >
          <FontAwesomeIcon icon={faPercent} className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span className="hidden md:block">Paritaria %</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => setVerLiquidacion(true)}
        disabled={grupos.length === 0}
        className="px-3 py-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex items-center gap-2 text-sm font-semibold active:scale-95 disabled:opacity-40"
        title="Cuánto cobraría un grupo con los adicionales del convenio"
      >
        <FontAwesomeIcon icon={faCalculator} className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span className="hidden md:block">Liquidación</span>
      </button>

      <AplicarParitariaModal
        isOpen={verParitaria}
        onClose={() => setVerParitaria(false)}
        convenio={convenio}
        fecha={hoy}
        acuerdos={datos?.acuerdos || []}
        onAplicado={() => {
          void cargar();
          onAplicado();
        }}
      />

      <LiquidacionReferenciaModal isOpen={verLiquidacion} onClose={() => setVerLiquidacion(false)} convenio={convenio} fecha={hoy} grupos={grupos as number[]} adicionales={datos?.adicionales || []} />
    </>
  );
};
