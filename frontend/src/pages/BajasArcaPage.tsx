import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExcel, faLandmark, faSpinner, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { TablaConEncabezadoFijo } from "../components/ui/TablaConEncabezadoFijo";
import { SearchAndFilters, type FilterOption } from "../components/ui/SearchAndFilters";
import { BotonOrden, useOrdenTabla } from "../components/ui/OrdenTabla";
import { Paginador, POR_PAGINA } from "../components/ui/Paginador";
import { nombreDeArchivo } from "../utils/exportarTablaExcel";
import { sweetAlert } from "../utils/sweetAlert";
import { EncabezadoSincronizacionArca } from "../components/arca/EncabezadoSincronizacionArca";
import { OperacionesArcaHistorial } from "../components/arca/OperacionesArcaHistorial";
import { OperacionArcaModal } from "../components/contratos/OperacionArcaModal";
import { fechaHoraCorta as fechaHora, hayMovimientos, MovimientosBajasArca as Movimientos, resumenDeConteos } from "../components/arca/MovimientosBajasArca";
import { TIPOS_DE_RELACION } from "@compartido/arca/modalidadArca";
import { arcaOperacionesAPI, SITUACIONES_BAJA_ARCA, type ConteosBajaArca, type EnWeproduBajaArca, type FilaBajaArca, type ListaBajasArca, type MotivoBloqueoBajaArca, type ReferenciaContratoArca, type SituacionBajaArca } from "../api/arcaOperaciones";

/*
  BAJAS ARCA (22/11/2026, pedido del usuario): UNA sola lista, y el único lugar desde donde se da de baja una
  relación en ARCA. Reemplaza a «A.R.C.A Bajas» (Pendientes / Operaciones / Para revisar) y a los íconos que había en
  la bandeja Contratos y en Antigüedad ARCA.

  Una fila por CADA relación viva del espejo de ARCA (abierta, o con fin de hoy en adelante). La situación (1 a 6),
  el orden, los conteos, el tipo y las filas bloqueadas los decide el server (`services/arca/listaBajasArca.ts`),
  con la regla compartida de «se puede operar»; acá sólo se filtra, se ordena y se dibuja.

   - SIN CHIPS: el patrón del resto de la app. Buscador + embudo que abre «Filtros avanzados», con el contador de
     filtros activos en el botón y lo aplicado como etiquetas que se quitan con la ✕. Sólo filtros que tienen que
     ver con bajas: empresa, tipo, situación, qué hay en WeProdu, proyecto, fecha de inicio y «sólo pendientes».
   - SIN NINGÚN FILTRO SE VE TODO, ordenado por situación (1 a 6) y, dentro de cada una, por días desde el fin. El
     pie dice el total, que tiene que ser igual a las relaciones vivas del espejo (el server las cuenta aparte): si
     no coincide, la lista tiene un error y se avisa en rojo.
   - El número del menú sigue siendo la suma de 1 a 4: el trabajo pendiente. La 5 y la 6 son inventario.
   - Las filas BLOQUEADAS (la misma relación en varios proyectos: Quinteiro, Yorio) se ven, al final, con el botón
     deshabilitado y el motivo. Siguen también en Auditoría ARCA. La lista no elige un contrato por su cuenta.
   - Las relaciones declaradas con la modalidad de directores (LRT) llevan una advertencia en la fila; el panel
     muestra la misma (`compartido/arca/modalidadArca.ts`).
   - PAGINADA (50 por página, `ui/Paginador`): la lista está entera en memoria, así que el buscador, los filtros y
     el orden trabajan siempre sobre el total y lo que se recorta es lo que se dibuja. El número entre paréntesis
     del título es el total de la lista (con filtros, cuántas coinciden); lo pendiente está en la pestaña y el menú.
   - El botón «Excel» exporta TODO lo filtrado, en el orden elegido, no sólo la página: por eso es propio y no el de
     la tabla, que baja lo que está dibujado.
   - «Operaciones» (lo que se mandó y su resultado) es la segunda pestaña.
   - Debajo de los filtros, la foto de la corrida de las 06:00 y qué cambió desde entonces: un número que cambia
     tiene que poder explicarse. «Sincronizar ahora» no reemplaza la foto, pero el encabezado muestra la diferencia
     contra ella apenas termina, y la lista se actualiza con lo que trajo.
*/

