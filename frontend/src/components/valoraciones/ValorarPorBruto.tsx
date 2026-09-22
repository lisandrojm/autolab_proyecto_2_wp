import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faScaleBalanced, faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { sweetAlert } from "../../utils/sweetAlert";
import { valoracionesPorBrutoAPI, PlanValoracionPorBruto } from "../../api/valoraciones";
import { ChipValoracion } from "../proyectos/ChipValoracion";

/**
 * «VALORAR CATEGORÍAS POR BRUTO»: la regla de las categorías, aplicada a todas las funciones.
 *
 * El proyecto toma su valoración del margen; la categoría, del sueldo. Esto la pone en Roles Empresa
 * para todas las funciones de una vez —lo que antes era un script que sólo se podía correr desde el
 * servidor—. Muestra primero qué cambiaría, función por función, y recién escribe al confirmar.
 *
 * Por defecto NO toca las funciones que ya tienen categorías valoradas: eso lo decidió alguien, o la
 * regla antes. Para alinearlas todas hay que pedirlo explícitamente, y se dice que pisa lo manual.
 */
export const ValorarPorBruto: React.FC<{ onAplicado?: () => void }> = ({ onAplicado }) => {
  const [abierto, setAbierto] = useState(false);
  const [incluirValoradas, setIncluirValoradas] = useState(false);
  const [plan, setPlan] = useState<PlanValoracionPorBruto | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setCargando(true);
    setError("");
    valoracionesPorBrutoAPI
      .plan(incluirValoradas)
      .then((p) => vigente && setPlan(p))
      .catch((e) => vigente && setError(e?.response?.data?.error || "No se pudo calcular qué cambiaría."))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [abierto, incluirValoradas]);

  const nivel = (id: string | null) => (id ? plan?.niveles.find((n) => n._id === id) : undefined);
  const tag = (id: string | null) => {
    const n = nivel(id);
    return n ? <ChipValoracion nombre={n.name} color={n.color} /> : <span className="text-[11px] text-gray-400">sin valorar</span>;
  };
  const escala = [...(plan?.niveles || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  const aplicar = async () => {
    if (!plan || plan.categorias === 0) return;
    const r = await sweetAlert.confirm(
      "¿Aplicar la valoración por bruto?",
      `Se cambia la valoración de ${plan.categorias} categoría(s) en ${plan.funciones.length} función(es).${incluirValoradas ? " Incluye funciones que ya estaban valoradas: lo elegido a mano se pisa." : ""} Los contratos ya hechos no cambian.`,
      "Sí, aplicar",
    );
    if (!r.isConfirmed) return;
    setAplicando(true);
    try {
      const hecho = await valoracionesPorBrutoAPI.aplicar(incluirValoradas);
      sweetAlert.success("Listo", `Se valoraron ${hecho.categorias} categoría(s) en ${hecho.funciones} función(es).`);
      setAbierto(false);
      onAplicado?.();
    } catch (e: any) {
      sweetAlert.error("No se pudo aplicar", e?.response?.data?.error || "Intentá de nuevo en un momento.");
    } finally {
      setAplicando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <FontAwesomeIcon icon={faScaleBalanced} className="h-3.5 w-3.5" />
        Valorar categorías por bruto
      </button>

      {abierto && (
        <Modal
          isOpen={abierto}
          onClose={() => setAbierto(false)}
          title="Valorar categorías por bruto"
          subtitle="En las funciones de Roles Empresa, cada categoría toma su valoración según su sueldo"
          size="lg"
          footer={
            <div className="flex w-full items-center justify-end gap-3">
              <button type="button" onClick={() => setAbierto(false)} className="btn-secondary">
                Cancelar
              </button>
              <button type="button" onClick={() => void aplicar()} disabled={!plan || plan.categorias === 0 || cargando || aplicando} className="btn-primary disabled:opacity-50">
                {aplicando ? "Aplicando…" : plan && plan.categorias > 0 ? `Aplicar (${plan.categorias} categorías)` : "Nada para aplicar"}
              </button>
            </div>
          }
        >
          <div className="flex h-[60vh] flex-col gap-3">
            <div className="shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              <p>
                <strong>La regla, de menor a mayor:</strong> dentro de cada convenio de una función, la categoría más barata toma el nivel más bajo, la siguiente el que sigue, y las que sobran quedan en el más alto. Un proyecto del nivel más bajo recibe sola la más barata.
              </p>
              {escala.length > 0 && (
                <p className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span>Niveles, de menor a mayor:</span>
                  {escala.map((n, i) => (
                    <React.Fragment key={n._id}>
                      {i > 0 && <span className="text-gray-400">&lt;</span>}
                      <ChipValoracion nombre={n.name} color={n.color} />
                    </React.Fragment>
                  ))}
                </p>
              )}
              <p className="mt-2">Quedan sin valorar las que no tienen elección por precio: la única de su convenio, o todas al mismo sueldo. Los contratos ya hechos no cambian.</p>
            </div>

            <label className="flex shrink-0 cursor-pointer select-none items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input type="checkbox" checked={incluirValoradas} onChange={(e) => setIncluirValoradas(e.target.checked)} className="mt-0.5 rounded border-gray-300 text-blue-600" />
              <span>
                Incluir las funciones que ya tienen categorías valoradas
                <span className="block text-[11px] text-gray-500 dark:text-gray-400">Las alinea con la regla: pisa lo que se haya elegido a mano en ellas.</span>
              </span>
            </label>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              {cargando ? (
                <div className="py-10">
                  <LoadingSpinner />
                </div>
              ) : error ? (
                <p className="p-4 text-sm text-red-600 dark:text-red-400">{error}</p>
              ) : !plan || plan.funciones.length === 0 ? (
                <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
                  No hay nada para cambiar: todas las funciones ya están como dice la regla.
                  {plan && plan.salteadas.length > 0 && !incluirValoradas ? ` (${plan.salteadas.length} ya valoradas no se miraron: tildá la opción de arriba para incluirlas.)` : ""}
                </p>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {plan.funciones.map((f) => (
                    <div key={f.funcionId} className="p-3">
                      <p className="mb-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">{f.funcion}</p>
                      <table className="w-full text-xs">
                        <tbody>
                          {f.cambios.map((c) => (
                            <tr key={c.categoriaId}>
                              <td className="w-20 py-0.5 pr-2 font-mono text-[11px] text-gray-500 dark:text-gray-400">{c.convenio || "—"}</td>
                              <td className="py-0.5 pr-2 text-gray-700 dark:text-gray-300">{c.nombre}</td>
                              <td className="w-28 whitespace-nowrap py-0.5 pr-3 text-right font-mono text-gray-600 dark:text-gray-400">{c.bruto != null ? `$${Math.round(c.bruto).toLocaleString("es-AR")}` : "—"}</td>
                              <td className="w-48 whitespace-nowrap py-0.5">
                                <span className="inline-flex items-center gap-1.5">
                                  {tag(c.antes)}
                                  <FontAwesomeIcon icon={faArrowRight} className="h-2.5 w-2.5 text-gray-400" />
                                  {tag(c.despues)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {plan && !cargando && (
              <p className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">
                {plan.funciones.length} función(es) con cambios · {plan.categorias} categoría(s)
                {!incluirValoradas && plan.salteadas.length > 0 ? ` · ${plan.salteadas.length} ya valorada(s), sin tocar` : ""}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
};
