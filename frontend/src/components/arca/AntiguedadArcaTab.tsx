import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faChevronDown, faChevronRight, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { arcaRelacionesAPI, type AntiguedadFila, type EmpresaConCuit, type EstadoSyncRelaciones, type RelacionLaboral } from "../../api/arcaRelaciones";
import { BotonOrden, useOrdenTabla } from "../ui/OrdenTabla";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { sweetAlert } from "../../utils/sweetAlert";
import { TablaRelacionesArca } from "./TablaRelacionesArca";
import { TablaConEncabezadoFijo } from "../ui/TablaConEncabezadoFijo";
import { EncabezadoSincronizacionArca } from "./EncabezadoSincronizacionArca";

/*
  ANTIGÜEDAD SEGÚN ARCA: la copia local de las relaciones laborales de Simplificación Registral y la
  antigüedad de cada persona calculada sobre ella (ver `server/src/utils/antiguedadArca.ts`). Arriba,
  la sincronización: cuándo corre sola, cómo le fue la última vez y «Sincronizar ahora». Abajo, la
  tabla por persona: con «Todas las empresas» se ven las filas globales (las tres empleadoras
  juntas, sin contar dos veces los días solapados); con una empresa, las de esa empleadora.
*/

const fmtCuil = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);
const fechaCorta = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
/** "5,53 años"; los días van debajo, en gris. */
const anios = (a: number) => `${a.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} años`;
const dias = (d: number) => `${d.toLocaleString("es-AR")} días`;

const th = "px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 text-left";
const td = "px-4 py-3 text-sm text-gray-700 dark:text-gray-300";