type Pestana = "bajas" | "operaciones";

const DIAS_PLAZO_BAJA = 5;
const SITUACIONES: SituacionBajaArca[] = [1, 2, 3, 4, 5, 6];
const fmtCuil = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);
const fechaCorta = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const th = "px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 text-left";
const td = "px-4 py-3 text-sm text-gray-700 dark:text-gray-300";

const TONO: Record<SituacionBajaArca, string> = {
  1: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800",
  2: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-800",
  3: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700",
  4: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-800",
  5: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600",
  6: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-800",
};
const TONO_BLOQUEADA = "bg-white text-gray-600 border-dashed border-gray-400 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-500";

/** Las filas bloqueadas no tienen número de situación: en el filtro y en el pie van por su motivo. */
const ETIQUETA_BLOQUEO: Record<MotivoBloqueoBajaArca, string> = { varios_proyectos: "Varios proyectos", varios_contratos: "Contrato duplicado", baja_presentada: "Baja ya presentada", no_se_opera: "No se opera" };
const BLOQUEOS = Object.keys(ETIQUETA_BLOQUEO) as MotivoBloqueoBajaArca[];
const claveDeSituacion = (f: FilaBajaArca) => (f.situacion !== null ? String(f.situacion) : `b:${f.bloqueo?.motivo || ""}`);
const esPendiente = (f: FilaBajaArca) => f.situacion !== null && f.situacion <= 4;

const EN_WEPRODU: { value: EnWeproduBajaArca; label: string }[] = [
  { value: "con_contrato", label: "Con contrato" },
  { value: "sin_contrato", label: "Sin contrato (la persona tiene ficha)" },
  { value: "sin_ficha", label: "Persona sin ficha" },
];

const conteoDe = (c: ConteosBajaArca, s: SituacionBajaArca) => c[`s${s}` as "s1"] ?? 0;
const porNombre = (a: FilterOption, b: FilterOption) => a.label.localeCompare(b.label, "es");

