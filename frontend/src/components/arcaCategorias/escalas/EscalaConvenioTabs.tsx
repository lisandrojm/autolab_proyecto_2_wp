import React, { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

import { EscalaDelConvenio, escalasConvenioAPI } from '../../../api/escalasConvenio';
import { LoadingSpinner } from '../../ui/LoadingSpinner';
import { formatearFechaCalendario } from '../../../utils/fechas';
import { SelectorFecha } from './piezas';
import { SubPestanaEscala } from './SubPestanasEscala';
import { AdicionalesConvenioTab } from './AdicionalesConvenioTab';
import { PequenasEmpresasTab } from './PequenasEmpresasTab';
import { AcuerdosParitariosTab } from './AcuerdosParitariosTab';
import { FichaConvenioTab } from './FichaConvenioTab';

/**
 * El contenedor de las sub-pestañas que NO son la escala por grupo.
 *
 * Trae todo el convenio a una fecha en UNA llamada y lo reparte. La fecha vive acá y no en cada pestaña a
 * propósito: las cuatro miran el mismo acuerdo, y tener un selector por pestaña garantizaría que en algún momento
 * muestren dos fechas distintas a la vez.
 *
 * La pestaña «Escala por grupo» no está acá: sigue siendo la tabla de siempre, en `CategoriasArcaTab`, porque es la
 * que tiene las categorías colgando y el ABM que ya funciona. Mover eso habría sido reescribir lo que anda.
 */

interface Props {
  convenio: string;
  tab: Exclude<SubPestanaEscala, 'escala'>;
  canManage: boolean;
}

export const EscalaConvenioTabs: React.FC<Props> = ({ convenio, tab, canManage }) => {
  const hoy = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoy);
  const [datos, setDatos] = useState<EscalaDelConvenio | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setDatos(await escalasConvenioAPI.delConvenio(convenio, fecha));
    } catch (e: any) {
      setError(e?.response?.data?.error || 'No se pudo cargar el convenio.');
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [convenio, fecha]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SelectorFecha valor={fecha} onCambiar={setFecha} />
        {fecha !== hoy && (
          <span className="text-xs text-amber-700 dark:text-amber-400 font-semibold">Estás viendo cómo estaba al {formatearFechaCalendario(fecha)}, no lo vigente.</span>
        )}
      </div>

      {cargando ? (
        <div className="flex justify-center items-center py-16">
          <LoadingSpinner message="Cargando el acuerdo..." />
        </div>
      ) : error ? (
        <div className="rounded border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />
          {error}
        </div>
      ) : !datos ? null : tab === 'adicionales' ? (
        <AdicionalesConvenioTab convenio={convenio} fecha={fecha} adicionales={datos.adicionales} canManage={canManage} onRecargar={() => void cargar()} />
      ) : tab === 'pequenas' ? (
        <PequenasEmpresasTab convenio={convenio} fecha={fecha} filas={datos.pequenasEmpresas} canManage={canManage} onRecargar={() => void cargar()} />
      ) : tab === 'acuerdos' ? (
        <AcuerdosParitariosTab convenio={convenio} acuerdos={datos.acuerdos} canManage={canManage} onRecargar={() => void cargar()} />
      ) : (
        <FichaConvenioTab convenio={convenio} acuerdos={datos.acuerdos} canManage={canManage} onRecargar={() => void cargar()} />
      )}
    </div>
  );
};
