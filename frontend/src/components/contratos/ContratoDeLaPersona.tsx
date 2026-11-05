import React, { useEffect, useState } from "react";
import { Contract, ContratoQueRige, usersAPI } from "../../api/users";
import { ContratoFrameItem } from "../../api/contratosFrame";
import { InfoItem } from "../../api/info";
import { EstadoBadge } from "../EstadoSelect";
import { estadoImpositivoDelContrato, formatDate } from "../team/ContractCard";

/*
  EL CONTRATO QUE LA PERSONA YA TIENE, a la vista al contratarla (05/11/2026): en la solicitud, en Agregar
  miembro y en Editar y Aprobar. El que rige, en cualquier proyecto: entre los vigentes manda el de tiempo
  indeterminado y, sin vigentes, el último. Es lo que hay que mirar para elegir las fechas y el tipo de
  contrato (ver `useContratoEnFechas`).
*/
export const ContratoDeLaPersona: React.FC<{
  userId?: string;
  /** Las plantillas y los estados del formulario: de ahí sale el tag de ARCA o Servicios. */
  contratoFrames: ContratoFrameItem[];
  estados: InfoItem[];
  /** El rótulo «Contrato», con la tipografía de los demás rótulos de ese formulario. */
  rotulo: React.ReactNode;
  className?: string;
}> = ({ userId, contratoFrames, estados, rotulo, className = "" }) => {
  const [estado, setEstado] = useState<{ id: string; contrato: ContratoQueRige | null } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let vigente = true;
    usersAPI
      .contratoQueRige(userId)
      .then((contrato) => vigente && setEstado({ id: userId, contrato }))
      // Es información de apoyo: sin respuesta no se muestra nada, y no «sin contratos», que sería falso.
      .catch(() => vigente && setEstado(null));
    return () => {
      vigente = false;
    };
  }, [userId]);

  if (!userId || estado?.id !== userId) return null;
  const c = estado.contrato;
  const tramite = c ? estadoImpositivoDelContrato({ nombre_contrato: c.nombre, tipo_contrato_id: c.tipoContratoId } as unknown as Contract, contratoFrames, estados) : null;

  return (
    <div className={`space-y-1 ${className}`}>
      {rotulo}
      {c ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-600 dark:text-gray-300">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${c.vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
            {c.vigente ? "Vigente" : "No vigente"}
          </span>
          {tramite && <EstadoBadge name={tramite.name} />}
          {c.nombre && <span>{c.nombre}</span>}
          {c.centroCosto && (
            <span title={`Centro de costo ${c.centroCosto}`} className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none tabular-nums bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400">
              {c.centroCosto}
            </span>
          )}
          {c.proyecto && <span>{c.proyecto}</span>}
          <span className="text-gray-500 dark:text-gray-400">
            {c.alta ? `Alta ${formatDate(c.alta)}` : "Sin alta"} · {c.baja ? `Baja ${formatDate(c.baja)}` : "Tiempo indeterminado"}
          </span>
        </div>
      ) : (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">Sin contratos anteriores.</p>
      )}
    </div>
  );
};