export const BajasArcaPage: React.FC = () => {
  const [pestana, setPestana] = useState<Pestana>("bajas");
  const [lista, setLista] = useState<ListaBajasArca | null>(null);
  const [error, setError] = useState("");
  const [verCambios, setVerCambios] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  // Se guarda el objeto: el panel vuelve a leer cuando cambia la referencia, y uno nuevo en cada render lo haría leer sin parar.
  const [operando, setOperando] = useState<ReferenciaContratoArca | null>(null);

  // Los filtros. Vacíos = sin filtrar: la lista muestra todo.
  const [buscar, setBuscar] = useState("");
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [situaciones, setSituaciones] = useState<string[]>([]);
  const [proyectos, setProyectos] = useState<string[]>([]);
  const [enWeprodu, setEnWeprodu] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setError("");
      setLista(await arcaOperacionesAPI.lista());
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "No se pudo leer la lista.");
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const todas = useMemo(() => lista?.filas || [], [lista]);

  // Las opciones salen de lo que hay en la lista: no se ofrece filtrar por algo que no existe.
  const opciones = useMemo(() => {
    const empresa = new Map<string, string>();
    const tipo = new Set<string>();
    const proyecto = new Set<string>();
    const bloqueo = new Set<MotivoBloqueoBajaArca>(["varios_proyectos"]);
    for (const f of todas) {
      empresa.set(f.empleadoraCuit, f.empleadora);
      tipo.add(f.tipo);
      for (const p of f.proyectos) proyecto.add(p);
      if (f.bloqueo) bloqueo.add(f.bloqueo.motivo);
    }
    const otrosTipos = [...tipo].filter((t) => !TIPOS_DE_RELACION.includes(t)).sort((a, b) => a.localeCompare(b, "es"));
    return {
      empresas: [...empresa].map(([value, label]) => ({ value, label })).sort(porNombre),
      // Indeterminado, plazo fijo y jornada siempre; el resto (directores LRT u otro), sólo si hay alguno.
      tipos: [...TIPOS_DE_RELACION.filter((t, i) => i < 3 || tipo.has(t)), ...otrosTipos].map((t) => ({ value: t, label: t })),
      situaciones: [...SITUACIONES.map((s) => ({ value: String(s), label: `${s}. ${SITUACIONES_BAJA_ARCA[s]}` })), ...BLOQUEOS.filter((m) => bloqueo.has(m)).map((m) => ({ value: `b:${m}`, label: ETIQUETA_BLOQUEO[m] }))],
      proyectos: [...proyecto].map((p) => ({ value: p, label: p })).sort(porNombre),
    };
  }, [todas]);

  const q = sinTildes(buscar.trim());
  const qDigitos = buscar.replace(/\D/g, "");
  const filtradas = useMemo(
    () =>
      todas.filter(
        (f) =>
          (!q || sinTildes(`${f.persona} ${f.empleadora}`).includes(q) || (qDigitos.length >= 3 && f.cuil.includes(qDigitos))) &&
          (!empresas.length || empresas.includes(f.empleadoraCuit)) &&
          (!tipos.length || tipos.includes(f.tipo)) &&
          (!situaciones.length || situaciones.includes(claveDeSituacion(f))) &&
          // Una relación en varios proyectos aparece al filtrar por cualquiera de ellos.
          (!proyectos.length || f.proyectos.some((p) => proyectos.includes(p))) &&
          (!enWeprodu || f.enWeprodu === enWeprodu) &&
          (!desde || f.inicio >= desde) &&
          (!hasta || f.inicio <= hasta) &&
          (!soloPendientes || esPendiente(f)),
      ),
    [todas, q, qDigitos, empresas, tipos, situaciones, proyectos, enWeprodu, desde, hasta, soloPendientes],
  );
  // Sin orden elegido queda el del server: situación 1 a 6 (las bloqueadas al final) y días desde el fin.
  const { ordenados: filas, orden, alternar } = useOrdenTabla(filtradas, {
    empresa: (f) => f.empleadora,
    tipo: (f) => f.tipo,
    inicio: (f) => f.inicio,
    situacion: (f) => f.situacion ?? 90 + BLOQUEOS.indexOf(f.bloqueo?.motivo as MotivoBloqueoBajaArca),
  });

  // Cambiar la búsqueda, un filtro o el orden vuelve a la primera página: lo que se buscaba puede no estar en la que se miraba.
  useEffect(() => { setPagina(1); }, [q, qDigitos, empresas, tipos, situaciones, proyectos, enWeprodu, desde, hasta, soloPendientes, orden]);
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  // Si la lista se achicó (una sincronización, una baja), no quedarse en una página que ya no existe.
  const paginaActual = Math.min(pagina, paginas);
  const visibles = useMemo(() => filas.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA), [filas, paginaActual]);

  /** TODO lo filtrado, en el orden que se ve, no sólo la página. */
  const exportar = async () => {
    if (exportando || !filas.length) return;
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const encabezado = ["Persona", "CUIL", "Empresa", "Tipo", "Tipo de contrato en WeProdu", "Proyecto", "Modalidad en ARCA", "Inicio", "Fin en ARCA", "Fin en WeProdu", "Días desde el fin", "Situación", "Detalle", "Advertencia"];
      const fecha = (iso: string) => (iso ? fechaCorta(iso) : "");
      const cuerpo = filas.map((f) => [
        f.persona,
        fmtCuil(f.cuil),
        f.empleadora,
        f.tipo,
        f.tipoContrato,
        f.proyecto,
        f.modalidadArca,
        fecha(f.inicio),
        fecha(f.finArca),
        fecha(f.finWeprodu),
        f.diasDesdeFin ?? "",
        f.situacion !== null ? `${f.situacion}. ${SITUACIONES_BAJA_ARCA[f.situacion]}` : f.bloqueo?.etiqueta || "",
        f.bloqueo ? f.bloqueo.texto : f.detalle,
        f.advertencia,
      ]);
      const hoja = XLSX.utils.aoa_to_sheet([encabezado, ...cuerpo]);
      hoja["!cols"] = encabezado.map((h, i) => ({ wch: Math.min(60, Math.max(h.length, ...cuerpo.map((r) => String(r[i] ?? "").length)) + 2) }));
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, "Bajas ARCA");
      const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
      XLSX.writeFile(libro, `${nombreDeArchivo("Bajas ARCA")}-${hoy}.xlsx`);
    } catch (e: any) {
      sweetAlert.error("No se pudo exportar", e?.message || "No se pudo armar el archivo de Excel.");
    } finally {
      setExportando(false);
    }
  };

  const abrir = (f: FilaBajaArca) =>
    setOperando(f.contrato ? { userProjectId: f.contrato.userProjectId, contratoKey: f.contrato.contratoKey, contractIndex: f.contrato.posicion } : { userProjectId: "", relacion: { empleadoraCuit: f.empleadoraCuit, cuil: f.cuil, fechaInicio: f.inicio } });

  const c = lista?.conteos;
  const hayFiltros = !!q || empresas.length > 0 || tipos.length > 0 || situaciones.length > 0 || proyectos.length > 0 || !!enWeprodu || !!desde || !!hasta || soloPendientes;
  const noCoincide = !!lista && lista.filas.length !== lista.vivasEnEspejo;
  const bloqueadasDelPie = c ? BLOQUEOS.filter((m) => c.bloqueadas?.[m]).map((m) => `${ETIQUETA_BLOQUEO[m].toLowerCase()}: ${c.bloqueadas![m]}`) : [];

  return (
    <PageLayout
      title="Bajas ARCA"
      subtitle="Todas las relaciones laborales vivas en ARCA y qué hay que hacer con cada una. Es el único lugar desde donde se da de baja."
      faIcon={{ icon: faLandmark }}
      itemCount={lista ? filas.length : undefined}
      infoModal={{
        isOpen: ayuda,
        onOpen: () => setAyuda(true),
        onClose: () => setAyuda(false),
        title: "Bajas ARCA",
        size: "md",
        content: (
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <p>Una fila por cada relación laboral <strong>viva en ARCA</strong> (abierta, o con fecha de fin de hoy en adelante): todas las que hoy se pueden dar de baja. Cada fila tiene una sola situación:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li><strong>Terminado en WeProdu:</strong> el contrato tiene fecha de baja pasada y en ARCA la relación sigue abierta. Falta presentar la baja.</li>
              <li><strong>Termina antes de su fecha:</strong> contrato a plazo cuya baja en WeProdu es anterior al fin que tiene ARCA.</li>
              <li><strong>Baja presentada, sin confirmar:</strong> se mandó desde acá y no se leyó el resultado, o quedó en error de navegación. Mirá la relación en ARCA antes de volver a mandar.</li>
              <li><strong>Sin contrato en WeProdu:</strong> ARCA tiene la relación y WeProdu no tiene un contrato con esa persona, empleadora y fecha de inicio. La fila dice si la persona no tiene ficha o si tiene ficha pero no ese contrato: alguien de laboral tiene que decir si falta cargar el contrato o sobra la relación.</li>
              <li><strong>Indeterminado vigente:</strong> abierto de los dos lados. Es inventario, no trabajo pendiente.</li>
              <li><strong>Plazo vigente:</strong> plazo fijo o jornada que ARCA cierra sola en su fecha. También es inventario, pero se puede dar de baja antes de su fecha.</li>
            </ol>
            <p>El número del menú es la suma de las situaciones 1 a 4: lo pendiente. La 5 y la 6 no cuentan.</p>
            <p><strong>Con el botón deshabilitado</strong> quedan las relaciones que desde acá no se pueden operar, con el motivo en la fila. Hoy son las que están cargadas en varios proyectos: se resuelven a mano (esta lista no elige un contrato por su cuenta) y están también en Documentos › Auditoría ARCA.</p>
            <p>El embudo abre los <strong>filtros</strong> (empresa, tipo, situación, contrato en WeProdu, proyecto, fecha de inicio, sólo pendientes); sin ninguno se ve todo. El número al lado del título es el total de la lista (con filtros, cuántas coinciden). Se ven de a {POR_PAGINA}; el botón «Excel» exporta todo lo filtrado, no sólo la página.</p>
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
              {p.cantidad !== undefined && <span title="Pendientes: la suma de las situaciones 1 a 4." className={`ml-2 px-1.5 py-0.5 rounded-full text-[11px] ${p.cantidad ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800"}`}>{p.cantidad}</span>}
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
            <SearchAndFilters
              searchTerm={buscar}
              onSearchChange={setBuscar}
              searchPlaceholder="Buscar por persona, CUIL o empresa…"
              dateFilter={{ label: "Fecha de inicio", startDate: desde, endDate: hasta, onStartDateChange: setDesde, onEndDateChange: setHasta }}
              selectFilters={[{ label: "Contrato en WeProdu", value: enWeprodu, onChange: setEnWeprodu, options: EN_WEPRODU, placeholder: "Con o sin contrato" }]}
              multiSelectFilters={[
                { label: "Empresa", values: empresas, onChange: setEmpresas, options: opciones.empresas, placeholder: "Todas las empresas" },
                { label: "Tipo de contrato", values: tipos, onChange: setTipos, options: opciones.tipos, placeholder: "Todos los tipos" },
                { label: "Situación", values: situaciones, onChange: setSituaciones, options: opciones.situaciones, placeholder: "Todas las situaciones" },
                { label: "Proyecto", values: proyectos, onChange: setProyectos, options: opciones.proyectos, placeholder: "Todos los proyectos" },
              ]}
              switchFilters={[{ label: "Solo pendientes (situaciones 1 a 4)", value: soloPendientes, onChange: setSoloPendientes }]}
            />

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
                <p>Todavía no hay una corrida automática guardada: la sincronización de las 06:00 deja la foto de esta lista (cuántas hay en cada una de las seis situaciones y cuáles) para poder decir después qué cambió y por qué.</p>
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
              <p className="text-sm text-gray-500 py-10 text-center">{hayFiltros ? "Ninguna relación coincide con la búsqueda y los filtros." : "No hay relaciones vivas en ARCA."}</p>
            ) : (
              <>
              <div className="flex justify-end">
                <button type="button" onClick={() => void exportar()} disabled={exportando} title={`Exportar a Excel ${filas.length === 1 ? "la relación" : `las ${filas.length} relaciones`} de la lista${hayFiltros ? " (lo filtrado)" : ""}, no sólo esta página`} className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50">
                  <FontAwesomeIcon icon={exportando ? faSpinner : faFileExcel} spin={exportando} />
                  Excel
                </button>
              </div>
              <TablaConEncabezadoFijo className="rounded-xl border border-gray-200 dark:border-gray-700" tabla="min-w-full" sinExportar>
                <thead>
                  <tr>
                    <th className={th}>Persona</th>
                    <th className={th}>CUIL</th>
                    <th className={th}><BotonOrden columna="empresa" orden={orden} onAlternar={alternar}>Empresa</BotonOrden></th>
                    <th className={th}><BotonOrden columna="tipo" orden={orden} onAlternar={alternar}>Tipo de contrato</BotonOrden></th>
                    <th className={th}><BotonOrden columna="inicio" orden={orden} onAlternar={alternar}>Inicio</BotonOrden></th>
                    <th className={th}>Fin en WeProdu</th>
                    <th className={th}>Días desde el fin</th>
                    <th className={th}><BotonOrden columna="situacion" orden={orden} onAlternar={alternar}>Situación</BotonOrden></th>
                    <th className={`${th} col-acciones`}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f) => {
                    const vencido = (f.diasDesdeFin ?? 0) > DIAS_PLAZO_BAJA;
                    const ayudaDelBoton = f.bloqueo
                      ? f.bloqueo.texto
                      : f.situacion === 3
                        ? "Abre el panel de la relación: muestra lo que se mandó. Mirá ARCA antes de volver a mandar."
                        : f.contrato
                          ? `Abre el panel de la relación en ARCA con este contrato, con la fecha de fin del contrato ya cargada.${f.situacion === 6 ? " Es un plazo vigente: ARCA lo cierra sola en su fecha, pero se puede dar de baja antes." : ""}`
                          : "Abre el panel «sin contrato»: la operación se hace en ARCA igual y queda en el registro de operaciones.";
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
                            <>
                              {f.tipo}
                              <span className="block text-xs text-gray-500" title="No hay contrato en WeProdu: es la modalidad que declara ARCA para esta relación.">En ARCA: {f.modalidadArca || "sin modalidad"}</span>
                            </>
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
                          {f.situacion !== null ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${TONO[f.situacion]}`}>{f.situacion}. {SITUACIONES_BAJA_ARCA[f.situacion]}</span>
                          ) : (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${TONO_BLOQUEADA}`}>{f.bloqueo?.etiqueta || "No se opera"}</span>
                          )}
                          {f.detalle && <span className={`block mt-1 text-xs ${f.sinFicha ? "font-semibold text-purple-700 dark:text-purple-300" : "text-gray-500"}`}>{f.detalle}</span>}
                          {f.bloqueo && <span className="block mt-1 text-xs text-gray-600 dark:text-gray-400 max-w-xs">{f.bloqueo.texto}</span>}
                          {f.advertencia && (
                            <span className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 max-w-xs">
                              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              {f.advertencia}
                            </span>
                          )}
                        </td>
                        <td className={`${td} col-acciones`}>
                          {/* El `title` va en el span: un botón deshabilitado no muestra el suyo. */}
                          <span title={ayudaDelBoton} className="inline-block">
                            <button
                              type="button"
                              onClick={() => abrir(f)}
                              disabled={!!f.bloqueo}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors ${f.bloqueo ? "text-gray-400 dark:text-gray-500 opacity-60 cursor-not-allowed" : "text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"}`}
                            >
                              <FontAwesomeIcon icon={faLandmark} className="h-3.5 w-3.5" />
                              {f.situacion === 3 ? "Revisar" : "Dar de baja"}
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </TablaConEncabezadoFijo>
              <Paginador total={filas.length} pagina={paginaActual} onCambiar={setPagina} entidadPlural="relaciones" />
              </>
            )}

            {/* EL PIE: el total, que tiene que ser igual a las relaciones vivas del espejo. */}
            <div className="text-xs text-gray-500 space-y-1">
              <p>
                {hayFiltros ? <>Mostrando <strong>{filas.length}</strong> de </> : null}
                <strong>{lista.filas.length}</strong> {lista.filas.length === 1 ? "relación viva" : "relaciones vivas"} en ARCA · {SITUACIONES.map((s) => `${s}: ${conteoDe(c, s)}`).join(" · ")}
                {bloqueadasDelPie.length > 0 && <> · {bloqueadasDelPie.join(" · ")}</>}. Pendientes (1 a 4): <strong>{c.pendientes}</strong>.
              </p>
              {noCoincide && (
                <p className="rounded border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-2 py-1.5 font-semibold text-red-700 dark:text-red-300">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 mr-1.5" />
                  La lista tiene {lista.filas.length} filas y el espejo de ARCA tiene {lista.vivasEnEspejo} relaciones vivas. Tienen que coincidir: es un error de la lista, no de los datos. Avisá a sistemas.
                </p>
              )}
              {(c.bloqueadas?.varios_proyectos || c.bloqueadas?.varios_contratos) ? (
                <p>
                  Las relaciones con varios contratos en WeProdu están también en{" "}
                  <Link to="/documents" className="underline hover:text-gray-700 dark:hover:text-gray-300">Documentos › Auditoría ARCA</Link>: si es la misma relación en varios proyectos, se resuelve a mano; si es un contrato duplicado, se anula el que sobra y la fila toma su situación.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {operando && <OperacionArcaModal isOpen onClose={() => setOperando(null)} ref_={operando} onHecho={() => void cargar()} />}
    </PageLayout>
  );
};

export default BajasArcaPage;
