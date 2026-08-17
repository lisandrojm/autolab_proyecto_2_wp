import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faBuilding, faGlobe, faArrowUpRightFromSquare, faCheck } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { sweetAlert } from "../../utils/sweetAlert";
import { SimpleCatalogItem, SimpleCatalogApi, createSimpleCatalogApi } from "../../api/simpleCatalog";
import { companiesAPI, Company } from "../../api/companies";
import { usersAPI, type ContractOverviewRow } from "../../api/users";
import { categoriaSatAPI } from "../../api/categoriasSat";
import { contratosAPI } from "../../api/contratos";
import { arcaSucursalesAPI } from "../../api/arcaSucursales";
import { resolveAfipValues, type AfipCatalogs } from "../contratos/afipCompleteness";

/**
 * Cuántos contratos están resolviendo su RNOS con la obra social GLOBAL.
 *
 * Reusa la misma `resolveAfipValues` que el checklist de cada contrato, así el número no puede
 * discrepar de lo que el operador ve fila por fila. Se calcula acá y no en el server porque la
 * cascada vive en el front: duplicarla del otro lado sería garantizar que se desincronicen.
 *
 * Solo se monta cuando la pestaña "Por defecto" está abierta (el manager renderiza la pestaña activa
 * y nada más), así que no encarece el resto del catálogo.
 */
