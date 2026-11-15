import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheckCircle, faClock, faHourglassHalf, faMinus } from '@fortawesome/free-solid-svg-icons';
import { aprobadoresDe, estadoDeNivel, type Nivel, type VacacionConCadena } from '@compartido/vacaciones/etapaDeAprobacion';

/**
 * LAS COLUMNAS «SUPERVISOR» Y «COORDINADOR» DE LA BANDEJA DE VACACIONES (15/11/2026, pedido del usuario).
 *
 * Dicen en qué va cada nivel de la jerarquía: aprobó (con quién y cuándo), le toca, espera al supervisor,
 * o el proyecto no tiene a nadie en ese nivel —ahí se avisa, porque la solicitud se lo salteó—. Las
 * anteriores a la jerarquía no tienen cadena y muestran una raya.
 */
interface Props {
  vacation: VacacionConCadena & { nombresAprobadores?: Record<string, string> };
  nivel: Nivel;
}

const fecha = (d: string | Date) => new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

export const NivelDeAprobacion: React.FC<Props> = ({ vacation, nivel }) => {
  const nombres = vacation.nombresAprobadores || {};
  const quien = (ids: string[]) => ids.map((id) => nombres[id] || '').filter(Boolean).join(', ');
  if (!vacation.cadena) {
    return (
      <span className="text-gray-400 dark:text-gray-500 text-sm" title="Anterior a la aprobación por jerarquía">
        <FontAwesomeIcon icon={faMinus} />
      </span>
    );
  }
  const estado = estadoDeNivel(vacation, nivel);
  const aprobadores = aprobadoresDe(vacation.cadena, nivel);
  if (estado === 'aprobado') {
    const a: any = vacation.aprobaciones?.[nivel];
    return (
      <div className="flex flex-col text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-green-600 dark:text-green-400">
          <FontAwesomeIcon icon={faCheckCircle} />
          Aprobó
        </span>
        <span className="text-gray-600 dark:text-gray-400 whitespace-nowrap">
          {nombres[String(a?.userId)] || ''} {a?.at ? `· ${fecha(a.at)}` : ''}
        </span>
      </div>
    );
  }
  if (estado === 'pendiente' || estado === 'esperando') {
    return (
      <div className="flex flex-col text-xs" title={estado === 'esperando' ? 'Le toca cuando apruebe el supervisor' : 'Le toca aprobar'}>
        <span className={`inline-flex items-center gap-1 font-semibold ${estado === 'pendiente' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>
          <FontAwesomeIcon icon={estado === 'pendiente' ? faHourglassHalf : faClock} />
          {estado === 'pendiente' ? 'Pendiente' : 'Espera al supervisor'}
        </span>
        <span className="text-gray-600 dark:text-gray-400">{quien(aprobadores)}</span>
      </div>
    );
  }
  if (estado === 'sin_nadie') {
    return <span className="text-xs italic text-gray-500 dark:text-gray-400">Sin {nivel} en el proyecto</span>;
  }
  // no_intervino: la solicitud siguió sin pasar por este nivel (rechazada antes, o vino del plan).
  return (
    <span className="text-gray-400 dark:text-gray-500 text-sm" title="No intervino">
      <FontAwesomeIcon icon={faMinus} />
    </span>
  );
};
