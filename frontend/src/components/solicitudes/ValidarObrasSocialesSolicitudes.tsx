import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faSpinner, faXmark, faMinus } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { projectsAPI } from "../../api/projects";
import { companiesAPI } from "../../api/companies";

/*
  VALIDAR LA OBRA SOCIAL DESDE SOLICITUDES, sobre las APROBADAS.

  Es la MISMA corrida que «Validar obras sociales» de Contratos: el servidor entra a ARCA con el
  usuario de clave fiscal y fija el RNOS en los contratos. Por eso sólo sirve con aprobadas: una
  pendiente todavía no tiene contrato donde guardarlo.

  El server valida de a UNA empleadora (la obra social se valida contra el CUIT que la declara) y
  corre de a una corrida por vez, así que las solicitudes se agrupan por empleadora y se corren en
  fila. Los CUIL se mandan para ACOTAR: el server sigue decidiendo quién está pendiente, y quien ya
  tenía la obra social validada no se vuelve a consultar.
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

  useEffect(() => {
    companiesAPI
      .list({ slim: true })
      .then((cs) => setEmpresas(Object.fromEntries(cs.map((c: any) => [String(c._id), c.razonSocial || c.name || ""]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    cortado.current = false;
    const poner = (cuil: string, r: Resultado) => setResultados((p) => ({ ...p, [cuil]: r }));

    const correr = async () => {
      const porEmpresa = new Map<string, FilaObraSocial[]>();
      for (const f of filas) porEmpresa.set(f.empresaId, [...(porEmpresa.get(f.empresaId) || []), f]);

      for (const [empresaId, grupo] of porEmpresa) {
        if (cortado.current) break;
        const cuils = grupo.map((f) => soloDigitos(f.cuit));
        setFase("Abriendo ARCA en el servidor…");
        let total = 0;
        try {
          total = (await projectsAPI.validarObrasSocialesEnServidor(empresaId, cuils)).total;
        } catch (e: any) {
          // Casi siempre es «falta configurar algo», y el texto del server ES la instrucción.
          for (const c of cuils) poner(c, { estado: "error", detalle: e?.response?.data?.error || "El servidor no aceptó la corrida." });
          continue;
        }
        if (!total) {
          for (const c of cuils) poner(c, { estado: "sin_pendiente", detalle: "Ya estaba validada, o no tiene contrato pendiente en esa empleadora." });
          continue;
        }

        // Seguir la corrida: el server devuelve TODOS los eventos en cada vuelta.
        for (;;) {
          if (cortado.current) break;
          await esperar(2000);
          let r: Awaited<ReturnType<typeof projectsAPI.estadoValidacionServidor>>;
          try {
            r = await projectsAPI.estadoValidacionServidor();
          } catch {
            continue; // un traspié de red no corta el seguimiento
          }
          for (const ev of r.eventos as any[]) {
            const cuil = soloDigitos(ev.cuil || "");
            if (ev.tipo === "conectado") setFase("Adentro de ARCA. Buscando la pantalla de altas…");
            else if (ev.tipo === "consultando" && cuil) {
              setFase("Consultando…");
              poner(cuil, { estado: "consultando" });
            } else if (ev.tipo === "resultado" && cuil) poner(cuil, { estado: "listo", detalle: ev.rnos ? `RNOS ${ev.rnos}` : "Sin declarar en ARCA: rige la del convenio" });
            else if (ev.tipo === "error" && cuil) poner(cuil, { estado: "error", detalle: ev.motivo || "No se pudo validar" });
            else if (ev.tipo === "guardando") setFase("Guardando lo que devolvió ARCA…");
            else if (ev.tipo === "fallo") for (const c of cuils) setResultados((p) => (p[c]?.estado === "listo" ? p : { ...p, [c]: { estado: "error", detalle: ev.mensaje } }));
          }
          if (!r.corriendo) break;
        }
        // Lo que la corrida no tocó dentro de esta empleadora: no estaba pendiente.
        setResultados((p) => {
          const n = { ...p };
          for (const c of cuils) if (n[c]?.estado === "en_cola" || n[c]?.estado === "consultando") n[c] = { estado: "sin_pendiente", detalle: "La corrida no la consultó: no quedó pendiente." };
          return n;
        });
      }
      setFase("");
      setCorriendo(false);
      onTerminado();
    };
    void correr();
    return () => {
      cortado.current = true;
    };
    // Una sola corrida por apertura del modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detener = async () => {
    cortado.current = true;
    try {
      await projectsAPI.detenerValidacionServidor();
    } catch {
      /* si ya no había corrida, no hay nada que frenar */
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