const UsoDeLaGlobal: React.FC = () => {
  const [estado, setEstado] = useState<{ cargando: boolean; total: number; convenios: string[] } | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setEstado({ cargando: true, total: 0, convenios: [] });
      try {
        const [{ rows }, categorias, tipos, obrasSociales, empresas, sucursales, convenios] = await Promise.all([
          usersAPI.listContractsOverview({ limit: 2000 }),
          categoriaSatAPI.list(),
          contratosAPI.list().catch(() => []),
          createSimpleCatalogApi("/obras-sociales").list(),
          companiesAPI.list(),
          arcaSucursalesAPI.list().catch(() => []),
          createSimpleCatalogApi("/convenios").list(),
        ]);
        const cat = { categorias, tipos, obrasSociales, sedes: [], empresas, sucursales, convenios } as unknown as AfipCatalogs;
        // Se resuelve UNA vez por fila y se reusa: `resolveAfipValues` recorre todos los catálogos, y
        // llamarla dos veces por contrato duplicaría el trabajo sobre ~2.000 filas.
        const resueltos = rows.map((r: ContractOverviewRow) => resolveAfipValues(r, cat));
        const conGlobal = resueltos.filter((v) => v.rnosOrigen === "global");
        const porConvenio = [...new Set(conGlobal.map((v) => v.convenioCategoria).filter(Boolean))];
        if (vivo) setEstado({ cargando: false, total: conGlobal.length, convenios: porConvenio });
      } catch {
        if (vivo) setEstado(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (!estado) return null;
  if (estado.cargando) return <p className="mt-3 text-xs text-gray-400 italic">Calculando cuántos contratos la están usando…</p>;

  if (estado.total === 0) {
    return (
      <p className="mt-3 inline-flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
        <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
        Ningún contrato está usando la global: todos resuelven por convenio, por persona o por su empleadora.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">
        {estado.total} contrato(s) están usando la obra social global
      </p>
      <p className="text-xs text-amber-800 dark:text-amber-400 mt-1">
        Significa que falta configurar algo aguas arriba: lo más probable es que el convenio de su categoría no tenga obra social cargada.
        {estado.convenios.length > 0 && (
          <>
            {" "}
            Los convenios involucrados son <strong>{estado.convenios.join(", ")}</strong>.
          </>
        )}{" "}
        Se carga en Configuración → ARCA → Convenios, y arregla todos los contratos de ese CCT de una vez.
      </p>
    </div>
  );
};

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
 * La obra social GLOBAL: el último recurso de la cascada.
 *
 *   persona  >  convenio de su categoría (o la excepción de la empresa)  >  para los EXCLUIDOS de
 *   convenio, la de su empleadora  >  global
 *
 * El comentario anterior decía "persona > empresa > global" y quedó incorrecto: la obra social la
 * define el sindicato y al sindicato lo define el CCT, así que el convenio va ANTES que la empresa —
 * y la empresa solo decide para quienes no tienen sindicato.
 *
 * Por eso esta pantalla dejó de EDITAR el valor por empresa: esa decisión vive en la ficha de cada
 * empleadora. Acá quedó el valor global, el panorama por empresa en solo lectura, y el contador de
 * cuántos contratos están cayendo en la global — que es la señal de que falta configurar un convenio.
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

  // La edición por empresa vive en la ficha de cada una (Empresa → ARCA → Obras Sociales). Acá se
  // muestra el estado y se linkea: una decisión, un lugar.

  /** Busca en el catálogo por `data.id`, que es como se referencian las obras sociales. */
  const porDataId = (id?: number | null): SimpleCatalogItem | undefined => (id == null ? undefined : obrasSociales.find((o) => Number((o.data as { id?: number } | undefined)?.id) === id));

  const selectClass = "px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 max-w-xs";

  if (loading) return <LoadingSpinner message="Cargando empresas..." />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Obra social global</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">Es el ÚLTIMO RECURSO de la cascada: se usa solo cuando no se pudo resolver nada aguas arriba.</p>
        <div className="mt-2 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 p-2 rounded flex flex-col items-start gap-1">
          <p className="ml-1">
            <strong>Para qué sirve:</strong> sin código RNOS el contrato no puede entrar en el TXT de alta masiva de ARCA.
          </p>
          {/* La jerarquía que decía esta pantalla ("persona > empresa > global") quedó vieja y era
              directamente incorrecta: el convenio va ANTES que la empresa, y la empresa solo decide
              para los excluidos de convenio. */}
          <p className="ml-1 font-bold">Cascada: obra social de la persona &gt; la del convenio de su categoría &gt; para los excluidos de convenio, la de su empleadora &gt; la global</p>
          <p className="ml-1">
            En la Argentina la obra social la define el sindicato, y al sindicato lo define el CCT. Si un contrato termina usando la global, <strong>falta configurar algo aguas arriba</strong>: lo más probable es que su convenio no tenga obra social cargada.
          </p>
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

        {/* Cuántos contratos están CAYENDO acá hoy. Es la diferencia entre "puede haber un problema"
            y "hay 14 contratos con este problema": si un contrato usa la global, su convenio no tiene
            obra social cargada, y eso se arregla en un solo lugar para todos los de ese CCT. */}
        <UsoDeLaGlobal />
      </div>

      {/*
       * Por empresa: SOLO LECTURA con link a la ficha.
       *
       * Acá se podía editar el mismo dato que en la ficha de cada empresa: dos caminos para una
       * decisión, y ninguno decía cuál mandaba. La decisión vive en un solo lugar —la ficha— y esto
       * queda como panorama de en qué estado está cada empleadora.
       */}
      <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-2">
        <FontAwesomeIcon icon={faBuilding} className="h-3.5 w-3.5" />
        Excluidos de convenio, por empresa
      </h4>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Cada empleadora define qué obra social usan sus trabajadores excluidos de convenio (9999/99). Se edita en la ficha de la empresa.</p>
      {companies.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay empresas cargadas.</p>
      ) : (
        <div className="space-y-2">
          {companies.map((c) => {
            const propia = porDataId(c.obraSocialDefaultId);
            return (
              <div key={c._id} className="border border-gray-200 dark:border-gray-700 rounded p-3 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{c.razonSocial}</p>
                  {c.cuit && <p className="text-xs text-gray-500 dark:text-gray-400">CUIT {c.cuit}</p>}
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-right min-w-[180px]">
                    {propia ? (
                      <>
                        <span className="block text-sm text-gray-900 dark:text-gray-100 truncate max-w-[260px]" title={etiqueta(propia)}>
                          {propia.name}
                        </span>
                        {propia.externalId && <span className="block text-[11px] text-gray-400 font-mono">RNOS {formatExternalId ? formatExternalId(propia.externalId) : propia.externalId}</span>}
                      </>
                    ) : (
                      <span className="block text-xs text-gray-400 italic">Sin definir → usa la global{global ? `: ${global.name}` : ' (que tampoco está definida)'}</span>
                    )}
                  </div>
                  <Link to={`/empresas/${c._id}/arca/obras-sociales`} className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                    Configurar en su ficha
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
