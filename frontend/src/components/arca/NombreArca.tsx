import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faCircleInfo, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { Modal } from '../ui/Modal';
import { cuitEsValido } from '../../utils/cuit';

/**
 * EL MISMO INDICADOR EN TODAS LAS PANTALLAS.
 *
 * «¿El nombre de esta persona está validado contra ARCA?» se contesta en Usuarios, en Contratos ·
 * Constancia de CUIT y en Validar obras sociales. Estaban escritos tres veces, con tres formas
 * distintas de decir lo mismo: un tilde suelto acá, un texto allá, nada más allá. Tres dialectos para
 * un solo dato es lo que hace que no se entienda que es el MISMO dato.
 *
 * Acá vive el vocabulario, una vez:
 *
 *   validado     ✓ verde    — el nombre es literalmente el que ARCA tiene para ese CUIT.
 *   sin validar  ✓ apagado  — todavía no se confirmó. NO es un error: es lo que falta hacer.
 *   corregido    ✓ ámbar    — se acaba de reemplazar por el de ARCA (con el anterior tachado).
 *   difiere      ⚠ ámbar    — ARCA muestra otro y no se pudo confirmar: no se tocó nada.
 *   no aplica    (nada)     — sin CUIT válido no hay a quién preguntarle.
 *
 * EL ESTADO NEGATIVO SE DIBUJA, y esa es la decisión que más importa: con el tilde apareciendo solo
 * cuando está bien, la ausencia se confunde con «esta fila no corresponde» y no se puede contestar
 * «¿cuáles me faltan?» — que es justo la pregunta de la que sale una validación masiva.
 */
export type EstadoNombreArca = 'validado' | 'sin_validar' | 'corregido' | 'difiere' | 'no_aplica';

/**
 * El estado base de una persona, a partir de sus datos.
 *
 * Una sola función para que las tres pantallas coincidan en cuándo mostrar qué. `no_aplica` cuando no
 * hay un CUIT válido: el Padrón se consulta POR CUIT, así que ahí no hay nada que validar y marcarlo
 * como pendiente sería pedir que se resuelva algo que no se puede.
 */
export function estadoNombreArca(datos: { cuit?: string; sinCuit?: boolean; validadoAt?: string | null; validado?: boolean }): EstadoNombreArca {
  if (!datos.cuit || datos.sinCuit || !cuitEsValido(datos.cuit)) return 'no_aplica';
  return datos.validado || datos.validadoAt ? 'validado' : 'sin_validar';
}

const CFG: Record<Exclude<EstadoNombreArca, 'no_aplica'>, { icono: any; clase: string; texto: string; title: string }> = {
  validado: {
    icono: faCircleCheck,
    clase: 'text-green-600 dark:text-green-500',
    texto: 'Validado en ARCA',
    title: 'El nombre es el que ARCA tiene registrado para este CUIT',
  },
  sin_validar: {
    icono: faCircleCheck,
    clase: 'text-gray-300 dark:text-gray-600',
    texto: 'Sin validar',
    title: 'El nombre todavía no se confirmó contra el Padrón de ARCA',
  },
  corregido: {
    icono: faCircleCheck,
    clase: 'text-amber-600 dark:text-amber-500',
    texto: 'Corregido',
    title: 'El nombre se reemplazó por el que ARCA tiene registrado',
  },
  difiere: {
    icono: faTriangleExclamation,
    clase: 'text-amber-600 dark:text-amber-500',
    texto: 'Difiere',
    title: 'ARCA muestra otro nombre y no se pudo confirmar contra el Padrón: no se cambió nada',
  },
};

export const NombreArca: React.FC<{
  estado: EstadoNombreArca;
  /** El nombre anterior, cuando se corrigió: sin él, «corregido» avisa que algo cambió pero no deja revisar qué. */
  antes?: string;
  /** Cuándo se selló, para el tooltip. */
  fecha?: string | null;
  /** Agrega el rótulo. En tablas densas suele ir solo el ícono. */
  conTexto?: boolean;
  /** Agrega el ⓘ que abre la explicación completa. */
  conInfo?: boolean;
}> = ({ estado, antes, fecha, conTexto, conInfo }) => {
  const [abierto, setAbierto] = useState(false);
  if (estado === 'no_aplica') return null;
  const cfg = CFG[estado];
  const validado = estado === 'validado';

  return (
    <>
      <span className={`inline-flex items-center gap-1.5 ${conTexto ? 'text-[11.5px] font-semibold' : ''} ${conTexto ? cfg.clase : ''}`}>
        <FontAwesomeIcon icon={cfg.icono} title={validado && fecha ? `${cfg.title}. Confirmado el ${new Date(fecha).toLocaleDateString('es-AR')}.` : cfg.title} className={`h-3 w-3 shrink-0 ${cfg.clase}`} />
        {conTexto && cfg.texto}
        {conInfo && (
          // `stopPropagation` porque estos indicadores viven en filas clickeables: pedir la
          // explicación no puede además abrir la ficha de atrás.
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAbierto(true);
            }}
            title="Qué significa esto"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
          >
            <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
          </button>
        )}
      </span>
      {antes && <span className="text-[11px] text-gray-400 line-through">{antes}</span>}
      {abierto && (
        <Modal isOpen onClose={() => setAbierto(false)} title={validado ? 'Nombre validado con ARCA' : 'Nombre sin validar en ARCA'} size="sm" zIndex={80}>
          <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300" onClick={(e) => e.stopPropagation()}>
            {validado ? (
              <p>
                Este nombre <strong>es el que ARCA tiene registrado</strong> para el CUIT de la persona. Se trajo del Padrón al validar y se guarda tal cual lo devuelve el organismo — por eso está en
                mayúsculas y sin acomodar.
              </p>
            ) : (
              <p>
                El nombre de esta persona <strong>todavía no se confirmó</strong> contra el Padrón de ARCA.
              </p>
            )}
            <p>
              Cuando lo cargado no coincide, <strong>se reemplaza por el de ARCA</strong>: estos contratos terminan en un trámite ante el mismo organismo, y un nombre que no coincide con el padrón es
              el que hace que el alta se rechace.
            </p>
            <p className="text-[13px] text-gray-500 dark:text-gray-400">
              Se valida desde <strong>Usuarios → Validar nombres</strong>, con <strong>Validar CUIT</strong>, o al <strong>validar obras sociales</strong>. Una vez validado no se vuelve a consultar: el
              dato ya está confirmado y repetirlo sería preguntarle al organismo algo que ya contestó.
            </p>
            <p className="text-[13px] text-gray-500 dark:text-gray-400">El nombre es de la persona, así que el cambio se ve en todos sus contratos.</p>
          </div>
        </Modal>
      )}
    </>
  );
};
