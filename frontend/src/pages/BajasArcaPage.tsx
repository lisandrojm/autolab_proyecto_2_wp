import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLandmark, faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { TablaConEncabezadoFijo } from "../components/ui/TablaConEncabezadoFijo";
import { EncabezadoSincronizacionArca } from "../components/arca/EncabezadoSincronizacionArca";
import { OperacionesArcaHistorial } from "../components/arca/OperacionesArcaHistorial";
import { OperacionArcaModal } from "../components/contratos/OperacionArcaModal";
import { fechaHoraCorta as fechaHora, hayMovimientos, MovimientosBajasArca as Movimientos, resumenDeConteos } from "../components/arca/MovimientosBajasArca";
import { arcaOperacionesAPI, SITUACIONES_BAJA_ARCA, type ConteosBajaArca, type FilaBajaArca, type ListaBajasArca, type ReferenciaContratoArca, type SituacionBajaArca } from "../api/arcaOperaciones";

/*
  BAJAS ARCA (22/11/2026, pedido del usuario): UNA sola lista, y el único lugar desde donde se da de baja una
  relación en ARCA. Reemplaza a «A.R.C.A Bajas» (Pendientes / Operaciones / Para revisar) y a los íconos que había en
  la bandeja Contratos y en Antigüedad ARCA.

  Una fila por relación viva en ARCA sobre la que se puede operar, con exactamente UNA situación (1 a 5). La
  situación, el orden, los conteos y lo que queda afuera los decide el server (`services/arca/listaBajasArca.ts`),
  con la regla compartida de «se puede operar»; acá sólo se filtra y se dibuja.

   - Los chips filtran por situación y SIEMPRE muestran su conteo, también apagados. La 5 (indeterminado vigente)
     arranca apagada porque es inventario, no trabajo: 58 contra 8 al 22/11. Pero son la población de Becerini y
     Pereda, los que nadie cierra hasta que alguien no puede dar un alta: el número queda a la vista.
   - El buscador busca en TODAS las situaciones, estén o no prendidos sus chips, y avisa si la persona tiene una
     relación viva que no está en la lista y por qué (plazo vigente, varios contratos…).
   - «Operaciones» (lo que se mandó y su resultado) es la segunda pestaña.
   - Debajo de los chips, la foto de la corrida de las 06:00 y qué cambió desde entonces: un número que cambia
     tiene que poder explicarse. «Sincronizar ahora» no reemplaza la foto, pero el encabezado muestra la diferencia
     contra ella apenas termina, y la lista se actualiza con lo que trajo.
*/

type Pestana = "bajas" | "operaciones";

const DIAS_PLAZO_BAJA = 5;
const SITUACIONES: SituacionBajaArca[] = [1, 2, 3, 4, 5];
const PRENDIDAS_POR_DEFECTO: SituacionBajaArca[] = [1, 2, 3, 4];
const fmtCuil = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);
const fechaCorta = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const th = "px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 text-left";
const td = "px-4 py-3 text-sm text-gray-700 dark:text-gray-300";

