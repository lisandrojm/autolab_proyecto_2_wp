import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPenToSquare, faRotateLeft, faSpinner, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { codigoPuesto } from '@compartido/puestosDesempenados';
import type { OrigenPuesto } from '@compartido/puestosDesempenados';
import { Modal } from '../ui/Modal';
import { SimpleCatalogItem } from '../../api/simpleCatalog';
import { listarPuestos, SelectorPuestoDesempenado } from '../arca/SelectorPuestoDesempenado';
import { projectsAPI } from '../../api/projects';

/*
  EL PUESTO DESEMPEÑADO DEL CONTRATO, SIEMPRE A LA VISTA Y SIEMPRE CARGADO.

  El registro de 85 (Altas Masivas, el URGENTE) lo exige en las posiciones 29-32, y sin él no se puede
  presentar el alta. Hasta acá no figuraba en ningún formulario: «Datos ARCA» lo listaba «en blanco»
  —porque describía el registro de 130, que no lo lleva— y en «Configurar Miembro» no existía. Uno se
  enteraba de que faltaba recién al apretar «Generar TXT Masivo URGENTE».

  Lo que se muestra es el que le TOCA por defecto al contrato (Rol Empresa → Categoría → convenio →
  empleadora → instalación) y de dónde sale. No se escribe en el contrato: se resuelve al leer, igual
  que la sucursal habitual. Cambiarlo acá SÍ escribe, y vale sólo para este contrato; «Volver al por
  defecto» lo borra y el contrato hereda otra vez.

  Es un solo componente para las dos pantallas: quien lo usa le pasa el valor elegido en el contrato y
  el default ya resuelto. `CampoPuestoConDefaultDelServer` es la variante para formularios que no
  tienen los catálogos a mano (Configurar Miembro): le pide el default al server, que usa la misma
  `resolverPuesto` que el generador del archivo.
*/

const DE_DONDE: Record<OrigenPuesto, string> = {
  contrato: 'elegido en este contrato',
  funcion: 'del Rol Empresa',
  categoria: 'de la categoría',
  convenio: 'por defecto del convenio',
  empresa: 'por defecto de la empleadora',
  global: 'por defecto de la instalación',
  ninguno: 'sin definir',
};

/** «Por defecto del convenio», «Por defecto, del Rol Empresa»: sin repetir «por defecto» cuando el origen ya lo dice. */
const notaDelDefault = (origen: OrigenPuesto): string => {
  const de = DE_DONDE[origen];
  return de.startsWith('por defecto') ? de.charAt(0).toUpperCase() + de.slice(1) : `Por defecto, ${de}`;
};

export interface PuestoPorDefecto {
  codigo: string;
  origen: OrigenPuesto;
}

