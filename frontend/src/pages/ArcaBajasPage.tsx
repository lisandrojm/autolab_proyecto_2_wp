import React, { useCallback, useEffect, useMemo, useState } from "react";
import { faLandmark } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { TablaConEncabezadoFijo } from "../components/ui/TablaConEncabezadoFijo";
import { EncabezadoSincronizacionArca } from "../components/arca/EncabezadoSincronizacionArca";
import { OperacionesArcaHistorial } from "../components/arca/OperacionesArcaHistorial";
import { BotonOperarRelacionArca } from "../components/arca/OperarRelacionArca";
import { arcaOperacionesAPI, type RelacionOperableArca } from "../api/arcaOperaciones";

/*
  A.R.C.A BAJAS (22/11/2026, pedido del usuario): la cola de trabajo de las bajas en ARCA. No es otra copia del
  botón «Relación en ARCA»: es dónde se ve qué falta hacer.

   - PENDIENTES: contratos que ya terminaron en WeProdu y cuya relación sigue abierta en ARCA. Es la sección 1 de
     la Auditoría ARCA («falta la baja en ARCA»). Un contrato a plazo o una jornada llevan su fecha de fin desde el
     alta y ARCA los cierra solo: acá caen los por tiempo indeterminado y los que terminan antes de su fecha.
     Primero los que llevan más días: ARCA observa las bajas informadas más de 5 días después del fin.
   - OPERACIONES: qué se mandó, cuándo, quién, el resultado y la pantalla de ARCA (lo mismo que Presentaciones ARCA).
   - PARA REVISAR: relaciones de ARCA sin contrato en WeProdu, o con varios. Nadie las puede resolver desde la
     bandeja Contratos, que parte del contrato.

  Todo sale del espejo de Relaciones Laborales (`GET /arca/operaciones/cola`): por eso arriba va el mismo encabezado
  de sincronización que Antigüedad ARCA. El ícono de cada fila lo decide la misma regla que en Contratos y en
  Antigüedad ARCA (`compartido/arca/relacionParaOperar.ts`).
*/

type Pestana = "pendientes" | "operaciones" | "revisar";

const DIAS_PLAZO_BAJA = 5;
const fmtCuil = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);
const fechaCorta = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const th = "px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 text-left";
const td = "px-4 py-3 text-sm text-gray-700 dark:text-gray-300";