const TONO: Record<SituacionBajaArca, { chip: string; punto: string }> = {
  1: { chip: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800", punto: "bg-red-500" },
  2: { chip: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-800", punto: "bg-orange-500" },
  3: { chip: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700", punto: "bg-amber-500" },
  4: { chip: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-800", punto: "bg-purple-500" },
  5: { chip: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600", punto: "bg-gray-400" },
};

const conteoDe = (c: ConteosBajaArca, s: SituacionBajaArca) => c[`s${s}` as "s1"];

export const BajasArcaPage: React.FC = () => {
  const [pestana, setPestana] = useState<Pestana>("bajas");
  const [lista, setLista] = useState<ListaBajasArca | null>(null);
  const [error, setError] = useState("");
  const [prendidas, setPrendidas] = useState<Set<SituacionBajaArca>>(new Set(PRENDIDAS_POR_DEFECTO));
  const [buscar, setBuscar] = useState("");
  const [verCambios, setVerCambios] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  // Se guarda el objeto: el panel vuelve a leer cuando cambia la referencia, y uno nuevo en cada render lo haría leer sin parar.
  const [operando, setOperando] = useState<ReferenciaContratoArca | null>(null);

  const cargar = useCallback(async () => {
    try {
      setError("");
      setLista(await arcaOperacionesAPI.lista());
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "No se pudo leer la lista.");
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const q = sinTildes(buscar.trim());
  const qDigitos = buscar.replace(/\D/g, "");
  const coincide = useCallback((x: { persona: string; cuil: string; empleadora: string }) => sinTildes(`${x.persona} ${x.empleadora}`).includes(q) || (qDigitos.length >= 3 && x.cuil.includes(qDigitos)), [q, qDigitos]);
  // Con texto en el buscador se busca en TODAS las situaciones, estén o no prendidos sus chips.
  const filas = useMemo(() => (lista?.filas || []).filter((f) => (q ? coincide(f) : prendidas.has(f.situacion))), [lista, q, coincide, prendidas]);
  const fueraQueCoinciden = useMemo(() => (q ? (lista?.fuera || []).filter(coincide) : []), [lista, q, coincide]);

  const alternar = (s: SituacionBajaArca) => setPrendidas((p) => { const n = new Set(p); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  const abrir = (f: FilaBajaArca) =>
    setOperando(f.contrato ? { userProjectId: f.contrato.userProjectId, contratoKey: f.contrato.contratoKey, contractIndex: f.contrato.posicion } : { userProjectId: "", relacion: { empleadoraCuit: f.empleadoraCuit, cuil: f.cuil, fechaInicio: f.inicio } });

  const c = lista?.conteos;
  const fueraTexto = c
    ? [
        c.fuera.plazo_vigente ? `${c.fuera.plazo_vigente} ${c.fuera.plazo_vigente === 1 ? "plazo vigente" : "plazos vigentes"} que ARCA cierra sola` : "",
        c.fuera.baja_presentada ? `${c.fuera.baja_presentada} con la baja ya presentada, esperando la sincronización` : "",
        c.fuera.no_se_opera ? `${c.fuera.no_se_opera} que no se pueden operar (alta sin confirmar o anulada)` : "",
      ].filter(Boolean)
    : [];

  return (
    <PageLayout
      title="Bajas ARCA"
      subtitle="Las relaciones laborales vivas en ARCA y qué hay que hacer con cada una. Es el único lugar desde donde se da de baja."
      faIcon={{ icon: faLandmark }}
      itemCount={c ? c.pendientes : undefined}
      infoModal={{
        isOpen: ayuda,
        onOpen: () => setAyuda(true),
        onClose: () => setAyuda(false),
        title: "Bajas ARCA",
        size: "md",
        content: (
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <p>Una fila por relación laboral <strong>viva en ARCA</strong> (abierta, o con fecha de fin de hoy en adelante) sobre la que se puede operar. Cada fila tiene una sola situación:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li><strong>Terminado en WeProdu:</strong> el contrato tiene fecha de baja pasada y en ARCA la relación sigue abierta. Falta presentar la baja.</li>
              <li><strong>Termina antes de su fecha:</strong> contrato a plazo cuya baja en WeProdu es anterior al fin que tiene ARCA.</li>
              <li><strong>Baja presentada, sin confirmar:</strong> se mandó desde acá y no se leyó el resultado, o quedó en error de navegación. Mirá la relación en ARCA antes de volver a mandar.</li>
              <li><strong>Sin contrato en WeProdu:</strong> ARCA tiene la relación y WeProdu no tiene un contrato con esa persona, empleadora y fecha de inicio. La fila dice si la persona no tiene ficha o si tiene ficha pero no ese contrato: alguien de laboral tiene que decir si falta cargar el contrato o sobra la relación.</li>
              <li><strong>Indeterminado vigente:</strong> abierto de los dos lados. Es inventario, no trabajo pendiente: no suma al número del menú y su chip arranca apagado.</li>
            </ol>
            <p><strong>No entran:</strong> las relaciones cerradas, los plazos vigentes que ARCA cierra sola en su fecha, y las relaciones con varios contratos en WeProdu. Esas están en Documentos › Auditoría ARCA: si es un contrato duplicado, se anula el que sobra y la relación aparece acá; si es la misma relación en varios proyectos, se resuelve a mano (esta lista no elige un contrato por su cuenta).</p>
            <p>ARCA pide informar la baja dentro de los {DIAS_PLAZO_BAJA} días corridos del fin; pasado ese plazo puede observarla. Por eso, dentro de cada situación, van primero las que llevan más días.</p>
            <p>Todo sale de la última sincronización con ARCA: si algo cambió hoy en ARCA, sincronizá primero.</p>
          </div>
        ),
      }}
      shouldShowInfo
    >
      <div className="space-y-6">
        <EncabezadoSincronizacionArca onSincronizada={(l) => (l ? setLista(l) : void cargar())} />

        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">
          {([
            { clave: "bajas", label: "Bajas", cantidad: c?.pendientes },
            { clave: "operaciones", label: "Operaciones", cantidad: undefined },
          ] as { clave: Pestana; label: string; cantidad?: number }[]).map((p) => (
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
        ) : !lista || !c ? (
          !error && <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por persona, CUIL o empleadora…" className="input-field text-sm w-80 max-w-full pl-9 pr-8" />
                {buscar && (
                  <button type="button" onClick={() => setBuscar("")} title="Limpiar" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                    <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {/* Los chips: el conteo se muestra SIEMPRE, prendido o apagado. */}
              <div className="flex flex-wrap items-center gap-2">
                {SITUACIONES.map((s) => {
                  const prendido = prendidas.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => alternar(s)}
                      aria-pressed={prendido}
                      title={`${prendido ? "Se muestra" : "No se muestra"}. Tocá para ${prendido ? "ocultar" : "mostrar"} «${SITUACIONES_BAJA_ARCA[s]}».${s === 5 ? " Es inventario: no suma al número del menú." : ""}`}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors ${prendido ? TONO[s].chip : "bg-white text-gray-500 border-gray-300 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700"} ${q ? "opacity-60" : ""}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${prendido ? TONO[s].punto : "bg-gray-300 dark:bg-gray-600"}`} />
                      {s}. {SITUACIONES_BAJA_ARCA[s]}
                      <span className="tabular-nums font-bold">{conteoDe(c, s)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {q && <p className="text-xs text-gray-500">Con texto en el buscador se busca en todas las situaciones, estén o no prendidos sus chips.</p>}

            {/* La foto de la corrida de las 06:00 y qué cambió desde entonces. */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
              {lista.corrida ? (
                <p>
                  Corrida automática del {fechaHora(lista.corrida.el)}: {resumenDeConteos(lista.corrida.conteos)}.{" "}
                  {hayMovimientos(lista.desdeLaCorrida) ? <span className="font-semibold text-amber-700 dark:text-amber-300">Desde entonces cambió:</span> : "Desde entonces no cambió nada."}
                  {(lista.movimientos.length > 0 || hayMovimientos(lista.desdeLaCorrida)) && (
                    <button type="button" onClick={() => setVerCambios((v) => !v)} className="ml-2 underline hover:text-gray-800 dark:hover:text-gray-200">
                      {verCambios ? "ocultar el detalle" : "ver qué cambió, día por día"}
                    </button>
                  )}
                </p>
              ) : (
                <p>Todavía no hay una corrida automática guardada: la sincronización de las 06:00 deja la foto de esta lista (cuántas hay en cada situación y cuáles) para poder decir después qué cambió y por qué.</p>
              )}
              {hayMovimientos(lista.desdeLaCorrida) && <Movimientos m={lista.desdeLaCorrida!} />}
              {verCambios &&
                lista.movimientos.map((m) => (
                  <div key={m.el} className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <p className="font-semibold text-gray-700 dark:text-gray-300">Corrida del {fechaHora(m.el)} · quedó en {resumenDeConteos(m.conteos)}</p>
                    <Movimientos m={m} />
                  </div>
                ))}
              {verCambios && lista.movimientos.length === 0 && <p className="mt-1">Ninguna corrida anterior cambió la lista.</p>}
            </div>

            {filas.length === 0 ? (
              <p className="text-sm text-gray-500 py-10 text-center">
                {q
                  ? "Ninguna relación de la lista coincide con la búsqueda."
                  : c.pendientes === 0 && !prendidas.has(5)
                    ? `No hay nada pendiente. Hay ${c.s5} ${c.s5 === 1 ? "relación abierta" : "relaciones abiertas"} de los dos lados (situación 5): prendé su chip para verlas.`
                    : "No hay relaciones en las situaciones elegidas."}
              </p>
            ) : (
              <TablaConEncabezadoFijo className="rounded-xl border border-gray-200 dark:border-gray-700" tabla="min-w-full">
                <thead>
                  <tr>
                    <th className={th}>Persona</th>
                    <th className={th}>CUIL</th>
                    <th className={th}>Empleadora</th>
                    <th className={th}>Tipo de contrato</th>
                    <th className={th}>Inicio</th>
                    <th className={th}>Fin en WeProdu</th>
                    <th className={th}>Días desde el fin</th>
                    <th className={th}>Situación</th>
                    <th className={`${th} col-acciones`}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const vencido = (f.diasDesdeFin ?? 0) > DIAS_PLAZO_BAJA;
                    return (
                      <tr key={f.clave} className="border-t border-gray-100 dark:border-gray-800 align-top">
                        <td className={`${td} font-medium text-gray-900 dark:text-gray-100`}>{f.persona || "—"}</td>
                        <td className={`${td} whitespace-nowrap font-mono text-xs`}>{fmtCuil(f.cuil)}</td>
                        <td className={td}>{f.empleadora}</td>
                        <td className={td}>
                          {f.tipoContrato ? (
                            <>
                              {f.tipoContrato}
                              <span className="block text-xs text-gray-500">{f.proyecto}</span>
                            </>
                          ) : (
                            <span className="text-xs text-gray-500" title="No hay contrato en WeProdu: es la modalidad que tiene la relación en ARCA.">En ARCA: {f.modalidadArca || "—"}</span>
                          )}
                        </td>
                        <td className={`${td} whitespace-nowrap`}>{fechaCorta(f.inicio)}</td>
                        <td className={`${td} whitespace-nowrap`}>{fechaCorta(f.finWeprodu)}</td>
                        <td className={`${td} whitespace-nowrap`}>
                          {f.diasDesdeFin === null ? (
                            "—"
                          ) : (
                            <span className={`font-semibold ${vencido ? "text-red-600" : ""}`} title={vencido ? `Pasaron los ${DIAS_PLAZO_BAJA} días corridos que da ARCA: puede observar la baja.` : `Dentro de los ${DIAS_PLAZO_BAJA} días corridos que da ARCA.`}>
                              {f.diasDesdeFin} {f.diasDesdeFin === 1 ? "día" : "días"}
                            </span>
                          )}
                        </td>
                        <td className={td}>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${TONO[f.situacion].chip}`}>{f.situacion}. {SITUACIONES_BAJA_ARCA[f.situacion]}</span>
                          {f.detalle && <span className={`block mt-1 text-xs ${f.sinFicha ? "font-semibold text-purple-700 dark:text-purple-300" : "text-gray-500"}`}>{f.detalle}</span>}
                        </td>
                        <td className={`${td} col-acciones`}>
                          <button
                            type="button"
                            onClick={() => abrir(f)}
                            title={
                              f.situacion === 3
                                ? "Abre el panel de la relación: muestra lo que se mandó. Mirá ARCA antes de volver a mandar."
                                : f.contrato
                                  ? "Abre el panel de la relación en ARCA con este contrato, con la fecha de fin del contrato ya cargada."
                                  : "Abre el panel «sin contrato»: la operación se hace en ARCA igual y queda en el registro de operaciones."
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors whitespace-nowrap"
                          >
                            <FontAwesomeIcon icon={faLandmark} className="h-3.5 w-3.5" />
                            {f.situacion === 3 ? "Revisar" : "Dar de baja"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </TablaConEncabezadoFijo>
            )}

            {/* Buscó a alguien que tiene una relación viva en ARCA pero no está en la lista: se dice por qué. */}
            {fueraQueCoinciden.length > 0 && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-xs text-blue-900 dark:text-blue-200">
                <p className="font-semibold">Con una relación viva en ARCA que no está en esta lista:</p>
                <ul className="mt-1 space-y-0.5">
                  {fueraQueCoinciden.map((x) => (
                    <li key={x.clave}>
                      <strong>{x.persona}</strong> · {x.empleadora} · desde el {fechaCorta(x.inicio)}: {x.texto}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-gray-500">
              {c.fuera.varios_contratos ? (
                <>
                  {c.fuera.varios_contratos} {c.fuera.varios_contratos === 1 ? "relación viva tiene" : "relaciones vivas tienen"} varios contratos en WeProdu y no se {c.fuera.varios_contratos === 1 ? "puede" : "pueden"} dar de baja hasta anular el duplicado: {c.fuera.varios_contratos === 1 ? "está" : "están"} en{" "}
                  <Link to="/documents" className="underline hover:text-gray-700 dark:hover:text-gray-300">Documentos › Auditoría ARCA</Link>.{" "}
                </>
              ) : null}
              {c.fuera.varios_proyectos ? (
                <>
                  {c.fuera.varios_proyectos} {c.fuera.varios_proyectos === 1 ? "relación viva es" : "relaciones vivas son"} la misma relación cargada en varios proyectos: se {c.fuera.varios_proyectos === 1 ? "resuelve" : "resuelven"} a mano ({c.fuera.varios_proyectos === 1 ? "está" : "están"} en{" "}
                  <Link to="/documents" className="underline hover:text-gray-700 dark:hover:text-gray-300">Documentos › Auditoría ARCA</Link>). Esta lista no elige un contrato por su cuenta.{" "}
                </>
              ) : null}
              {fueraTexto.length > 0 && <>Tampoco están en la lista: {fueraTexto.join(" · ")}.</>}
            </p>
          </div>
        )}
      </div>

      {operando && <OperacionArcaModal isOpen onClose={() => setOperando(null)} ref_={operando} onHecho={() => void cargar()} />}
    </PageLayout>
  );
};

export default BajasArcaPage;
