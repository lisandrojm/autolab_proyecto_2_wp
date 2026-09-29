import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faSpinner, faXmark, faMinus, faStethoscope, faLock, faCircleCheck, faTrash, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { projectsAPI } from "../../api/projects";
import { companiesAPI } from "../../api/companies";
import type { ObraSocialDeSolicitud } from "../../api/users";
import { sweetAlert } from "../../utils/sweetAlert";

/*
  VALIDAR LA OBRA SOCIAL DESDE SOLICITUDES, sobre las APROBADAS.

  Es la MISMA corrida que «Validar obras sociales» de Contratos: el servidor entra a ARCA con el
  usuario de clave fiscal y fija el RNOS en los contratos. Por eso sólo sirve con aprobadas: una
  pendiente todavía no tiene contrato donde guardarlo.

  El server corre una corrida por vez, así que se valida DE A UNA PERSONA, en fila (ver `correr`).
  El CUIL se manda para ACOTAR: el server sigue decidiendo quién está pendiente, y quien ya tenía la
  obra social validada no se vuelve a consultar.
*/

export interface FilaObraSocial {
  id: string;
  nombre: string;
  cuit: string;
  empresaId: string;
}

type Resultado = { estado: "en_cola" | "consultando" | "listo" | "error" | "sin_pendiente"; detalle?: string };

