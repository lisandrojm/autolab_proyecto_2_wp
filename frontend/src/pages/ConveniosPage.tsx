import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faArrowUpRightFromSquare, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../api/simpleCatalog";
import { companiesAPI, Company } from "../api/companies";
import { sweetAlert } from "../utils/sweetAlert";
import { formatRnos } from "../utils/rnos";
import { InfoModal } from "../components/ui/InfoModal";
import { Modal } from "../components/ui/Modal";
import { ConveniosTable } from "../components/convenios/ConveniosTable";
import type { ConvenioFila } from "../components/convenios/ConveniosTable";
import { paritariasAPI, EstadoParitarias, FuenteParitaria, EstadoFuenteConvenio } from "../api/paritarias";
import { BannerParitarias } from "../components/paritarias/BannerParitarias";
import { FuenteDelConvenio } from "../components/convenios/FuenteDelConvenio";
import { PanelCoberturaFuentes } from "../components/convenios/PanelCoberturaFuentes";
import { vigilanciaDe, avisoDeVigilancia, textoUltimaRevision } from "../components/paritarias/estadoFuente";
import { formatearInstante } from "../utils/fechas";

const conveniosApi = createSimpleCatalogApi("/convenios");
const obrasSocialesApi = createSimpleCatalogApi("/obras-sociales");

/**
 * Catálogo de Convenios Colectivos de Trabajo (CCT), con el nomenclador de ARCA.
 *
 * El "ID Externo" acá es el código CCT con formato "NNNN/AA" (ej. 0130/75). A diferencia del RNOS de
 * Obras Sociales no es numérico —lleva barra y ceros a la izquierda—, así que se guarda tal cual.
 *
 * Además del nomenclador, cada convenio lleva su OBRA SOCIAL: en la Argentina la define el sindicato,
 * y al sindicato lo define el CCT. Quien trabaja bajo el convenio de televisión aporta a la O.S. del
 * Personal de Televisión, no a la que elija la productora que lo contrata. Ese dato NO viene en el
 * nomenclador de ARCA —es propio— y por eso se carga a mano acá.
 */

/**
 * Qué empleadoras registraron un convenio ante ARCA.
 *
 * El número solo dice "5 empresas"; lo accionable es CUÁLES, porque la excepción de obra social se
 * carga en la ficha de cada una. Por eso cada fila lleva su link: desde acá se llega al lugar donde
 * se toca, en vez de tener que buscar la empresa a mano.
 */
const EmpresasDelConvenioModal: React.FC<{
  convenio: ConvenioFila | null;
  empresas: Company[];
  obraSocialDe: (id?: number | null) => SimpleCatalogItem | undefined;
  onClose: () => void;
}> = ({ convenio, empresas, obraSocialDe, onClose }) => {
  if (!convenio) return null;

  const sindical = obraSocialDe(convenio.obraSocialDefaultId);

  return (
    <InfoModal isOpen onClose={onClose} title="Empresas que registraron este convenio" subtitle={`${convenio.externalId} — ${convenio.name}`} size="lg" actions={[{ label: "Cerrar", onClick: onClose, variant: "primary" }]}>
      <div className="space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">ARCA solo acepta un alta si la empleadora tiene el convenio registrado en su padrón. Estas son las que lo tienen.</p>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700/60 max-h-[55vh] overflow-y-auto">
          {empresas.length === 0 && <p className="px-3 py-4 text-xs text-gray-400 italic">Ninguna empresa lo tiene registrado.</p>}

          {empresas.map((e) => {
            // La excepción es de la empleadora, no del convenio: se marca acá para que se vea que
            // en esa empresa este CCT NO usa la obra social sindical.
            const override = (e.convenioObraSocialOverrides || []).find((o) => String(o.convenioId) === convenio._id);
            const os = obraSocialDe(override?.obraSocialId);
            return (
              <div key={e._id} className="px-3 py-2.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-900 dark:text-gray-100">{e.razonSocial}</span>
                  {e.cuit && <span className="block font-mono text-[11px] text-gray-500 dark:text-gray-400">{e.cuit}</span>}
                  {override && (
                    <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" />
                      Usa una excepción: {os ? `${formatRnos(os.externalId)} — ${os.name}` : "obra social fuera del catálogo"}
                    </span>
                  )}
                </div>
                <Link to={`/empresas/${e._id}/arca/convenios`} onClick={onClose} title={`Abrir los convenios de ${e.razonSocial}`} className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30">
                  Ver en la ficha
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
                </Link>
              </div>
            );
          })}
        </div>

        {!sindical && convenio.externalId !== "9999/99" && <p className="text-[11px] text-amber-700 dark:text-amber-400">Este convenio todavía no tiene obra social sindical cargada: las altas de estas empresas van a caer en la obra social global.</p>}
      </div>
    </InfoModal>
  );
};

