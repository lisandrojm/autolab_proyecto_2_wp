import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { TablaConEncabezadoFijo } from "../ui/TablaConEncabezadoFijo";
import { sweetAlert } from "../../utils/sweetAlert";
import { arcaRelacionesAPI, type ItemBajaArca, type PlanBajasArca, type TipoCambioBaja } from "../../api/arcaRelaciones";

/*
  SINCRONIZAR BAJAS (etapa 3, paso 2, 19/11/2026): llevar a los CONTRATOS las bajas que ARCA ya tiene.

  Hasta acá la baja de ARCA se aplicaba sólo en memoria al validar un alta: el contrato seguía sin baja,
  y el equipo, la antigüedad, los recibos y las renovaciones lo veían abierto (Becerini, despedido en
  febrero de 2025, figuraba vigente). Esto la escribe en el contrato, con evidencia fuerte: misma persona,
  misma empleadora y fecha de alta exacta.

  Primero se ve qué cambiaría; se aplica a lo marcado. Lo que NO se escribe se muestra igual, con por qué,
  para que alguien lo mire. Lee el espejo de Relaciones Laborales: lo que ARCA cambió después de la última
  sincronización no está (por eso se dice la fecha).
*/

const fecha = (iso: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

const NO_SE_ESCRIBEN: { tipo: TipoCambioBaja; titulo: string; explicacion: string; filtro?: (x: ItemBajaArca) => boolean }[] = [
  { tipo: "arca_abierta", titulo: "Terminados que en ARCA siguen abiertos", explicacion: "El contrato terminó pero ARCA no tiene la baja: falta presentarla en ARCA." },
  { tipo: "revision_manual", titulo: "Para revisar a mano", explicacion: "Cada fila dice por qué: tramos de ARCA que no explica ningún contrato, otro contrato con la misma alta, un hecho (renuncia, despido) en medio de varios tramos, o recibos de sueldo posteriores a la baja de ARCA. Lo mira una persona." },
  { tipo: "arca_granularidad", titulo: "ARCA declara por jornadas dentro del contrato", explicacion: "ARCA termina antes por «vencimiento de plazo», con todos sus tramos dentro del contrato: es cómo ARCA registra las jornadas, no un hecho que cortó la relación. Manda el plazo del contrato." },
  { tipo: "arca_posterior", titulo: "ARCA terminó más de 3 días después que el contrato", explicacion: "No se alarga un contrato desde ARCA. Las de 1 a 3 días (lo habitual en jornadas) no se listan.", filtro: (x) => dias(x.bajaContrato, x.finArca) > 3 },
];

const Fila: React.FC<{ x: ItemBajaArca; marcado?: boolean; onMarcar?: (v: boolean) => void }> = ({ x, marcado, onMarcar }) => (
  <tr className="border-t border-gray-100 dark:border-gray-700 align-top">
    {onMarcar && (
      <td className="px-2 py-1.5">
        <input type="checkbox" checked={!!marcado} onChange={(e) => onMarcar(e.target.checked)} aria-label={`Escribir la baja de ${x.persona}`} />
      </td>
    )}
    <td className="px-2 py-1.5">
      <div className="font-semibold text-gray-800 dark:text-gray-100">{x.persona}</div>
      <div className="text-[11px] text-gray-500">{x.proyecto} · {x.empleadora}</div>
    </td>
    <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{x.contrato}<div className="text-[11px] text-gray-500">alta {fecha(x.alta)}</div></td>
    <td className="px-2 py-1.5 whitespace-nowrap">
      <span className="text-gray-500 line-through decoration-gray-400">{x.bajaContrato ? fecha(x.bajaContrato) : "sin baja"}</span> → <span className="font-semibold text-gray-900 dark:text-white">{x.finArca ? fecha(x.finArca) : "abierta"}</span>
    </td>
    <td className="px-2 py-1.5 text-[11px] text-gray-600 dark:text-gray-400">{x.situacionBaja || "—"}{x.alerta && <div className="mt-0.5 text-amber-700 dark:text-amber-400">{x.alerta}</div>}</td>
  </tr>
);

const Encabezado: React.FC<{ conMarca?: boolean; todas?: boolean; onTodas?: (v: boolean) => void }> = ({ conMarca, todas, onTodas }) => (
  <thead>
    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 bg-gray-50 dark:bg-gray-900/40">
      {conMarca && <th className="px-2 py-1.5 w-8"><input type="checkbox" checked={!!todas} onChange={(e) => onTodas?.(e.target.checked)} aria-label="Marcar todas" /></th>}
      <th className="px-2 py-1.5">Persona</th>
      <th className="px-2 py-1.5">Contrato</th>
      <th className="px-2 py-1.5">Baja WeProdu → ARCA</th>
      <th className="px-2 py-1.5">Motivo en ARCA</th>
    </tr>
  </thead>
);

export const SincronizarBajasModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [plan, setPlan] = useState<PlanBajasArca | null>(null);
  const [error, setError] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = async () => {
    setPlan(null);
    setError("");
    try {
      const p = await arcaRelacionesAPI.planBajas();
      setPlan(p);
      setMarcadas(new Set(p.items.filter((x) => x.aplicar).map((x) => x.contratoKey)));
    } catch (e: any) {
      setError(e?.response?.data?.error || "No se pudo calcular qué bajas faltan.");
    }
  };
  useEffect(() => {
    if (isOpen) void cargar();
  }, [isOpen]);

  const aEscribir = useMemo(() => (plan?.items || []).filter((x) => x.aplicar), [plan]);

  const aplicar = async () => {
    const claves = aEscribir.filter((x) => marcadas.has(x.contratoKey)).map((x) => x.contratoKey);
    if (!claves.length) return;
    const ok = await sweetAlert.confirm("Escribir las bajas de ARCA", `Se les pone a ${claves.length} contrato(s) la fecha de baja que tiene ARCA. Queda en el historial de cada contrato, a tu nombre.`, "Sí, escribirlas", "Cancelar");
    if (!ok.isConfirmed) return;
    setAplicando(true);
    try {
      const r = await arcaRelacionesAPI.aplicarBajas(claves);
      await sweetAlert.success("Listo", `${r.escritos.length} baja(s) escritas.${r.cambiaron.length ? ` ${r.cambiaron.length} contrato(s) cambiaron mientras tanto y no se tocaron.` : ""}`);
      await cargar();
    } catch (e: any) {
      sweetAlert.error("No se pudieron escribir", e?.response?.data?.error || "Probá de nuevo en un momento.");
    } finally {
      setAplicando(false);
    }
  };

  const marcar = (k: string, v: boolean) => setMarcadas((s) => { const n = new Set(s); v ? n.add(k) : n.delete(k); return n; });
  const cantMarcadas = aEscribir.filter((x) => marcadas.has(x.contratoKey)).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title="Sincronizar bajas de ARCA a los contratos"
      subtitle={plan ? `Espejo de ARCA al ${plan.espejoAl ? new Date(plan.espejoAl).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—"} · sólo con la misma persona, empleadora y fecha de alta exacta` : undefined}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Cerrar</button>
          <button type="button" onClick={() => void aplicar()} disabled={!cantMarcadas || aplicando} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {aplicando ? "Escribiendo…" : `Escribir ${cantMarcadas} baja${cantMarcadas === 1 ? "" : "s"}`}
          </button>
        </div>
      }
    >
      {error ? (
        <p className="text-sm text-rose-700 dark:text-rose-300">{error} <button type="button" className="underline" onClick={() => void cargar()}>Reintentar</button></p>
      ) : !plan ? (
        <LoadingSpinner message="Cargando datos..." />
      ) : (
        <div className="space-y-5 text-sm">
          <p className="text-gray-600 dark:text-gray-300">
            Contratos a los que ARCA ya les dio de baja y en WeProdu siguen abiertos (o con una baja posterior por renuncia o despido). Se escribe la fecha de ARCA y queda registrado de dónde salió. Lo que ARCA cambió después de la última sincronización de Relaciones Laborales no está: si hace falta, primero «Sincronizar ahora».
          </p>
          <section>
            <h4 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Se escriben ({aEscribir.length})</h4>
            {aEscribir.length === 0 ? (
              <p className="text-gray-500">No falta ninguna: los contratos ya tienen las bajas que tiene ARCA.</p>
            ) : (
              <TablaConEncabezadoFijo className="rounded-lg border border-gray-200 dark:border-gray-700" tabla="w-full text-xs">
                <Encabezado conMarca todas={cantMarcadas === aEscribir.length} onTodas={(v) => setMarcadas(v ? new Set(aEscribir.map((x) => x.contratoKey)) : new Set())} />
                <tbody>{aEscribir.map((x) => <Fila key={x.contratoKey} x={x} marcado={marcadas.has(x.contratoKey)} onMarcar={(v) => marcar(x.contratoKey, v)} />)}</tbody>
              </TablaConEncabezadoFijo>
            )}
          </section>
          {NO_SE_ESCRIBEN.map((g) => {
            const l = plan.items.filter((x) => x.tipo === g.tipo && (!g.filtro || g.filtro(x)));
            if (!l.length) return null;
            const ver = abierto === g.tipo;
            return (
              <section key={g.tipo}>
                <button type="button" onClick={() => setAbierto(ver ? null : g.tipo)} className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-200">
                  <FontAwesomeIcon icon={ver ? faChevronDown : faChevronRight} className="h-3 w-3" />
                  No se escriben: {g.titulo} ({l.length})
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 ml-5 mt-0.5">{g.explicacion}</p>
                {ver && (
                  <TablaConEncabezadoFijo className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700" tabla="w-full text-xs">
                    <Encabezado />
                    <tbody>{l.map((x) => <Fila key={x.contratoKey} x={x} />)}</tbody>
                  </TablaConEncabezadoFijo>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Modal>
  );
};

export default SincronizarBajasModal;