const soloDigitos = (v: string) => String(v || "").replace(/\D/g, "");
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const ValidarObrasSocialesSolicitudes: React.FC<{ filas: FilaObraSocial[]; onCerrar: () => void; onTerminado: () => void }> = ({ filas, onCerrar, onTerminado }) => {
  const [resultados, setResultados] = useState<Record<string, Resultado>>(() => Object.fromEntries(filas.map((f) => [soloDigitos(f.cuit), { estado: "en_cola" as const }])));
  const [fase, setFase] = useState("Preparando…");
  const [corriendo, setCorriendo] = useState(true);
  const [empresas, setEmpresas] = useState<Record<string, string>>({});
  const cortado = useRef(false);
  /** Si la corrida que está andando en el server es la NUESTRA: «Detener» no frena la de otra pantalla. */
  const propia = useRef(false);

  useEffect(() => {
    companiesAPI
      .list({ slim: true })
      .then((cs) => setEmpresas(Object.fromEntries(cs.map((c: any) => [String(c._id), c.razonSocial || c.name || ""]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    /*
      Corte PROPIO de esta ejecución del efecto. Con la ref compartida, el doble montaje de React en
      desarrollo dejaba DOS corridas vivas —la limpieza ponía la ref en true y la segunda ejecución la
      volvía a false—, y la segunda chocaba con la primera: «Ya hay una validación en curso».
    */
    let desmontado = false;
    const parar = () => desmontado || cortado.current;
    const poner = (cuil: string, r: Resultado) => setResultados((p) => ({ ...p, [cuil]: r }));

    /** Espera a que el server no tenga ninguna corrida andando (de esta pantalla o de cualquier otra). */
    const esperarLibre = async () => {
      for (let vuelta = 0; !parar(); vuelta++) {
        try {
          const e = await projectsAPI.estadoValidacionServidor();
          if (!e.corriendo) return;
          if (vuelta === 0 || vuelta % 5 === 0) setFase(`Hay otra validación de ARCA en curso${e.total ? ` (${e.total} persona${e.total === 1 ? "" : "s"})` : ""}: espero a que termine…`);
        } catch {
          /* un traspié de red no corta la espera */
        }
        await esperar(3000);
      }
    };

    /** Una persona, de principio a fin: arranca su corrida y la sigue hasta que el server la termina. */
    const validarUna = async (f: FilaObraSocial) => {
      const cuil = soloDigitos(f.cuit);
      for (let intento = 0; intento < 5 && !parar(); intento++) {
        await esperarLibre();
        if (parar()) return;
        setFase(`Validando a ${f.nombre}: abriendo ARCA en el servidor…`);
        poner(cuil, { estado: "consultando" });
        let total = 0;
        try {
          total = (await projectsAPI.validarObrasSocialesEnServidor(f.empresaId, [cuil])).total;
          propia.current = total > 0;
        } catch (e: any) {
          const msg = String(e?.response?.data?.error || "");
          // Otra corrida se adelantó entre la espera y el arranque: se vuelve a esperar.
          if (/en curso/i.test(msg)) continue;
          // Casi siempre es «falta configurar algo», y el texto del server ES la instrucción.
          poner(cuil, { estado: "error", detalle: msg || "El servidor no aceptó la corrida." });
          return;
        }
        if (!total) {
          poner(cuil, { estado: "sin_pendiente", detalle: "Ya estaba validada, o no tiene contrato pendiente en esa empleadora." });
          return;
        }
        // Seguir la corrida: el server devuelve TODOS los eventos en cada vuelta, y esta corrida es sólo de esta persona.
        let resuelta = false;
        for (;;) {
          if (parar()) return;
          await esperar(2000);
          let r: Awaited<ReturnType<typeof projectsAPI.estadoValidacionServidor>>;
          try {
            r = await projectsAPI.estadoValidacionServidor();
          } catch {
            continue;
          }
          for (const ev of r.eventos as any[]) {
            const c = soloDigitos(ev.cuil || "");
            if (ev.tipo === "conectado") setFase(`Validando a ${f.nombre}: adentro de ARCA…`);
            else if (ev.tipo === "resultado" && c === cuil) {
              resuelta = true;
              poner(cuil, { estado: "listo", detalle: ev.rnos ? `RNOS ${ev.rnos}` : "Sin declarar en ARCA: rige la del convenio" });
            } else if (ev.tipo === "error" && c === cuil) {
              resuelta = true;
              poner(cuil, { estado: "error", detalle: ev.motivo || "No se pudo validar" });
            } else if (ev.tipo === "guardando") setFase(`Validando a ${f.nombre}: guardando lo que devolvió ARCA…`);
            else if (ev.tipo === "fallo" && !resuelta) {
              resuelta = true;
              poner(cuil, { estado: "error", detalle: ev.mensaje });
            }
          }
          if (!r.corriendo) break;
        }
        propia.current = false;
        if (!resuelta) poner(cuil, { estado: "sin_pendiente", detalle: "La corrida no la consultó: no quedó pendiente." });
        return;
      }
      if (!parar()) poner(cuil, { estado: "error", detalle: "El servidor siguió ocupado con otras validaciones. Probá de nuevo en un rato." });
    };

    /*
      DE A UNA PERSONA, EN FILA.

      El server corre una sola validación de ARCA por vez (por organización), y todas las de esta
      tanda iban en un único pedido: si en ese momento había otra andando —otra pestaña, Contratos, un
      reintento—, las catorce volvían con «Ya hay una validación en curso». Ahora se espera a que el
      server quede libre y se valida a cada persona en su propia corrida, así una que falla no arrastra
      a las demás y cada fila dice lo suyo.
    */
    const correr = async () => {
      for (const f of filas) {
        if (parar()) break;
        await validarUna(f);
      }
      // La ejecución descartada (doble montaje) no cierra nada: el modal lo sigue la que quedó viva.
      if (desmontado) return;
      setFase("");
      setCorriendo(false);
      onTerminado();
    };
    void correr();
    return () => {
      desmontado = true;
    };
    // Una sola corrida por apertura del modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detener = async () => {
    cortado.current = true;
    if (propia.current) {
      try {
        await projectsAPI.detenerValidacionServidor();
      } catch {
        /* si ya no había corrida, no hay nada que frenar */
      }
    }
    setCorriendo(false);
    setFase("");
    onTerminado();
  };

  const hechas = Object.values(resultados).filter((r) => r.estado !== "en_cola" && r.estado !== "consultando").length;

  return (
    <Modal isOpen onClose={corriendo ? () => {} : onCerrar} title="Validar obras sociales" subtitle={corriendo ? `${hechas} de ${filas.length} · lo hace el servidor · se guardan solas al llegar` : `${hechas} de ${filas.length} resueltas`} size="lg" zIndex={90}>
      <div className="space-y-3">
        {fase && (
          <p className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
            <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" />
            {fase}
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400 dark:border-gray-700">
                <th className="px-3 py-2">Persona</th>
                <th className="px-3 py-2">CUIL</th>
                <th className="px-3 py-2">Empleadora</th>
                <th className="px-3 py-2">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const r = resultados[soloDigitos(f.cuit)] || { estado: "en_cola" };
                return (
                  <tr key={f.id} className="border-b border-gray-100 last:border-0 dark:border-gray-700/60">
                    <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{f.nombre}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-300">{f.cuit}</td>
                    <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">{empresas[f.empresaId] || "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.estado === "en_cola" && <span className="text-gray-400">en cola</span>}
                      {r.estado === "consultando" && (
                        <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                          <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" /> consultando…
                        </span>
                      )}
                      {r.estado === "listo" && (
                        <span className="inline-flex items-center gap-1.5 text-green-700 dark:text-green-400">
                          <FontAwesomeIcon icon={faCheck} className="h-3 w-3" /> {r.detalle}
                        </span>
                      )}
                      {r.estado === "sin_pendiente" && (
                        <span className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                          <FontAwesomeIcon icon={faMinus} className="h-3 w-3" /> {r.detalle}
                        </span>
                      )}
                      {r.estado === "error" && (
                        <span className="inline-flex items-start gap-1.5 text-red-600 dark:text-red-400">
                          <FontAwesomeIcon icon={faXmark} className="mt-0.5 h-3 w-3 shrink-0" /> <span className="whitespace-pre-line">{r.detalle}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          {corriendo ? (
            <button type="button" onClick={() => void detener()} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:border-red-400 hover:text-red-600 dark:border-gray-600 dark:text-gray-200">
              Detener
            </button>
          ) : (
            <button type="button" onClick={onCerrar} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
              Listo
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

/**
 * CELDA «OBRA SOCIAL» DE SOLICITUDES: la misma lectura que la columna de Contratos, sobre el contrato
 * que dejó la aprobación.
 *
 *  - sin contrato (pendiente, rechazada): un guión — todavía no hay dónde guardarla;
 *  - sin validar y con empleadora: el botón «Validar obra social», que abre la corrida con esa fila;
 *  - sin validar y sin empleadora: apagado, con el motivo en el título;
 *  - validada: el RNOS con candado (la devolvió ARCA) o «Convenio» con tilde (ARCA no tiene
 *    afiliación propia, rige la del convenio), y el tacho para volver a dejarla sin validar.
 *
 * Sin el código del convenio en el caso «Convenio»: sale de la cascada categoría → convenio que arma
 * la grilla de Contratos con todos sus catálogos, y repetirla acá para un dato de tooltip no vale.
 */
export const ObraSocialSolicitudCell: React.FC<{
  os: ObraSocialDeSolicitud | null | undefined;
  nombre: string;
  ocupado: boolean;
  onValidar: (fila: FilaObraSocial) => void;
  onQuitada: () => void;
}> = ({ os, nombre, ocupado, onValidar, onQuitada }) => {
  const [quitando, setQuitando] = useState(false);
  if (!os) return <span className="text-xs text-gray-400">—</span>;

  const cuil = soloDigitos(os.cuil);
  if (os.estado === "sin_constatar") {
    const puede = !!os.empresaContratoId && cuil.length === 11;
    if (puede) {
      return (
        <button
          type="button"
          onClick={() => onValidar({ id: `${os.userId}:${os.contratoId}`, nombre, cuit: cuil, empresaId: String(os.empresaContratoId) })}
          disabled={ocupado}
          title={`Validar la obra social de este contrato contra ARCA${os.empresaNombre ? `, como empleada de ${os.empresaNombre}` : ""}.`}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          <FontAwesomeIcon icon={faStethoscope} className="h-3 w-3" />
          Validar obra social
        </button>
      );
    }
    return (
      <span
        title={!os.empresaContratoId ? "Todavía no se puede validar: el contrato no tiene Empresa Contrato. Asignala en Contratos." : "Todavía no se puede validar: la persona no tiene un CUIL válido."}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 opacity-70 whitespace-nowrap"
      >
        <FontAwesomeIcon icon={faStethoscope} className="h-3 w-3" />
        Sin validar
        <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
      </span>
    );
  }

  const fecha = os.constatadaEl ? new Date(os.constatadaEl).toLocaleDateString("es-AR") : "";
  const deArca = os.estado === "afiliada";
  const titulo = deArca
    ? `${os.nombre || "Obra social"} — la devolvió ARCA${fecha ? ` el ${fecha}` : ""} · queda fija, no editable.`
    : `Validada en ARCA${fecha ? ` el ${fecha}` : ""}: el organismo no tiene afiliación propia para esta persona, así que rige la del convenio.`;

  // Mismo quitar que la grilla de Contratos: `forzar` porque lo sellado en ARCA el server no lo pisa.
  const quitar = async () => {
    const r = await sweetAlert.confirm(
      "¿Quitar la obra social?",
      `${nombre}: el contrato vuelve a quedar SIN VALIDAR y no entra en el TXT hasta validarlo de nuevo en ARCA.`,
      "Sí, quitar",
    );
    if (!r.isConfirmed) return;
    setQuitando(true);
    try {
      await projectsAPI.updateObraSocialContrato(os.projectId, os.userId, os.contratoId as never, { obraSocialId: null, origen: "manual", forzar: true });
      onQuitada();
    } catch (e: any) {
      sweetAlert.error("No se pudo", e?.response?.data?.error || "No se pudo quitar la obra social.");
    } finally {
      setQuitando(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span title={titulo} className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400">
        <FontAwesomeIcon icon={deArca ? faLock : faCircleCheck} className="h-3 w-3 shrink-0" />
        {deArca ? <span className="font-mono">{soloDigitos(os.rnos) || "—"}</span> : "Convenio"}
      </span>
      <button
        type="button"
        onClick={() => void quitar()}
        disabled={quitando || ocupado}
        title="Quitar la obra social: el contrato vuelve a quedar sin validar"
        aria-label="Quitar la obra social"
        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
      >
        <FontAwesomeIcon icon={quitando ? faSpinner : faTrash} spin={quitando} className="h-3 w-3" />
      </button>
    </span>
  );
};
