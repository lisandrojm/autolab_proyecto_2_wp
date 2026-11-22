import React from "react";
import { SITUACIONES_BAJA_ARCA, type ConteosBajaArca, type ListaBajasArca, type MovimientosBajaArca } from "../../api/arcaOperaciones";

/*
  QUÉ CAMBIÓ EN LA LISTA DE BAJAS ARCA (22/11/2026): quién entró, quién salió (y a dónde fue) y quién cambió de
  situación entre dos momentos. Lo usan la página Gestión › Bajas ARCA (contra la foto de la corrida de las 06:00 y
  corrida por corrida) y el encabezado de sincronización, que después de un «Sincronizar ahora» muestra la diferencia
  contra la última foto sin reemplazarla: el que aprieta el botón a mano tiene que ver qué cambió.
*/

export const fechaHoraCorta = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
export const resumenDeConteos = (c: ConteosBajaArca) => `${c.pendientes} ${c.pendientes === 1 ? "pendiente" : "pendientes"} (1: ${c.s1} · 2: ${c.s2} · 3: ${c.s3} · 4: ${c.s4}) y ${c.s5} de inventario`;
export const hayMovimientos = (m?: MovimientosBajaArca | null) => !!m && (m.entraron.length > 0 || m.salieron.length > 0 || m.cambiaron.length > 0);

export const MovimientosBajasArca: React.FC<{ m: MovimientosBajaArca }> = ({ m }) => (
  <ul className="mt-1 space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
    {m.entraron.map((x) => (
      <li key={`e-${x.clave}`}><span className="font-semibold text-gray-800 dark:text-gray-200">Entró</span> {x.persona} · {x.situacion}. {SITUACIONES_BAJA_ARCA[x.situacion]}</li>
    ))}
    {m.salieron.map((x) => (
      <li key={`s-${x.clave}`}><span className="font-semibold text-gray-800 dark:text-gray-200">Salió</span> {x.persona} (estaba en {x.situacion}. {SITUACIONES_BAJA_ARCA[x.situacion]}): {x.ahora}</li>
    ))}
    {m.cambiaron.map((x) => (
      <li key={`c-${x.clave}`}><span className="font-semibold text-gray-800 dark:text-gray-200">Cambió</span> {x.persona}: de {x.de}. {SITUACIONES_BAJA_ARCA[x.de]} a {x.a}. {SITUACIONES_BAJA_ARCA[x.a]}</li>
    ))}
  </ul>
);

/** La lista de Bajas ARCA recién calculada, comparada con la última foto. Para después de una sincronización. */
export const BajasArcaDespuesDeSincronizar: React.FC<{ lista: ListaBajasArca; onCerrar?: () => void }> = ({ lista, onCerrar }) => (
  <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-xs text-blue-900 dark:text-blue-200">
    <div className="flex items-start justify-between gap-3">
      <p>
        <span className="font-semibold">Bajas ARCA después de esta sincronización:</span> {resumenDeConteos(lista.conteos)}.{" "}
        {!lista.corrida
          ? "Todavía no hay una foto de la corrida automática para comparar: la deja la primera corrida de las 06:00."
          : hayMovimientos(lista.desdeLaCorrida)
            ? `Respecto de la foto de la corrida del ${fechaHoraCorta(lista.corrida.el)} cambió esto (la foto no se reemplaza: la guarda sólo la corrida automática):`
            : `Sin cambios respecto de la foto de la corrida del ${fechaHoraCorta(lista.corrida.el)}.`}
      </p>
      {onCerrar && (
        <button type="button" onClick={onCerrar} className="shrink-0 underline hover:no-underline">
          cerrar
        </button>
      )}
    </div>
    {lista.corrida && hayMovimientos(lista.desdeLaCorrida) && <MovimientosBajasArca m={lista.desdeLaCorrida!} />}
  </div>
);
