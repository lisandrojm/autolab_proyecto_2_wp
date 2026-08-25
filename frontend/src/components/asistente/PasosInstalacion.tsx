import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { Sistema } from '../../utils/sistemaOperativo';

/**
 * El menú contextual de macOS, dibujado.
 *
 * Va dibujado y no como captura de pantalla porque una imagen de macOS envejece con cada versión del
 * sistema y termina mostrando un menú que ya no se parece al que la persona tiene delante. Lo que
 * tiene que quedar claro es UNA cosa —hay que usar el botón derecho y elegir «Abrir»— y para eso el
 * dibujo alcanza y siempre va a estar actualizado.
 *
 * Vive acá y no en la guía porque lo usan las dos: la guía a ancho completo y la pantalla de
 * validación en su barra angosta. Dos dibujos del mismo menú se desincronizan solos.
 */
export const MenuMac: React.FC = () => (
  <div className="shrink-0 w-44 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-sm overflow-hidden text-[12px] select-none">
    <div className="px-3 py-1.5 text-gray-400 dark:text-gray-500">Abrir con</div>
    <div className="px-3 py-1.5 bg-blue-600 text-white font-semibold flex items-center justify-between">
      Abrir
      <FontAwesomeIcon icon={faArrowRight} className="h-2.5 w-2.5" />
    </div>
    <div className="px-3 py-1.5 text-gray-400 dark:text-gray-500">Mover a la papelera</div>
    <div className="px-3 py-1.5 text-gray-400 dark:text-gray-500">Obtener información</div>
  </div>
);

const Paso: React.FC<{ n: number; titulo: React.ReactNode; children?: React.ReactNode }> = ({ n, titulo, children }) => (
  <li className="relative pl-8">
    <span className="absolute left-0 top-0 h-5 w-5 rounded-full bg-blue-600 text-white text-[11px] font-semibold flex items-center justify-center">{n}</span>
    <p className="font-semibold text-gray-900 dark:text-gray-100 text-[12.5px]">{titulo}</p>
    {children && <div className="text-[11.5px] text-gray-600 dark:text-gray-400 mt-0.5 space-y-1.5">{children}</div>}
  </li>
);

/**
 * Cómo se instala el Asistente, en pasos y SOLO los del sistema que se está usando.
 *
 * Antes esto era un párrafo con las instrucciones de los dos sistemas juntas, arriba de tres botones
 * de descarga. La persona tenía que leer todo para saber cuál de las seis cosas le tocaba, y la
 * advertencia del sistema aparecía DESPUÉS de los botones — o sea, después del momento en que ya
 * había hecho click y se había encontrado el cartel de golpe.
 *
 * La advertencia ahora vive ADENTRO del paso en que ocurre, y anticipada: saber que va a aparecer un
 * cartel de seguridad es lo que hace la diferencia entre pasarlo y abandonar la instalación ahí.
 *
 * `compacto` es para la barra angosta de la pantalla de validación; la guía lo usa a ancho completo.
 * Los textos son los MISMOS en los dos lados a propósito: dos redacciones del mismo trámite se
 * desincronizan solas, y con «click derecho → Abrir» ya pasó.
 */
export const PasosInstalacion: React.FC<{ sistema: Sistema; compacto?: boolean }> = ({ sistema, compacto }) => (
  <ol className={`space-y-2.5 ${compacto ? 'mt-2' : 'mt-3 space-y-4'}`}>
    {sistema === 'windows' ? (
      <>
        <Paso n={1} titulo="Descargalo y abrilo" />
        <Paso n={2} titulo={<>Windows va a decir «Windows protegió su PC»</>}>
          <p>
            Es el aviso por defecto para cualquier programa sin certificado, no algo sobre este en particular. El botón que ves dice <strong>No ejecutar</strong>; el que sirve está detrás del link{' '}
            <strong>Más información</strong>, arriba en letra chica: <strong>Ejecutar de todas formas</strong>.
          </p>
        </Paso>
        <Paso n={3} titulo="Se abre una ventana negra: dejala abierta">
          <p>Es el Asistente corriendo. Se empareja solo — no hay ningún código que copiar — y esta pantalla se pone en verde sola.</p>
        </Paso>
      </>
    ) : (
      <>
        <Paso n={1} titulo="Descargalo y descomprimí el .zip" />
        <Paso n={2} titulo={<>Click derecho sobre <strong>AsistenteWeProdu.command</strong> → Abrir</>}>
          <p className="flex items-start gap-3 flex-wrap">
            <MenuMac />
            <span className="max-w-xs">
              Con doble click no alcanza: macOS solo ofrece mandarlo a la papelera. Con el botón derecho aparece <strong>Abrir</strong>, y en el cartel que sale después, otra vez <strong>Abrir</strong>.
            </span>
          </p>
          {/*
            Desde macOS Sequoia (15) Apple sacó el atajo del click derecho para lo que Gatekeeper
            bloquea: el cartel puede salir SIN un botón «Abrir», solo con «Listo» o «Mover a la
            papelera». Quien esté en esa versión sigue el paso de arriba, no le funciona, y se queda
            sin camino. Por eso van los dos: uno de los dos le va a servir a cada uno.
          */}
          <p>
            <strong>¿El cartel solo te deja «Listo» o «Mover a la papelera»?</strong> Es macOS Sequoia, que sacó ese atajo. Andá a <strong>Ajustes del Sistema → Privacidad y seguridad</strong>, bajá
            hasta donde nombra el archivo, y tocá <strong>Abrir igualmente</strong>.
          </p>
        </Paso>
        <Paso n={3} titulo="Se abre una ventana de Terminal: dejala abierta">
          <p>Es el Asistente corriendo. Se empareja solo — no hay ningún código que copiar — y esta pantalla se pone en verde sola.</p>
        </Paso>
      </>
    )}
  </ol>
);

/**
 * El límite, dicho como límite y no como disculpa.
 *
 * El cartel de seguridad NO se puede evitar sin un certificado de firma, que es una cuota anual.
 * Decir «es normal» sin decir por qué suena a excusa; decir por qué lo convierte en un dato.
 */
export const NotaSinFirma: React.FC = () => (
  <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-2">
    El programa no está firmado con un certificado de desarrollador —cuesta una cuota anual—, así que el sistema siempre va a avisar la primera vez. Ese cartel no se puede evitar; pasarlo es lo de
    arriba, y se hace una sola vez.
  </p>
);