export const ConveniosPage: React.FC = () => {
  const [obrasSociales, setObrasSociales] = useState<SimpleCatalogItem[]>([]);
  /** Qué empresas registraron cada convenio, por `_id`. */
  const [empresasPorConvenio, setEmpresasPorConvenio] = useState<Map<string, Company[]>>(new Map());
  /**
   * Todas las empresas, para los switches del formulario.
   *
   * La relación vive en `Company.convenioIds`, no en el convenio: para poder prenderla y apagarla
   * desde acá hace falta la lista entera, no solo las que ya lo tienen.
   */
  const [todasLasEmpresas, setTodasLasEmpresas] = useState<Company[]>([]);
  const [guardandoEmpresa, setGuardandoEmpresa] = useState('');
  /** Qué fuente alimenta cada convenio, por código. Sale del server ya resuelto. */
  const [vigilancia, setVigilancia] = useState<EstadoParitarias['porConvenio']>({});
  /**
   * Lo declarado a mano, por `_id` de convenio. SOLO los que alguien tocó.
   *
   * Los 2.669 restantes son `sin_revisar` por ausencia. No es lo mismo que `sin_fuente_conocida`, y
   * esa diferencia es toda la razón de ser del campo: «nadie buscó» contra «se buscó y no hay nada
   * publicado». Sin ella, la próxima persona repite la búsqueda.
   */
  const [declarado, setDeclarado] = useState<EstadoParitarias['declarado']>({});
  /**
   * Las fuentes completas, para poder prenderlas y apagarlas desde el convenio.
   *
   * `vigilancia` alcanza para DIBUJAR la columna —viene ya resuelto por convenio— pero no para
   * editar: la relación vive en `FuenteParitaria.convenios`, así que para tocarla hace falta la
   * lista de códigos que cada fuente tiene hoy.
   */
  const [fuentes, setFuentes] = useState<FuenteParitaria[]>([]);
  /**
   * Convenios en uso que nadie revisó. Sale del SERVER, no se recalcula acá.
   *
   * Es el mismo dato que alimenta el aviso de la ficha de empresa. Calcularlo por separado en cada
   * pantalla es exactamente cómo terminamos diciendo dos cosas distintas de la misma fuente.
   */
  const [enUsoSinRevisar, setEnUsoSinRevisar] = useState<EstadoParitarias['enUsoSinRevisar']>([]);
  /** El convenio cuya fuente se está anotando desde la fila. */
  const [anotando, setAnotando] = useState<ConvenioFila | null>(null);
  /** Refresca las dos puntas: lo que dibuja la columna y lo que editan los switches. */
  const cargarParitarias = async () => {
    // Si falla, la columna dice «Sin revisar» en todas: es literalmente cierto —no sabemos de
    // ninguna— y es preferible a una columna vacía que no se sabe si es un error o un dato.
    try {
      const [estado, lista] = await Promise.all([paritariasAPI.estado(), paritariasAPI.fuentes()]);
      setVigilancia(estado.porConvenio);
      setDeclarado(estado.declarado || {});
      setEnUsoSinRevisar(estado.enUsoSinRevisar || []);
      setFuentes(lista);
    } catch {
      setVigilancia({});
      setDeclarado({});
      setEnUsoSinRevisar([]);
      setFuentes([]);
    }
  };
  useEffect(() => {
    void cargarParitarias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [detalle, setDetalle] = useState<ConvenioFila | null>(null);

  useEffect(() => {
    obrasSocialesApi
      .list()
      .then(setObrasSociales)
      .catch(() => setObrasSociales([]));
  }, []);

  useEffect(() => {
    companiesAPI
      .list()
      .then((empresas) => {
        setTodasLasEmpresas(empresas);
        const porConvenio = new Map<string, Company[]>();
        // SIEMPRE por `_id`, nunca por `externalId`: 1.555 de los 2.669 convenios llevan sufijo " E"
        // y "0131/75" y "0131/75 E" son registros distintos y legítimos del nomenclador.
        for (const e of empresas) for (const id of e.convenioIds || []) porConvenio.set(String(id), [...(porConvenio.get(String(id)) || []), e]);
        for (const [, lista] of porConvenio) lista.sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, "es", { sensitivity: "base" }));
        setEmpresasPorConvenio(porConvenio);
      })
      .catch(() => setEmpresasPorConvenio(new Map()));
  }, []);

  const opcionesObraSocial = useMemo(() => {
    // La primera opción es el vacío y tiene que existir: el formulario genérico preselecciona la
    // primera de la lista, y sin ella todo convenio nuevo nacería con una obra social al azar.
    // Además el vacío es un valor legítimo: "9999/99 — EXCLUIDO DE CONVENIO" no tiene sindicato.
    const vacio = { value: "", label: "— Sin obra social sindical (define la empresa) —" };
    const items = obrasSociales
      .map((o) => ({ value: String((o.data as { id?: number } | undefined)?.id ?? ""), label: `${formatRnos(o.externalId)} — ${o.name}` }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
    return [vacio, ...items];
  }, [obrasSociales]);

  /** La obra social sindical del convenio, resuelta contra el catálogo por `data.id`. */
  const porDataId = (id?: number | null) => (id == null ? undefined : obrasSociales.find((o) => Number((o.data as { id?: number } | undefined)?.id) === id));

  /**
   * En qué estado está el conocimiento sobre dónde publica sus paritarias este convenio.
   *
   * `con_fuente` se DERIVA de los enlaces, no de un campo: si hay una fuente que lista el código,
   * está cubierto, y si le sacan la última deja de estarlo sin que haya nada que actualizar. Un
   * booleano guardado seguiría diciendo «vigilado» — el tipo de mentira silenciosa que costó los 163
   * contratos del `legacyId 43`.
   */
  const estadoFuenteDe = (c: ConvenioFila): EstadoFuenteConvenio => {
    const asignadas = vigilancia[String(c.externalId || '').trim()] || [];
    if (asignadas.length > 0) return 'con_fuente';
    const d = declarado[c._id]?.estado;
    return d === 'sin_fuente_conocida' || d === 'no_aplica' ? d : 'sin_revisar';
  };

  // `revisadaEl` es un INSTANTE (cuándo alguien lo declaró), no una fecha de calendario: se convierte
  // a hora local y lleva hora. Ver `utils/fechas.ts`.

  /**
   * La columna, en las DOS pestañas.
   *
   * En la primera entrega estaba solo en la acotada, porque decía «No vigilado» y sobre los 2.669
   * eran 2.664 filas que se leían como pendientes. Ahora dice otra cosa: dónde publica sus acuerdos
   * un convenio es una propiedad del convenio —verdad para cualquier empresa, hoy y en tres años— y
   * anotarla vale aunque nadie lo use todavía. Por eso el gris no lleva ícono de alerta y el recuento
   * está ARRIBA, encuadrando el total como conocimiento acumulado y no como una lista de deudas.
   */
  const renderFuente = (c: ConvenioFila) => {
    const estado = estadoFuenteDe(c);
    const dec = declarado[c._id];

    if (estado === 'con_fuente') {
      const asignadas = vigilancia[String(c.externalId || '').trim()] || [];
      const rota = asignadas.some((f) => f.conProblema);
      /*
        Que exista la fuente no quiere decir que se esté bajando: son dos cosas, y callar la segunda
        haría creer que el convenio está cubierto cuando su vigilancia está pausada.

        Se lee con `vigilanciaDe`, EL MISMO lector que usa el ABM. La versión anterior preguntaba
        `!f.activa` acá y algo distinto allá, y con el campo ausente esta pantalla escribía «pausada»
        sobre las tres fuentes que la otra mostraba corriendo.
      */
      const avisos = [...new Set(asignadas.map((f) => avisoDeVigilancia(vigilanciaDe(f))).filter(Boolean))];
      const noSeSabe = asignadas.some((f) => vigilanciaDe(f) === 'desconocida');
      return (
        <span className="text-gray-700 dark:text-gray-200">
          {asignadas.map((f) => f.entidad).join(', ')}
          <span className={`block text-[11px] ${rota ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{textoUltimaRevision(asignadas[0])}</span>
          {avisos.map((a) => (
            // El estado que no se pudo leer va en ROJO y no en ámbar: no es «pausada», es que la
            // consulta vino incompleta. Confundirlos volvería a esconder el problema.
            <span key={a} className={`block text-[11px] ${noSeSabe ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {a}
            </span>
          ))}
        </span>
      );
    }

    if (estado === 'no_aplica') {
      // Sin acción, como pide el caso 9999/99: no tiene paritaria y no la va a tener. Si hubo un
      // error se corrige desde el modal de edición del convenio, que tiene el bloque completo.
      return (
        <span className="text-gray-400 dark:text-gray-600" title={dec?.nota || 'No tiene paritaria y no la va a tener.'}>
          No aplica
          {dec?.revisadaEl && <span className="block text-[11px]">marcado el {formatearInstante(dec.revisadaEl)}</span>}
        </span>
      );
    }

    if (estado === 'sin_fuente_conocida') {
      return (
        <button
          type="button"
          onClick={() => setAnotando(c)}
          title={`${dec?.nota || 'Se buscó y no se encontró página que publique sus acuerdos.'}${dec?.revisadaPor ? ` — ${dec.revisadaPor}` : ''}`}
          className="text-left text-gray-400 dark:text-gray-600 hover:text-blue-600 dark:hover:text-blue-400"
        >
          Sin fuente conocida
          <span className="block text-[11px]">revisado el {formatearInstante(dec?.revisadaEl)}</span>
        </button>
      );
    }

    return (
      // Gris y sin ícono de alerta: que nadie haya buscado todavía dónde publica un gremio que
      // ninguna empresa usa no es un error que haya que arreglar hoy.
      <span className="text-gray-400 dark:text-gray-600">
        Sin revisar
        <button type="button" onClick={() => setAnotando(c)} className="ml-2 text-blue-600 dark:text-blue-400 hover:underline">
          asignar fuente
        </button>
      </span>
    );
  };

  return (
    <>
      <SimpleCatalogManager
        title="Convenios"
        subtitle="Convenios Colectivos de Trabajo (CCT). Cada uno define la obra social de quien trabaja bajo él."
        icon={faFileContract}
        entityLabel="convenio"
        api={conveniosApi}
        templateBaseName="convenios"
        externalIdLabel="Código"
        externalIdPlaceholder="Formato NNNN/AA, ej: 0130/75"
        // La cascada de obras sociales se decide en cuatro lugares distintos (persona, excepción de
        // la empleadora, convenio, empresa) y desde acá solo se ve uno: el ⓘ explica el conjunto.
        helpKey="convenios"
        // El nomenclador tiene 2.669 convenios y solo importan los que alguna empresa registró:
        // cargarle la obra social a uno que nadie usa es trabajo perdido, y los 2.664 restantes
        // llenaban la columna de guiones como si faltaran 2.664 configuraciones.
        filtroDestacado={{ etiqueta: "Registrados por alguna empresa", aplica: (c) => (empresasPorConvenio.get(c._id) || []).length > 0 }}
        // LA MISMA tabla que usa la ficha de empresa: eran dos, con encabezados distintos para los
        // mismos datos ("Nombre" vs "Actividad", el código al final vs primero) y ya habían divergido.
        // Acá se le suma la columna "Empresas" y las acciones de ABM que aporta el manager.
        // Los avisos de paritarias van ARRIBA de la tabla y con la misma forma que los cuatro de
        // /arca/categorias: es el mismo tipo de aviso —algo que hay que mirar— sobre otra entidad.
        extraSuperior={<BannerParitarias />}
        /*
          EL ENCUADRE ES LO QUE ESTÁ EN JUEGO ACÁ.

          Con la columna en las dos pestañas, 2.664 filas dicen «Sin revisar». Ese mismo hecho se
          puede presentar como 2.664 pendientes —y entonces la pantalla es una lista de deudas que
          nadie va a terminar nunca— o como el recuento de un conocimiento que se acumula: cada
          convenio que alguien anota vale para siempre y para todas las empresas de la plataforma.
          Por eso el número va ARRIBA y en positivo, y por eso ninguna fila lleva ícono de alerta.
        */
        /*
          EL ENCUADRE ES LO QUE ESTÁ EN JUEGO ACÁ.

          Con la columna en las dos pestañas, 2.664 filas dicen «Sin revisar». Ese mismo hecho se
          puede presentar como 2.664 pendientes —y entonces la pantalla es una lista de deudas que
          nadie va a terminar nunca— o como el recuento de un conocimiento que se acumula: cada
          convenio que alguien anota vale para siempre y para todas las empresas de la plataforma.
          Por eso el número va ARRIBA y en positivo, y por eso ninguna fila lleva ícono de alerta.
        */
        resumen={(todos) => <PanelCoberturaFuentes todos={todos} vigilancia={vigilancia} declarado={declarado} enUsoSinRevisar={enUsoSinRevisar} onCambiado={cargarParitarias} />}
        tablaPropia={({ items, renderAcciones }) => (
          <ConveniosTable
            convenios={items as ConvenioFila[]}
            obraSocialDe={(c) => ({ os: porDataId(c.obraSocialDefaultId) })}
            renderEmpresas={(c) => {
              const lista = empresasPorConvenio.get(c._id) || [];
              if (lista.length === 0) return <span className="text-gray-400 dark:text-gray-600">—</span>;
              // Mismo gesto que en Empresas: el número solo, y qué abre en el tooltip. El recuadro
              // ya dice que es un botón; el ojito al lado repetía lo mismo y ensuciaba la columna.
              return (
                <button
                  type="button"
                  onClick={() => setDetalle(c)}
                  title={`Ver las ${lista.length} empresa(s) que registraron ${c.externalId}`}
                  aria-label={`Ver las ${lista.length} empresas que registraron ${c.externalId}`}
                  className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
                >
                  <span className="text-sm font-bold tabular-nums">{lista.length}</span>
                </button>
              );
            }}
            /* En las DOS pestañas: es una propiedad del convenio, no una configuración de quien lo usa. */
            renderVigilancia={renderFuente}
            renderAcciones={renderAcciones}
          />
        )}
        // Sin `showColumn`: las columnas las dibuja `ConveniosTable`. Estos descriptores quedan solo
        // para el formulario de alta/edición, que sigue siendo el genérico del manager.
        extraFields={[
          { key: "signatario", label: "Signatario", placeholder: "Ej: FAECYS" },
          { key: "obraSocialDefaultId", label: "Obra social del convenio", type: "select", options: opcionesObraSocial },
        ]}
        /*
          Las empresas que lo tienen registrado, editables desde acá.

          El dato NO es del convenio: vive en `Company.convenioIds`. Por eso no entra por
          `extraFields` —no sale en el mismo `update`— y por eso cada switch guarda solo, apenas se
          toca. Mezclarlo con el «Guardar» de abajo daría a entender que se escribe todo junto, y una
          mitad se guardaría igual aunque se cancele.

          Se listan TODAS las empresas y no solo las registradas: el sentido del bloque es poder
          agregar, y una lista que solo muestra lo que ya está no deja hacerlo.
        */
        extraSeccion={(convenio) => (
          <div className="space-y-5">
            <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Empresas que lo tienen registrado</label>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">ARCA solo acepta un alta si la empleadora tiene el convenio en su padrón. Cada cambio se guarda solo.</p>
            {todasLasEmpresas.length === 0 ? (
              <p className="text-xs text-gray-400">No hay empresas cargadas.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
                {todasLasEmpresas.map((e) => {
                  const tiene = (e.convenioIds || []).map(String).includes(convenio._id);
                  return (
                    <div key={e._id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block text-sm text-gray-800 dark:text-gray-200 truncate">{e.razonSocial}</span>
                        <span className="block text-[11px] font-mono text-gray-400">{e.cuit || "—"}</span>
                      </span>
                      {/* Mismo switch que el resto de la app (ver `ContractStatesTab`): un check se
                          lee como «seleccionar de una lista» y esto es prender o apagar una relación. */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={tiene}
                        aria-label={`${tiene ? "Quitar" : "Registrar"} ${convenio.externalId || convenio.name} en ${e.razonSocial}`}
                        disabled={guardandoEmpresa === e._id}
                        onClick={async () => {
                          setGuardandoEmpresa(e._id);
                          try {
                            const ids = (e.convenioIds || []).map(String);
                            // Se manda la lista COMPLETA: el server la reemplaza, no la fusiona.
                            const nuevos = tiene ? ids.filter((x) => x !== convenio._id) : [...ids, convenio._id];
                            await companiesAPI.update(e._id, { convenioIds: nuevos } as any);
                            const empresas = await companiesAPI.list();
                            setTodasLasEmpresas(empresas);
                            const porConvenio = new Map<string, Company[]>();
                            for (const emp of empresas) for (const id of emp.convenioIds || []) porConvenio.set(String(id), [...(porConvenio.get(String(id)) || []), emp]);
                            for (const [, lista] of porConvenio) lista.sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, "es", { sensitivity: "base" }));
                            setEmpresasPorConvenio(porConvenio);
                          } catch (err: any) {
                            sweetAlert.error("Error", err?.response?.data?.error || "No se pudo cambiar el convenio de esa empresa.");
                          } finally {
                            setGuardandoEmpresa("");
                          }
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${tiene ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${tiene ? "translate-x-6" : "translate-x-1"}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            </div>

            {/*
              Dónde publica sus paritarias este convenio: EL MISMO bloque que abre la acción de la
              fila, no una copia. El dato no vive en el convenio sino en `FuenteParitaria.convenios`,
              así que no puede entrar por `extraFields` ni salir en el mismo «Guardar»: cada cambio
              se guarda solo, igual que las empresas de arriba.
            */}
            <div>
              <FuenteDelConvenio convenio={convenio} fuentes={fuentes} declarado={declarado[convenio._id]} onCambiado={cargarParitarias} />
            </div>
          </div>
        )}
      />

      <EmpresasDelConvenioModal convenio={detalle} empresas={detalle ? empresasPorConvenio.get(detalle._id) || [] : []} obraSocialDe={porDataId} onClose={() => setDetalle(null)} />

      {/*
        Anotar la fuente sin pasar por el ABM del convenio.

        Es la acción de la columna, y abre EL MISMO bloque que el modal de edición: al que está
        recorriendo el catálogo no le sirve abrir el formulario entero del convenio —código, nombre,
        signatario, obra social, empresas— para anotar una sola cosa. Sin footer a propósito: cada
        switch se guarda solo, y un botón «Guardar» haría pensar que hasta tocarlo no pasó nada.
      */}
      {anotando && (
        <Modal isOpen onClose={() => setAnotando(null)} title="Fuente de paritarias" subtitle={`${anotando.externalId || 'sin código'} — ${anotando.name}`} size="md">
          <FuenteDelConvenio convenio={anotando} fuentes={fuentes} declarado={declarado[anotando._id]} onCambiado={cargarParitarias} />
        </Modal>
      )}
    </>
  );
};
