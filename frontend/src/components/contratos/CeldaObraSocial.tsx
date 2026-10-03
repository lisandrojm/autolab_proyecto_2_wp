import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faCircleCheck, faStethoscope, faXmark, faCircleInfo, faTrash, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { projectsAPI } from '../../api/projects';
import { sweetAlert } from '../../utils/sweetAlert';

/**
 * LA CELDA «OBRA SOCIAL», UNA SOLA PARA CONTRATOS Y SOLICITUDES.
 *
 * Era una celda en cada pantalla, y las dos decían cosas distintas sobre el mismo contrato: Contratos
 * mostraba «✓ 120900» (la obra social del convenio que rige cuando ARCA no devuelve una propia) y
 * Solicitudes mostraba «✓ Convenio», sin el código. Mismo dato en la base, dos lecturas, y la de
 * Solicitudes sin la información que importa —qué RNOS va al TXT—.
 *
 * Acá vive el DIBUJO. Quien la usa le pasa la vista ya resuelta: Contratos la saca del checklist de
 * ARCA (`afipCompleteness`), que tiene todos los catálogos cargados; Solicitudes la recibe resuelta
 * del server, que corre la misma cascada. Lo que no puede pasar es que las dos resuelvan distinto, y
 * por eso la decisión de qué código mostrar y con qué ícono está en un solo lugar.
 *
 *  - sin validar y se puede → el botón «Validar obra social»;
 *  - sin validar y no se puede → «Sin validar ⓘ», con el motivo;
 *  - validada → el código, con candado (la devolvió ARCA) o tilde (no figura: rige la del convenio),
 *    en AZUL si ARCA devolvió una DISTINTA de la del convenio —es la única fila que hay que mirar—,
 *    y el tacho para dejarla sin validar;
 *  - no registrada → el código en rojo con cruz: la empleadora no la tiene declarada ante ARCA.
 */
export type EstadoObraSocial = 'sin_validar' | 'validada_default' | 'validada_arca' | 'no_registrada';

/** Lo que la celda necesita saber, ya resuelto por quien la dibuja. */
export interface VistaObraSocial {
  estado: EstadoObraSocial;
  /** El RNOS que lleva el contrato. Validada «por defecto», es el del convenio. */
  codigo: string;
  nombre: string;
  /** Cuándo se validó, ya formateada. */
  fecha: string;
  /** «convenio 0634/11», o «convenio» si no se sabe el código. */
  delConvenio: string;
  /** Lo que va a quedar si ARCA no devuelve ninguna. */
  rnosSugerido: string;
  nombreSugerida: string;
  /** Validada por ARCA con una obra social DISTINTA de la del convenio. */
  distintaDelConvenio: boolean;
  /** Se puede validar ya: tiene empleadora y categoría, y la persona tiene CUIL. */
  puedeValidar: boolean;
  /** Por qué no se puede validar todavía. */
  motivoNoPuede: string;
  nombrePersona: string;
  /** El contrato, para quitar: `ref` es el `_id` del subdocumento o su posición. */
  quitar: { projectId: string; userId: string; ref: string | number };
}