export const CampoPuestoDesempenado: React.FC<{
  /** El puesto elegido en ESTE contrato. Vacío = hereda el default. */
  valor: string;
  /** El que le toca por defecto (sin mirar el contrato). */
  porDefecto: PuestoPorDefecto;
  /** `""` = volver al por defecto. */
  onCambiar: (codigo: string) => void | Promise<void>;
  guardando?: boolean;
  /** El default todavía se está resolviendo (variante que lo pide al server). */
  cargandoDefault?: boolean;
  claseEtiqueta?: string;
}> = ({ valor, porDefecto, onCambiar, guardando = false, cargandoDefault = false, claseEtiqueta = 'block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1' }) => {
  const [eligiendo, setEligiendo] = useState(false);
  const [puestos, setPuestos] = useState<SimpleCatalogItem[] | null>(null);
  useEffect(() => {
    void listarPuestos().then(setPuestos);
  }, []);

  const elegido = codigoPuesto(valor);
  const defecto = codigoPuesto(porDefecto.codigo);
  const efectivo = elegido || defecto;
  // Elegir a mano el mismo que el default no es una excepción: se muestra como heredado.
  const esExcepcion = !!elegido && elegido !== defecto;
  const nombre = (codigo: string) => puestos?.find((p) => p.externalId === codigo)?.name || '';

  return (
    <div className="space-y-1.5">
      <label className={claseEtiqueta}>Puesto desempeñado</label>
      <div className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 ${efectivo ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800' : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20'}`}>
        <div className="min-w-0">
          {cargandoDefault && !elegido ? (
            <span className="text-sm text-gray-400">
              <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5 h-3 w-3" />
              Resolviendo el que le toca…
            </span>
          ) : efectivo ? (
            <>
              {/* Como el resto del formulario: sólo el CÓDIGO va en blanco; el nombre y la nota, en gris. */}
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-mono font-semibold mr-2 text-gray-900 dark:text-gray-100">{efectivo}</span>
                {nombre(efectivo) || (puestos ? <span className="italic text-amber-600 dark:text-amber-400">no está en el catálogo</span> : '')}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-500">{esExcepcion ? `Elegido en este contrato${defecto ? ` · por defecto le toca ${defecto} (${DE_DONDE[porDefecto.origen]})` : ''}` : notaDelDefault(porDefecto.origen)}</p>
            </>
          ) : (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <FontAwesomeIcon icon={faTriangleExclamation} className="mr-1.5" />
              Sin puesto: ni el Rol Empresa, ni la categoría, ni su convenio, ni la empleadora tienen uno. Elegilo acá para este contrato, o cargalo en el convenio para todos.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {esExcepcion && (
            <button
              type="button"
              disabled={guardando}
              onClick={() => void onCambiar('')}
              title={defecto ? `Volver al que le toca por defecto: ${defecto} ${nombre(defecto)}` : 'Quitar el puesto elegido en este contrato'}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faRotateLeft} className="h-3 w-3" />
              Volver al por defecto
            </button>
          )}
          {/* Sólo el ícono, en azul: el mismo botón de editar que el de los códigos del tipo de contrato. */}
          <button
            type="button"
            disabled={guardando}
            onClick={() => setEligiendo(true)}
            title={efectivo ? 'Cambiar el puesto desempeñado de este contrato' : 'Elegir el puesto desempeñado de este contrato'}
            aria-label={efectivo ? 'Cambiar el puesto desempeñado de este contrato' : 'Elegir el puesto desempeñado de este contrato'}
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-50"
          >
            <FontAwesomeIcon icon={guardando ? faSpinner : faPenToSquare} spin={guardando} className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <Modal isOpen={eligiendo} onClose={() => setEligiendo(false)} title="Puesto desempeñado" subtitle="Sólo para este contrato. Va en las posiciones 29-32 del registro de 85 (Altas Masivas)." size="md" zIndex={80}>
        <SelectorPuestoDesempenado
          autoFocus
          valor={efectivo}
          onChange={(codigo) => {
            setEligiendo(false);
            // Elegir el mismo que el default deja el contrato heredando: no se guarda una excepción que no lo es.
            void onCambiar(codigoPuesto(codigo) === defecto ? '' : codigoPuesto(codigo));
          }}
        />
      </Modal>
    </div>
  );
};

/**
 * El mismo campo, para un formulario que NO tiene los catálogos: le pide el default al server cada vez
 * que cambian el rol, la categoría o la empleadora del contrato que se está armando.
 */
export const CampoPuestoConDefaultDelServer: React.FC<{
  rolFrameId?: string | number | null;
  categoriaSatId?: string | number | null;
  empresaId?: string | null;
  valor: string;
  onCambiar: (codigo: string) => void;
  claseEtiqueta?: string;
}> = ({ rolFrameId, categoriaSatId, empresaId, valor, onCambiar, claseEtiqueta }) => {
  const [porDefecto, setPorDefecto] = useState<PuestoPorDefecto>({ codigo: '', origen: 'ninguno' });
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    projectsAPI
      .puestoPorDefecto({ rolFrameId, categoriaSatId, empresaId })
      .then((r) => vivo && setPorDefecto({ codigo: r.codigo || '', origen: r.origen }))
      // Sin respuesta no se inventa un default: queda «sin definir» y se puede elegir a mano.
      .catch(() => vivo && setPorDefecto({ codigo: '', origen: 'ninguno' }))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [rolFrameId, categoriaSatId, empresaId]);
  return <CampoPuestoDesempenado valor={valor} porDefecto={porDefecto} onCambiar={onCambiar} cargandoDefault={cargando} claseEtiqueta={claseEtiqueta} />;
};