const ESTADO: Record<RelacionOperableArca["estado"], { texto: string; clase: string }> = {
  abierta: { texto: "Abierta", clase: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  fin_futuro: { texto: "Con fin futuro", clase: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  cerrada_reciente: { texto: "Cerrada hace poco", clase: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  cerrada: { texto: "Cerrada", clase: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

export const ArcaBajasPage: React.FC = () => {
  const [pestana, setPestana] = useState<Pestana>("pendientes");
  const [relaciones, setRelaciones] = useState<RelacionOperableArca[] | null>(null);
  const [error, setError] = useState("");
  const [conCerradas, setConCerradas] = useState(false);
  const [ayuda, setAyuda] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setError("");
      setRelaciones((await arcaOperacionesAPI.cola()).relaciones);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "No se pudo leer la cola.");
      setRelaciones([]);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  // PENDIENTES: un contrato terminado en WeProdu con la relación abierta en ARCA. Primero los que llevan más días.
  const pendientes = useMemo(() => (relaciones || []).filter((r) => r.modo === "contrato" && r.estado === "abierta" && r.diasDesdeFinContrato !== null).sort((a, b) => (b.diasDesdeFinContrato || 0) - (a.diasDesdeFinContrato || 0)), [relaciones]);
  // PARA REVISAR: sin contrato o con varios. Por defecto, las que se pueden operar (abiertas o con fin futuro).
  const revisar = useMemo(
    () =>
      (relaciones || [])
        .filter((r) => (r.contratos.length === 0 || r.contratos.length > 1) && (r.estado === "abierta" || r.estado === "fin_futuro" || (conCerradas && r.estado === "cerrada_reciente")))
        .sort((a, b) => a.persona.localeCompare(b.persona) || a.inicio.localeCompare(b.inicio)),
    [relaciones, conCerradas],
  );
  const cerradasRecientes = useMemo(() => (relaciones || []).filter((r) => (r.contratos.length === 0 || r.contratos.length > 1) && r.estado === "cerrada_reciente").length, [relaciones]);

  const pestanas: { clave: Pestana; label: string; cantidad?: number }[] = [
    { clave: "pendientes", label: "Pendientes", cantidad: relaciones ? pendientes.length : undefined },
    { clave: "operaciones", label: "Operaciones" },
    { clave: "revisar", label: "Para revisar", cantidad: relaciones ? revisar.length : undefined },
  ];

  return (
    <PageLayout
      title="A.R.C.A Bajas"
      subtitle="Bajas, modificaciones y anulaciones de relaciones laborales en ARCA: lo que falta hacer, lo que se hizo y lo que hay que mirar."
      faIcon={{ icon: faLandmark }}
      itemCount={relaciones ? pendientes.length : undefined}
      infoModal={{
        isOpen: ayuda,
        onOpen: () => setAyuda(true),
        onClose: () => setAyuda(false),
        title: "A.R.C.A Bajas",
        size: "md",
        content: (
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <p><strong>Pendientes:</strong> contratos que ya terminaron en WeProdu y cuya relación sigue abierta en ARCA. Falta presentar la baja en ARCA. Un contrato a plazo o una jornada llevan su fecha de fin desde el alta y ARCA los cierra solo: acá aparecen los por tiempo indeterminado y los que terminan antes de su fecha.</p>
            <p><strong>Operaciones:</strong> el registro de lo que se mandó a ARCA desde WeProdu: qué, cuándo, quién, el resultado y la pantalla de ARCA tal como quedó.</p>
            <p><strong>Para revisar:</strong> relaciones de ARCA que no tienen un contrato en WeProdu con esa persona, empleadora y fecha de alta, o que tienen varios. Sin contrato, el panel abre igual y avisa que el resultado no se guarda en ningún contrato.</p>
            <p>ARCA pide informar la baja dentro de los {DIAS_PLAZO_BAJA} días corridos del fin; pasado ese plazo puede observarla. Por eso «Pendientes» muestra primero las que llevan más días.</p>
            <p>Todo sale de la última sincronización con ARCA: si algo cambió hoy en ARCA, sincronizá primero.</p>
          </div>
        ),
      }}
      shouldShowInfo
    >
      <div className="space-y-6">
        <EncabezadoSincronizacionArca onSincronizada={() => void cargar()} />

        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">
          {pestanas.map((p) => (
            <button
              key={p.clave}
              type="button"
              onClick={() => setPestana(p.clave)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${pestana === p.clave ? "border-blue-600 text-blue-700 dark:text-blue-300" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
            >
              {p.label}
              {p.cantidad !== undefined && <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[11px] ${p.cantidad ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800"}`}>{p.cantidad}</span>}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {pestana === "operaciones" ? (
          <OperacionesArcaHistorial />
        ) : relaciones === null ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : pestana === "pendientes" ? (
          pendientes.length === 0 ? (
            <p className="text-sm text-gray-500 py-10 text-center">No hay contratos terminados en WeProdu con la relación abierta en ARCA. Esta lista se llena sola a medida que se cierran contratos por tiempo indeterminado o antes de su fecha.</p>
          ) : (
            <TablaConEncabezadoFijo className="rounded-xl border border-gray-200 dark:border-gray-700" tabla="min-w-full">
              <thead>
                <tr>
                  <th className={th}>Persona</th>
                  <th className={th}>Empleadora</th>
                  <th className={th}>Contrato</th>
                  <th className={th}>Alta</th>
                  <th className={th}>Fin en WeProdu</th>
                  <th className={th}>Días desde el fin</th>
                  <th className={`${th} col-acciones`}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((r) => {
                  const c = r.contratos.find((x) => x.relacionArca.puede) || r.contratos[0];
                  const dias = r.diasDesdeFinContrato || 0;
                  return (
                    <tr key={r.clave} className="border-t border-gray-100 dark:border-gray-800">
                      <td className={td}>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{r.persona || "—"}</p>
                        <p className="text-xs text-gray-500 font-mono">{fmtCuil(r.cuil)}</p>
                      </td>
                      <td className={td}>{r.empleadora}</td>
                      <td className={td}>
                        {c?.contrato || "—"}
                        <span className="block text-xs text-gray-500">{c?.proyecto}</span>
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{fechaCorta(r.inicio)}</td>
                      <td className={`${td} whitespace-nowrap`}>{fechaCorta(c?.baja)}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        <span className={`font-semibold ${dias > DIAS_PLAZO_BAJA ? "text-red-600" : "text-gray-700 dark:text-gray-300"}`} title={dias > DIAS_PLAZO_BAJA ? `Pasaron los ${DIAS_PLAZO_BAJA} días corridos que da ARCA: puede observar la baja.` : `Dentro de los ${DIAS_PLAZO_BAJA} días corridos que da ARCA.`}>
                          {dias} {dias === 1 ? "día" : "días"}
                        </span>
                      </td>
                      <td className={`${td} col-acciones`}>
                        <BotonOperarRelacionArca relacion={r} operar={r} onHecho={() => void cargar()} conTexto />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TablaConEncabezadoFijo>
          )
        ) : (
          <div className="space-y-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
              <input type="checkbox" checked={conCerradas} onChange={(e) => setConCerradas(e.target.checked)} className="rounded border-gray-300" />
              Incluir cerradas en los últimos 30 días{cerradasRecientes ? ` (${cerradasRecientes})` : ""}
              <span className="text-xs text-gray-400">· se ven para saber por qué salieron de la lista; una relación cerrada no se opera</span>
            </label>
            {revisar.length === 0 ? (
              <p className="text-sm text-gray-500 py-10 text-center">No hay relaciones de ARCA abiertas o con fin futuro sin contrato, ni con varios contratos.</p>
            ) : (
              <TablaConEncabezadoFijo className="rounded-xl border border-gray-200 dark:border-gray-700" tabla="min-w-full">
                <thead>
                  <tr>
                    <th className={th}>Persona</th>
                    <th className={th}>Empleadora</th>
                    <th className={th}>Inicio</th>
                    <th className={th}>Fin en ARCA</th>
                    <th className={th}>Por qué está acá</th>
                    <th className={`${th} col-acciones`}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {revisar.map((r) => (
                    <tr key={r.clave} className="border-t border-gray-100 dark:border-gray-800 align-top">
                      <td className={td}>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{r.persona || "—"}</p>
                        <p className="text-xs text-gray-500 font-mono">{fmtCuil(r.cuil)}</p>
                        {!r.userId && <p className="text-[11px] text-amber-700 dark:text-amber-300">No está cargada en WeProdu</p>}
                      </td>
                      <td className={td}>{r.empleadora}</td>
                      <td className={`${td} whitespace-nowrap`}>{fechaCorta(r.inicio)}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        {r.fin ? fechaCorta(r.fin) : "—"}
                        <span className={`block w-fit mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${ESTADO[r.estado].clase}`}>{ESTADO[r.estado].texto}</span>
                      </td>
                      <td className={td}>
                        {r.contratos.length === 0 ? (
                          <p>Ningún contrato de WeProdu tiene esa persona, empleadora y fecha de alta.</p>
                        ) : (
                          <>
                            <p>{r.contratos.length} contratos de WeProdu con esa alta y empleadora:</p>
                            <ul className="mt-1 text-xs text-gray-500 list-disc list-inside">
                              {r.contratos.map((c) => (
                                <li key={`${c.userProjectId}-${c.posicion}`}>
                                  {c.contrato || "Contrato"} · {c.proyecto || "(sin proyecto)"} · {c.baja ? `hasta ${fechaCorta(c.baja)}` : "sin baja"}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        {!r.puede && r.motivo && <p className="mt-1 text-xs text-gray-400">{r.motivo}</p>}
                      </td>
                      <td className={`${td} col-acciones`}>
                        <BotonOperarRelacionArca relacion={r} operar={r} onHecho={() => void cargar()} conTexto />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TablaConEncabezadoFijo>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default ArcaBajasPage;