export const CeldaObraSocial: React.FC<{
  vista: VistaObraSocial;
  /** Abre el detalle del contrato (Contratos). Sin él, el código es texto y no un link. */
  onAbrir?: () => void;
  onValidar: () => void;
  /** Qué pasa al tocar «Sin validar ⓘ». Sin él, se muestra el motivo en un aviso. */
  onSinEmpresa?: () => void;
  onQuitado: () => void;
}> = ({ vista: v, onAbrir, onValidar, onSinEmpresa, onQuitado }) => {
  const [quitando, setQuitando] = useState(false);

  /**
   * Quitar la obra social. Va con `forzar` porque lo sellado en ARCA es inmutable para el server (sin
   * eso contesta 409). No se pierde nada: el valor lo devuelve el organismo, no se carga a mano.
   */
  const quitar = async () => {
    const r = await sweetAlert.confirm(
      '¿Quitar la obra social?',
      `${v.nombrePersona}: el contrato vuelve a quedar SIN VALIDAR y no entra en el TXT hasta validarlo de nuevo en ARCA. No se pierde nada: el valor lo devuelve el organismo, no se carga a mano.`,
      'Sí, quitar',
    );
    if (!r.isConfirmed) return;
    setQuitando(true);
    try {
      await projectsAPI.updateObraSocialContrato(v.quitar.projectId, v.quitar.userId, v.quitar.ref as never, { obraSocialId: null, origen: 'manual', forzar: true });
      onQuitado();
    } catch (e: any) {
      sweetAlert.error('No se pudo', e?.response?.data?.error || 'No se pudo quitar la obra social.');
    } finally {
      setQuitando(false);
    }
  };

  const sugerida = v.rnosSugerido ? ` Si el organismo no devuelve ninguna, va a quedar la del ${v.delConvenio}: ${v.rnosSugerido} · ${v.nombreSugerida}.` : '';

  /* Sin validar no lleva ícono: el estado ya está escrito. Los validados sí: ahí el ícono ES el estado
     (candado, tilde, cruz) y lo escrito es el código. */
  const { icono, clase, titulo } = {
    sin_validar: {
      icono: null,
      clase: 'text-gray-400 dark:text-gray-500',
      titulo: `Sin validar en ARCA — este contrato todavía no tiene obra social y su TXT no se puede generar.${sugerida}`,
    },
    validada_default: {
      icono: faCircleCheck,
      clase: 'text-green-700 dark:text-green-400',
      titulo: `${v.nombre} — por defecto (${v.delConvenio}) · validada en ARCA${v.fecha ? ` el ${v.fecha}` : ''}: el organismo no tiene afiliación propia para esta persona, así que rige la del convenio.`,
    },
    validada_arca: {
      icono: faLock,
      clase: 'text-green-700 dark:text-green-400',
      titulo: `${v.nombre} — la devolvió ARCA${v.fecha ? ` el ${v.fecha}` : ''} · queda fija, no editable.`,
    },
    no_registrada: {
      icono: faXmark,
      clase: 'text-red-600 dark:text-red-400',
      titulo: `${v.nombre} — no está entre las obras sociales que la empleadora tiene registradas ante ARCA: el organismo va a rechazar el alta.`,
    },
  }[v.estado];

  /*
    AZUL = esta persona NO lleva la obra social del convenio. Es la única fila que hay que mirar de
    verdad: las demás confirman lo que ya se sabía; éstas son las que ARCA cambió. En verde y con el
    candado se distinguía sólo por el glifo, que a la velocidad a la que se barre una grilla es lo
    mismo que no distinguirse. El color se ve sin leer.
  */
  const claseFinal = v.distintaDelConvenio ? 'text-blue-600 dark:text-blue-400' : clase;
  const tituloFinal = v.distintaDelConvenio ? `${titulo} DISTINTA de la del ${v.delConvenio}${v.rnosSugerido ? ` (${v.rnosSugerido}${v.nombreSugerida ? ` · ${v.nombreSugerida}` : ''})` : ' — el convenio no aporta ninguna'}: esta es la que va al TXT.` : titulo;

  if (v.estado === 'sin_validar' && v.puedeValidar) {
    /* Mismo botón que «Validar obras sociales» de la barra —mismo ícono, mismo estilo—, en tamaño de
       fila: es la MISMA acción sobre un solo contrato. */
    return (
      <button
        type="button"
        onClick={onValidar}
        title={`Validar la obra social de este contrato contra ARCA.${sugerida}`}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
      >
        <FontAwesomeIcon icon={faStethoscope} className="h-3 w-3" />
        Validar obra social
      </button>
    );
  }

  if (v.estado === 'sin_validar') {
    /* El gemelo apagado del botón de arriba: misma caja y el MISMO ícono, para que se lean como el
       mismo control en dos estados. Se ve deshabilitado pero SÍ responde al clic: abre el motivo. Un
       `disabled` de verdad no recibe eventos y dejaría el porqué sin forma de leerse en touch. */
    return (
      <button
        type="button"
        onClick={onSinEmpresa ?? (() => sweetAlert.warningAlert('Todavía no se puede validar', v.motivoNoPuede))}
        aria-disabled
        title={v.motivoNoPuede}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 opacity-70 hover:opacity-100 cursor-pointer transition-opacity whitespace-nowrap"
      >
        <FontAwesomeIcon icon={faStethoscope} className="h-3 w-3" />
        Sin validar
        <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
      </button>
    );
  }

  const contenido = (
    <>
      {icono && <FontAwesomeIcon icon={icono} className="h-3 w-3 shrink-0" />}
      {v.codigo || <span className="font-sans font-normal">sin validar</span>}
    </>
  );
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {onAbrir ? (
        <button type="button" onClick={onAbrir} title={tituloFinal} className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold hover:underline ${claseFinal}`}>
          {contenido}
        </button>
      ) : (
        <span title={tituloFinal} className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold ${claseFinal}`}>
          {contenido}
        </span>
      )}
      {/* Acá abajo sólo llegan los validados: quitar, en la fila donde se revisa. */}
      <button
        type="button"
        onClick={quitar}
        disabled={quitando}
        title="Quitar la obra social: el contrato vuelve a quedar sin validar"
        aria-label="Quitar la obra social"
        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
      >
        <FontAwesomeIcon icon={quitando ? faSpinner : faTrash} spin={quitando} className="h-3 w-3" />
      </button>
    </span>
  );
};
