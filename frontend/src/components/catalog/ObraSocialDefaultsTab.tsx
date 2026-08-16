import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faToggleOn, faToggleOff, faBuilding, faGlobe } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { sweetAlert } from "../../utils/sweetAlert";
import { SimpleCatalogItem, SimpleCatalogApi } from "../../api/simpleCatalog";
import { companiesAPI, Company } from "../../api/companies";

interface Props {
  /** Catálogo ya cargado por el manager, para no volver a pedirlo. */
  obrasSociales: SimpleCatalogItem[];
  api: SimpleCatalogApi;
  /** Formatea el RNOS para mostrarlo (agrega los guiones). */
  formatExternalId?: (v: string) => string;
  /** Avisa al padre que cambió la global, para refrescar el badge del listado. */
  onCambio: () => void;
}

/**
 * Configuración de qué obra social se usa cuando la persona no tiene ninguna asignada.
 *
 * Misma lógica que el fraccionamiento de Vacaciones: hay un valor global y cada empresa puede
 * pisarlo con el suyo. La jerarquía al resolver los datos ARCA es:
 *
 *   obra social de la persona  >  obra social de la empresa del contrato  >  global
 *
 * Sin esto el contrato queda sin código RNOS y no puede entrar en el TXT de alta masiva de ARCA.
 */
export const ObraSocialDefaultsTab: React.FC<Props> = ({ obrasSociales, api, formatExternalId, onCambio }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);

  const global = obrasSociales.find((o) => (o.data as { porDefecto?: boolean } | undefined)?.porDefecto);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setCompanies(await companiesAPI.list());
      } catch {
        sweetAlert.error("Error", "No se pudieron cargar las empresas.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const etiqueta = (os?: SimpleCatalogItem): string => (os ? `${os.name}${os.externalId ? ` · RNOS ${formatExternalId ? formatExternalId(os.externalId) : os.externalId}` : ""}` : "—");

  const cambiarGlobal = async (idOS: string) => {
    setGuardando("global");
    try {
      // Sin selección se desmarca la global: quedan sin respaldo los contratos sin obra social.
      if (!idOS) {
        if (global) await api.setPorDefecto(global._id, false);
      } else {
        await api.setPorDefecto(idOS, true);
      }
      onCambio();
      sweetAlert.success("Guardado", "Obra social global actualizada.");
    } catch {
      sweetAlert.error("Error", "No se pudo guardar la obra social global.");
    } finally {
      setGuardando(null);
    }
  };

  const cambiarEmpresa = async (empresa: Company, obraSocialDefaultId: number | null) => {
    const previas = companies;
    setCompanies((prev) => prev.map((c) => (c._id === empresa._id ? { ...c, obraSocialDefaultId } : c)));
    setGuardando(empresa._id);
    try {
      await companiesAPI.update(empresa._id, { obraSocialDefaultId });
    } catch {
      sweetAlert.error("Error", "No se pudo guardar la obra social de la empresa.");
      setCompanies(previas);
    } finally {
      setGuardando(null);
    }
  };

  /** Busca en el catálogo por `data.id`, que es como se referencian las obras sociales. */
  const porDataId = (id?: number | null): SimpleCatalogItem | undefined => (id == null ? undefined : obrasSociales.find((o) => Number((o.data as { id?: number } | undefined)?.id) === id));

  const selectClass = "px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 max-w-xs";

  if (loading) return <LoadingSpinner message="Cargando empresas..." />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Obra social por defecto</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">Se usa para completar el código RNOS cuando la persona no tiene obra social asignada. Cada empresa puede tener la suya; si no, se aplica la global.</p>
        <div className="mt-2 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 p-2 rounded flex flex-col items-start gap-1">
          <p className="ml-1">
            <strong>Para qué sirve:</strong> sin código RNOS el contrato no puede entrar en el TXT de alta masiva de ARCA.
          </p>
          <p className="ml-1 font-bold">Jerarquía de aplicación: Obra social de la persona &gt; Empresa del contrato &gt; Global</p>
        </div>
      </div>

      {/* Global */}
      <div className="mb-8 bg-blue-50 dark:bg-blue-900/20 p-4 rounded border border-blue-100 dark:border-blue-800">
        <h4 className="text-md font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
          <FontAwesomeIcon icon={faGlobe} className="h-4 w-4" />
          Configuración Global
        </h4>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm text-gray-700 dark:text-gray-300">Obra social:</label>
          <select value={global?._id || ""} onChange={(e) => cambiarGlobal(e.target.value)} disabled={guardando === "global"} className={selectClass}>
            <option value="">Sin obra social por defecto</option>
            {obrasSociales.map((o) => (
              <option key={o._id} value={o._id}>
                {etiqueta(o)}
              </option>
            ))}
          </select>
          {guardando === "global" && <FontAwesomeIcon icon={faSpinner} spin className="text-blue-600 dark:text-blue-400" />}
        </div>
        {!global && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Sin una obra social global, los contratos de personas sin obra social van a quedar con el RNOS vacío.</p>}
      </div>

      {/* Por empresa */}
      <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <FontAwesomeIcon icon={faBuilding} className="h-3.5 w-3.5" />
        Por empresa
      </h4>
      {companies.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay empresas cargadas.</p>
      ) : (
        <div className="space-y-2">
          {companies.map((c) => {
            const usaGlobal = c.obraSocialDefaultId == null;
            const propia = porDataId(c.obraSocialDefaultId);
            const efectiva = usaGlobal ? global : propia;
            return (
              <div key={c._id} className="border border-gray-200 dark:border-gray-700 rounded p-3 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{c.razonSocial}</p>
                  {c.cuit && <p className="text-xs text-gray-500 dark:text-gray-400">CUIT {c.cuit}</p>}
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => cambiarEmpresa(c, usaGlobal ? Number((global?.data as { id?: number } | undefined)?.id) || null : null)}
                    disabled={guardando === c._id || (usaGlobal && !global)}
                    title={usaGlobal && !global ? "Primero elegí una obra social global" : undefined}
                    className={`px-3 py-1.5 rounded border text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50 ${
                      usaGlobal
                        ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300"
                        : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"
                    }`}
                  >
                    <FontAwesomeIcon icon={usaGlobal ? faToggleOn : faToggleOff} />
                    Usar Global
                  </button>

                  {!usaGlobal && (
                    <select
                      value={c.obraSocialDefaultId ?? ""}
                      onChange={(e) => cambiarEmpresa(c, e.target.value ? Number(e.target.value) : null)}
                      disabled={guardando === c._id}
                      className={selectClass}
                    >
                      {obrasSociales.map((o) => (
                        <option key={o._id} value={Number((o.data as { id?: number } | undefined)?.id)}>
                          {etiqueta(o)}
                        </option>
                      ))}
                    </select>
                  )}

                  {guardando === c._id && <FontAwesomeIcon icon={faSpinner} spin className="text-blue-600 dark:text-blue-400" />}

                  <div className="flex flex-col items-end min-w-[140px]">
                    <span className="text-xs text-gray-400 italic truncate max-w-[220px]" title={etiqueta(efectiva)}>
                      Efectivo: {efectiva ? efectiva.name : "sin definir"}
                    </span>
                    {efectiva?.externalId && <span className="text-[10px] text-gray-400 italic">RNOS {formatExternalId ? formatExternalId(efectiva.externalId) : efectiva.externalId}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
