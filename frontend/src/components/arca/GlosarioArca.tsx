import React from "react";
import { Modal } from "../ui/Modal";

/*
  EL GLOSARIO DE ARCA (22/11/2026, pedido del usuario): qué quiere decir cada número de la barra de
  sincronización, y lo que ya se investigó para que nadie lo vuelva a abrir. Se abre desde la barra
  («ver glosario») en Antigüedad ARCA y en A.R.C.A Bajas.
*/

const Termino: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <div>
    <dt className="text-sm font-bold text-gray-900 dark:text-gray-100">{titulo}</dt>
    <dd className="mt-1 text-sm text-gray-600 dark:text-gray-300 space-y-2">{children}</dd>
  </div>
);

export const GlosarioArca: React.FC<{ isOpen: boolean; onClose: () => void; zIndex?: number }> = ({ isOpen, onClose, zIndex = 80 }) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Glosario de ARCA" size="lg" zIndex={zIndex}>
    <dl className="space-y-5">
      <Termino titulo="Relación laboral y sincronización">
        <p>Una relación laboral es lo que ARCA tiene registrado: una persona (CUIL), una empleadora (CUIT), una fecha de inicio y, si terminó, una fecha de fin con su motivo. La sincronización las lee de ARCA todos los días y guarda una copia; sólo lee, no presenta nada.</p>
      </Termino>
      <Termino titulo="Bajas aplicadas solas">
        <p>Bajas que ARCA ya tiene y que la sincronización automática escribió en el contrato. Sólo lo hace cuando coinciden la persona, la empleadora y la fecha de alta exacta, y con un tope por corrida.</p>
      </Termino>
      <Termino titulo="Para que mire una persona">
        <p>Lo que no encaja entre WeProdu y ARCA y nadie puede decidir automáticamente. Es la lista de la pestaña «Auditoría ARCA»: contratos terminados que en ARCA siguen abiertos, tramos que ningún contrato explica, relaciones de ARCA sin contrato con esa fecha de alta. Cada fila dice por qué está ahí.</p>
      </Termino>
      <Termino titulo="Altas históricas hechas a mano donde ARCA termina después que el contrato">
        <p><strong>No requieren acción.</strong> Son contratos importados cuya alta alguien cargó a mano en ARCA entre 2024 y 2026, y donde ARCA tiene la fecha de fin después que WeProdu.</p>
        <p>
          Se investigó el 22/11/2026 sobre los 5.712 contratos que tienen su relación exacta en ARCA y fecha de fin de los dos lados. Eran 831 casos: 545 con exactamente un día de más y el resto con más días, casi todos con motivo «vencimiento de contrato a plazo fijo». El día de más no sigue ningún patrón: no depende del tipo de contrato ni de que el horario cruce la medianoche, y la mayoría de las altas cargadas a mano coinciden.
        </p>
        <p>
          Las altas presentadas desde WeProdu coinciden en 353 de 353: se mandó como fin la fecha de baja del contrato y ARCA tiene ese mismo día. La convención de WeProdu y la de ARCA es la misma, así que las bajas que se presentan desde WeProdu no necesitan ninguna corrección de fecha.
        </p>
        <p>Como ya no se importa de FRAME (deprecado en noviembre de 2026), es un conjunto histórico cerrado: no crece y no se corrige. Si un alta presentada desde WeProdu apareciera con ARCA terminando después, no se cuenta acá: va a «para que mire una persona».</p>
      </Termino>
      <Termino titulo="Relación para operar">
        <p>Una relación sobre la que se puede presentar una baja, una modificación o una anulación en ARCA: el contrato es de trámite ARCA y no está anulado, la relación existe (alta presentada, adoptada o leída en la sincronización) y está abierta, termina de hoy en adelante, o tiene una operación reciente hecha desde WeProdu. La misma regla decide el ícono en Contratos, en Antigüedad ARCA y en A.R.C.A Bajas.</p>
      </Termino>
    </dl>
  </Modal>
);

export default GlosarioArca;
