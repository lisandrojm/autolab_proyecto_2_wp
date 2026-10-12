import React, { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo, faRobot } from '@fortawesome/free-solid-svg-icons';
import { projectsAPI, type EstadoValidacionAutomaticaOS as Estado } from '../../api/projects';
import { InfoModal } from '../ui/InfoModal';

/**
 * LA LÍNEA DE ESTADO DE LA VALIDACIÓN AUTOMÁTICA DE OBRAS SOCIALES, junto al botón manual de Contratos.
 *
 * La obra social se valida sola al crear el contrato (cola de 20 s) y un barrido cada 10 minutos toma
 * lo que quedó sin validar. Hasta ahora eso pasaba sin que nadie lo viera: el botón manual parecía el
 * único camino. Acá se dice si está prendida, qué hay en cola y cómo fue la última corrida automática.
 */
const hace = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
};

export const EstadoValidacionAutomaticaOS: React.FC = () => {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [info, setInfo] = useState(false);
  const cargar = useCallback(() => {
    projectsAPI
      .estadoValidacionAutomaticaOS()
      .then(setEstado)
      .catch(() => setEstado(null));
  }, []);
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  if (!estado) return null;
  const u = estado.ultimaCorrida;
  const texto = !estado.conCredenciales
    ? 'sin credenciales de ARCA'
    : estado.apagadaPorEntorno
      ? 'apagada en este servidor'
      : !estado.activa
        ? 'apagada'
        : estado.corriendo
          ? 'validando ahora'
          : [
              'activa',
              estado.enCola > 0 ? `${estado.enCola} en cola` : '',
              estado.esperandoReintento > 0 ? `${estado.esperandoReintento} esperando reintento` : '',
              u ? `última ${hace(u.fecha)} (${u.validadas}/${u.total} con obra social${u.errores > 0 ? `, ${u.errores} con error` : ''}${u.faltaron > 0 ? `, ${u.faltaron} sin leer` : ''})` : 'todavía sin corridas',
            ]
              .filter(Boolean)
              .join(' · ');
  const color = !estado.conCredenciales || estado.apagadaPorEntorno || !estado.activa ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400';
  return (
    <div className={`flex items-center gap-1.5 text-xs ${color}`}>
      <FontAwesomeIcon icon={faRobot} className="h-3 w-3" />
      <span>Validación automática: {texto}</span>
      <button type="button" onClick={() => setInfo(true)} title="Cómo funciona la validación automática" aria-label="Cómo funciona la validación automática" className="text-blue-500 hover:text-blue-600">
        <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
      </button>
      <InfoModal isOpen={info} onClose={() => setInfo(false)} title="Validación automática de obras sociales" size="sm" zIndex={90}>
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          <p>Cuando se crea un contrato —al aprobar una Solicitud o con «Agregar miembro»— la obra social de la persona se valida sola contra ARCA a los pocos segundos, de a tandas: los contratos que se crean seguidos salen en una misma corrida.</p>
          <p>Cada 10 minutos un barrido toma lo que quedó sin validar en los últimos 30 días (una falla, un reinicio del servidor, ARCA ocupada) y lo vuelve a intentar. A quien ARCA rechazó se lo reintenta pasada una hora.</p>
          <p>Nada de esto frena ni demora el alta del contrato: si ARCA está caída o faltan credenciales, el contrato se crea igual y la persona queda pendiente.</p>
          <p>Los botones «Validar ARCA» y «Validar Masivo Obras Sociales» siguen como reintento manual. Si ya hay una corrida automática en curso, el modal la sigue en vez de abrir otra.</p>
          <p>Se prende y apaga en Configuración → ARCA → Conexión → Obras sociales y nombres.</p>
          {u?.motivo && <p className="text-xs text-amber-700 dark:text-amber-400">Última corrida: {u.motivo}</p>}
        </div>
      </InfoModal>
    </div>
  );
};
