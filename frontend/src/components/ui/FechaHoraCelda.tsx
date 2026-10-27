import React from "react";

/*
  UNA FECHA CON DÍA Y HORA, como la muestra Solicitudes (27/10/2026: «Fecha de creación» igual en
  Solicitudes y en Contratos). En HORARIO ARGENTINO, fijo: la base guarda UTC y quien mira desde otra
  zona vería otra hora que la de la oficina. Una fecha sin hora («2026-10-27», contratos viejos) se
  muestra sin hora y en su día: leída como UTC caería el día anterior a la noche.
*/
const ZONA_AR = "America/Argentina/Buenos_Aires";

export const fechaHoraAR = (valor?: string | null): { diaSemana: string; fecha: string; hora: string | null } | null => {
  if (!valor) return null;
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(valor);
  // Mediodía argentino: el día queda donde está, en cualquier zona.
  const d = new Date(soloFecha ? `${valor}T12:00:00-03:00` : valor);
  if (Number.isNaN(d.getTime())) return null;
  const diaSemana = d.toLocaleDateString("es-AR", { weekday: "long", timeZone: ZONA_AR });
  return {
    diaSemana: diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1),
    fecha: d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", timeZone: ZONA_AR }),
    hora: soloFecha ? null : d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA_AR }),
  };
};

export const FechaHoraCelda: React.FC<{ valor?: string | null; vacio?: React.ReactNode }> = ({ valor, vacio }) => {
  const f = fechaHoraAR(valor);
  if (!f) return <>{vacio ?? <span className="text-xs text-gray-400">N/A</span>}</>;
  return (
    <div className="text-xs leading-tight">
      <p className="text-gray-500 dark:text-gray-400">{f.diaSemana}</p>
      <p className="text-gray-900 dark:text-white">
        {f.fecha}
        {f.hora && <span className="text-gray-500 dark:text-gray-400"> · {f.hora} h</span>}
      </p>
    </div>
  );
};
