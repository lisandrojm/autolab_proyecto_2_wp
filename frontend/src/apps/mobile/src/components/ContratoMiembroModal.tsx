import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faLock } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "./Modal";
import { projectsAPI, DetalleContratoMiembro } from "../../../../api/projects";
import { textoDeDias } from "../../../../utils/jerarquiaTurnos";

interface ContratoMiembroModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  userId: string;
  nombre: string;
}

const fecha = (iso?: string) => {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
};
const pesos = (n: number | null | undefined) => (n == null ? "" : `$ ${Number(n).toLocaleString("es-AR")}`);

/** Una fila de dato. Sin valor muestra «—»: el campo existe, sólo que no está cargado. */
const Fila = ({ label, valor }: { label: string; valor?: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0 dark:border-slate-800">
    <p className="shrink-0 pt-0.5 text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
    <div className="min-w-0 break-words text-right text-sm font-semibold text-slate-800 dark:text-slate-200">{valor === "" || valor == null ? <span className="text-slate-400">—</span> : valor}</div>
  </div>
);

/**
 * EL CONTRATO DE UN MIEMBRO, EN SÓLO LECTURA.
 *
 * Es lo mismo que «Configurar Miembro» en Gestionar Equipo del panel —pestañas Contrato y Sueldo,
 * en el mismo orden—, pero sin poder tocar nada: desde la app el coordinador del proyecto consulta,
 * no edita. Lo abre el ícono de contrato de cada persona en Mis equipos.
 *
 * Los datos opcionales (empresa del release, convenio, sucursal, obra social…) sólo aparecen si están
 * cargados: una lista llena de «—» esconde lo que sí importa.
 */
export default function ContratoMiembroModal({ isOpen, onClose, projectId, userId, nombre }: ContratoMiembroModalProps) {
  const [pestana, setPestana] = useState<"contrato" | "sueldo">("contrato");
  const [contrato, setContrato] = useState<DetalleContratoMiembro | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !projectId || !userId) return;
    let cancelado = false;
    setPestana("contrato");
    setEstado("cargando");
    setContrato(null);
    projectsAPI
      .getContratoDeMiembro(projectId, userId)
      .then((c) => {
        if (cancelado) return;
        setContrato(c);
        setEstado("listo");
      })
      .catch((e: any) => {
        if (cancelado) return;
        setError(e?.response?.data?.error || "No se pudo cargar el contrato. Probá de nuevo en un momento.");
        setEstado("error");
      });
    return () => {
      cancelado = true;
    };
  }, [isOpen, projectId, userId]);

  const c = contrato;
  const dias = c && c.diasSemana.length > 0 ? `${c.diasRotativos ? "Rota entre " : ""}${textoDeDias(c.diasSemana)}${c.diasPorSemana ? ` · ${c.diasPorSemana} por semana` : ""}` : c?.diasPorSemana ? `${c.diasPorSemana} por semana` : "";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Contrato" subtitle={c?.proyecto ? `${nombre} · ${c.proyecto}` : nombre} size="md">
      {estado === "cargando" && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      )}

      {estado === "error" && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

      {estado === "listo" && !c && (
        <div className="flex flex-col items-center rounded-xl border bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/50">
          <FontAwesomeIcon icon={faFileContract} className="mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Esta persona no tiene contrato cargado en el proyecto.</p>
        </div>
      )}

      {estado === "listo" && c && (
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <FontAwesomeIcon icon={faLock} className="h-3 w-3" /> Sólo lectura. Se edita desde Gestionar Equipo en el panel.
          </p>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
            {(
              [
                { id: "contrato", label: "Contrato" },
                { id: "sueldo", label: "Sueldo" },
              ] as const
            ).map((t) => (
              <button key={t.id} type="button" onClick={() => setPestana(t.id)} className={`rounded-lg py-2 text-xs font-bold transition-colors ${pestana === t.id ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {pestana === "contrato" ? (
            <div className="rounded-xl border border-slate-100 px-3 dark:border-slate-800">
              <Fila label="Empleado" valor={c.empleado} />
              {c.cuil && <Fila label="CUIL" valor={c.cuil} />}
              <Fila label="Rol empresa" valor={c.rolFrame} />
              <Fila label="Empresa del contrato" valor={c.empresaContrato} />
              {c.empresaRelease && <Fila label="Empresa del release" valor={c.empresaRelease} />}
              {c.convenio && <Fila label="Convenio (CCT)" valor={c.convenio} />}
              <Fila label="Categoría" valor={c.categoria} />
              <Fila label="Tipo de contrato" valor={c.tipoContrato} />
              <Fila label="Estado" valor={c.estado} />
              <Fila label="Fecha alta" valor={fecha(c.fechaAlta)} />
              <Fila
                label="Fecha baja"
                valor={
                  <span className="inline-flex items-center gap-1.5">
                    {c.fechaBaja ? fecha(c.fechaBaja) : "Indeterminado"}
                    <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${c.vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{c.vigente ? "Vigente" : "No vigente"}</span>
                  </span>
                }
              />
              <Fila label="Horario" valor={c.horario} />
              <Fila label="Días" valor={dias} />
              {c.sede && <Fila label="Sede" valor={c.sede} />}
              <Fila
                label="Área y turno"
                valor={
                  c.areasTurnos.length > 0 ? (
                    <div className="space-y-1">
                      {c.areasTurnos.map((a) => (
                        <p key={a.area} className="text-xs">
                          <span className="font-bold">{a.area}</span>
                          {a.turnos.length > 0 && <span className="font-medium text-slate-500 dark:text-slate-400"> · {a.turnos.join(", ")}</span>}
                        </p>
                      ))}
                    </div>
                  ) : (
                    ""
                  )
                }
              />
              <Fila label="Reemplazo" valor={c.reemplazo ? (c.reemplazado ? `Sí, a ${c.reemplazado}` : "Sí") : "No"} />
              {c.sucursalArca && <Fila label="Sucursal ARCA" valor={c.sucursalArca} />}
              {c.actividadArca && <Fila label="Actividad ARCA" valor={c.actividadArca} />}
              {c.obraSocial && <Fila label="Obra social" valor={c.obraSocial} />}
              {c.observaciones && <Fila label="Observaciones" valor={<span className="whitespace-pre-line text-xs font-medium">{c.observaciones}</span>} />}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-100 px-3 dark:border-slate-800">
              <Fila label="Cantidad de jornadas" valor={c.sueldo.jornadas ?? ""} />
              <Fila label="Sueldo por jornada" valor={pesos(c.sueldo.porJornada)} />
              <Fila label="Sueldo en mano" valor={pesos(c.sueldo.enMano)} />
              {c.sueldo.enManoTexto && <Fila label="Sueldo en mano (texto)" valor={<span className="text-xs font-medium">{c.sueldo.enManoTexto}</span>} />}
              <Fila label="Sueldo diario neto" valor={pesos(c.sueldo.diarioNeto)} />
              <Fila label="Diferencia diaria neto" valor={pesos(c.sueldo.diferenciaDiariaNeto)} />
              <Fila label="Sueldo neto" valor={pesos(c.sueldo.neto)} />
              <Fila label="Sueldo bruto" valor={pesos(c.sueldo.bruto)} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