export const AntiguedadArcaTab: React.FC<{ onCountChange?: (n: number | undefined) => void }> = ({ onCountChange }) => {
  const [estado, setEstado] = useState<EstadoSyncRelaciones | null>(null);
  const [empresas, setEmpresas] = useState<EmpresaConCuit[]>([]);
  const [filas, setFilas] = useState<AntiguedadFila[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [empresaCuit, setEmpresaCuit] = useState("");
  const [q, setQ] = useState("");
  const [qAplicada, setQAplicada] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [relaciones, setRelaciones] = useState<Record<string, RelacionLaboral[] | "cargando">>({});

  const razonSocialDe = useCallback((cuit: string) => empresas.find((e) => e.cuit === cuit)?.razonSocial || cuit, [empresas]);

  const cargarFilas = useCallback(async () => {
    try {
      const r = await arcaRelacionesAPI.antiguedad({ empresaCuit: empresaCuit || undefined, q: qAplicada || undefined });
      setEmpresas(r.empresas);
      setFilas(r.filas);
      setTotal(r.total);
      onCountChange?.(r.total);
    } catch (err: any) {
      sweetAlert.error("No se pudo cargar la antigüedad", err?.response?.data?.error || err?.message || "");
    } finally {
      setCargando(false);
    }
  }, [empresaCuit, qAplicada, onCountChange]);

  useEffect(() => { void cargarFilas(); }, [cargarFilas]);
  // La búsqueda va al server, con una pausa corta para no pedir por cada tecla.
  useEffect(() => { const t = setTimeout(() => setQAplicada(q.trim()), 350); return () => clearTimeout(t); }, [q]);

  const toggleFila = async (cuil: string) => {
    if (abierta === cuil) { setAbierta(null); return; }
    setAbierta(cuil);
    if (!relaciones[cuil]) {
      setRelaciones((r) => ({ ...r, [cuil]: "cargando" }));
      try {
        const lista = await arcaRelacionesAPI.relacionesDe(cuil);
        setRelaciones((r) => ({ ...r, [cuil]: lista }));
      } catch (err: any) {
        setRelaciones((r) => { const { [cuil]: _x, ...resto } = r; return resto; });
        sweetAlert.error("No se pudieron cargar las relaciones", err?.response?.data?.error || err?.message || "");
      }
    }
  };

  const { ordenados, orden, alternar } = useOrdenTabla(
    filas,
    useMemo(() => ({
      colaborador: (f: AntiguedadFila) => f.apellidoNombre,
      primeraAlta: (f: AntiguedadFila) => f.primeraAlta,
      antiguedad: (f: AntiguedadFila) => f.antiguedadDesdePrimeraAlta.dias,
      trabajados: (f: AntiguedadFila) => f.diasTrabajados,
      contratos: (f: AntiguedadFila) => f.cantidadContratos,
      ultima: (f: AntiguedadFila) => f.ultimaFecha,
    }), []),
    { columna: "colaborador", direccion: "asc", porDefecto: true },
  );

  return (
    <div className="space-y-6">
      {/* La sincronización: el mismo encabezado que Gestión › Bajas ARCA (`EncabezadoSincronizacionArca`). */}
      <EncabezadoSincronizacionArca onEstado={setEstado} onSincronizada={() => void cargarFilas()} />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por apellido o CUIL…"
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm w-72"
        />
        <select value={empresaCuit} onChange={(e) => setEmpresaCuit(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm">
          <option value="">Todas las empresas (global)</option>
          {empresas.map((e) => <option key={e.cuit} value={e.cuit}>{e.razonSocial}</option>)}
        </select>
        <span className="text-xs text-gray-500">{total.toLocaleString("es-AR")} persona(s)</span>
        <span className="text-[11px] text-gray-400 inline-flex items-center gap-1" title="Antigüedad: días corridos desde la primera alta hasta hoy, con huecos. Trabajados: días de cada relación sumados, sin contar dos veces los que se solapan; una relación abierta cuenta hasta hoy.">
          <FontAwesomeIcon icon={faCircleInfo} /> Antigüedad vs. trabajados
        </span>
      </div>

      {/* La tabla */}
      {cargando ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : filas.length === 0 ? (
        <p className="text-sm text-gray-500 py-10 text-center">
          {estado && estado.totales.relaciones === 0 ? "Todavía no hay relaciones cargadas: corré el seed desde los TXT de Dropbox o «Sincronizar ahora»." : "No hay personas que coincidan."}
        </p>
      ) : (
        <TablaConEncabezadoFijo className="rounded-xl border border-gray-200 dark:border-gray-700" tabla="min-w-full">
          <thead>
            <tr>
              <th className={th}><BotonOrden columna="colaborador" orden={orden} onAlternar={alternar}>Colaborador</BotonOrden></th>
              {!empresaCuit && <th className={th}>Empresas</th>}
              <th className={th}><BotonOrden columna="primeraAlta" orden={orden} onAlternar={alternar}>Primera alta</BotonOrden></th>
              <th className={th}><BotonOrden columna="antiguedad" orden={orden} onAlternar={alternar}>Antigüedad</BotonOrden></th>
              <th className={th}><BotonOrden columna="trabajados" orden={orden} onAlternar={alternar}>Trabajados</BotonOrden></th>
              <th className={th}><BotonOrden columna="contratos" orden={orden} onAlternar={alternar}># Contratos</BotonOrden></th>
              <th className={th}><BotonOrden columna="ultima" orden={orden} onAlternar={alternar}>Última fecha</BotonOrden></th>
            </tr>
          </thead>
          <tbody>
            {ordenados.map((f) => {
              const clave = `${f.cuil}|${f.empleadoraCuit || ""}`;
              const desplegada = abierta === f.cuil;
              const rel = relaciones[f.cuil];
              return (
                <React.Fragment key={clave}>
                  <tr className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={() => void toggleFila(f.cuil)}>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={desplegada ? faChevronDown : faChevronRight} className="h-3 w-3 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{f.apellidoNombre || "—"}</p>
                          <p className="text-xs text-gray-500 font-mono">{fmtCuil(f.cuil)}{f.tieneRelacionAbierta && <span className="ml-2 px-1.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 text-[10px] font-bold uppercase">activa</span>}</p>
                        </div>
                      </div>
                    </td>
                    {!empresaCuit && <td className={`${td} text-xs`}>{f.empresas.map(razonSocialDe).join(" · ")}</td>}
                    <td className={`${td} whitespace-nowrap`}>{fechaCorta(f.primeraAlta)}</td>
                    <td className={`${td} whitespace-nowrap`} title={dias(f.antiguedadDesdePrimeraAlta.dias)}>{anios(f.antiguedadDesdePrimeraAlta.anios)}<span className="block text-[11px] text-gray-400">{dias(f.antiguedadDesdePrimeraAlta.dias)}</span></td>
                    <td className={`${td} whitespace-nowrap`}>{anios(f.aniosTrabajados)}<span className="block text-[11px] text-gray-400">{dias(f.diasTrabajados)}</span></td>
                    <td className={`${td} text-center`}>{f.cantidadContratos}</td>
                    <td className={`${td} whitespace-nowrap`}>{fechaCorta(f.ultimaFecha)}</td>
                  </tr>
                  {desplegada && (
                    <tr className="bg-gray-50 dark:bg-gray-900/40">
                      <td colSpan={empresaCuit ? 6 : 7} className="px-6 py-3">
                        {rel === "cargando" || !rel ? (
                          <span className="text-xs text-gray-500"><FontAwesomeIcon icon={faSpinner} spin /> Cargando relaciones…</span>
                        ) : (
                          <TablaRelacionesArca relaciones={rel} razonSocialDe={razonSocialDe} />
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </TablaConEncabezadoFijo>
      )}
    </div>
  );
};

export default AntiguedadArcaTab;
