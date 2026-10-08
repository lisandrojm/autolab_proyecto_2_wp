import React, { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserTie, faCloudArrowDown, faFileImport, faSpinner, faFileContract, faListUl, faUserGear, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import axios from "../api/axiosConfig";
import { encabezadoDeAmbito } from "../config/nomencladoresArca";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { DefaultArcaStar, LimpiarDefaultArca } from "../components/arca/DefaultArcaStar";
import { InfoModal } from "../components/ui/InfoModal";
import { createSimpleCatalogApi } from "../api/simpleCatalog";
import { sweetAlert } from "../utils/sweetAlert";

const api = createSimpleCatalogApi("/arca/puestos-desempenados");

/** El código de ARCA se guarda con ceros a la izquierda (4 díg.), tal como va en el registro de 85. */
const formatCodigo = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  return digits ? digits.padStart(4, "0").slice(-4) : "";
};

interface ResumenImportacion {
  nuevos: number;
  actualizados: number;
  sinCambios: number;
  manualesRespetados: number;
  descartadas: number;
  detalle: { nuevos: Array<{ codigo: string; descripcion: string }>; actualizados: Array<{ codigo: string; descripcion: string; descripcionAnterior: string }>; manualesRespetados: Array<{ codigo: string; descripcion: string; descripcionManual: string }> };
}

/**
 * PUESTOS DESEMPEÑADOS de ARCA: la tabla de la lupa «Puesto Desemp.» de Registrar Nuevas Altas.
 *
 * Solo la usa el registro de 85 (Altas Masivas, pos. 29-32). El puesto de un contrato sale, en este
 * orden, del Rol Empresa → de la categoría → del default de la empleadora → de la ★ de acá.
 *
 * «Importar de ARCA» toma la tabla del Catálogo de ARCA (lo leído de la pantalla de altas, o la semilla
 * verificada); «Importar archivo» acepta la tabla subida. Las dos son un upsert por código que no pisa
 * lo cargado a mano ni rompe asignaciones (guardan el código).
 */
export const ArcaPuestosDesempenadosPage: React.FC = () => {
  const [recarga, setRecarga] = useState(0);
  const [importando, setImportando] = useState<"arca" | "archivo" | null>(null);
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);
  const navigate = useNavigate();
  /** El info de «Dónde se asigna»: los tres niveles y en qué orden mandan. */
  const [infoNiveles, setInfoNiveles] = useState(false);
  const [info, setInfo] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  const terminar = (r: ResumenImportacion) => {
    setResumen(r);
    setRecarga((n) => n + 1);
  };
  const importarDeArca = async () => {
    setImportando("arca");
    try {
      const { data } = await axios.post("/arca/puestos-desempenados/importar-arca");
      terminar(data);
    } catch (e: any) {
      sweetAlert.error("No se pudo importar", e?.response?.data?.error || "");
    } finally {
      setImportando(null);
    }
  };
  const importarArchivo = async (f: File) => {
    setImportando("archivo");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await axios.post("/arca/puestos-desempenados/importar-archivo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      terminar(data);
    } catch (e: any) {
      sweetAlert.error("No se pudo importar", e?.response?.data?.error || "");
    } finally {
      setImportando(null);
      if (archivo.current) archivo.current.value = "";
    }
  };

  const boton = "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50";

  return (
    <>
      <SimpleCatalogManager
        recarga={recarga}
        accionesEncabezado={
          <div className="flex items-center gap-2">
            <button type="button" onClick={importarDeArca} disabled={!!importando} className={boton} title="Carga TODA la tabla oficial desde el Catálogo de ARCA (lo leído de la pantalla de altas). No pisa lo cargado a mano.">
              <FontAwesomeIcon icon={importando === "arca" ? faSpinner : faCloudArrowDown} spin={importando === "arca"} className="h-3.5 w-3.5" />
              Importar de ARCA
            </button>
            <button type="button" onClick={() => archivo.current?.click()} disabled={!!importando} className={boton} title="Subí la tabla: el CSV oficial (filas PUESTO_DESEMPENADO) o una planilla con columnas Código y Descripción.">
              <FontAwesomeIcon icon={importando === "archivo" ? faSpinner : faFileImport} spin={importando === "archivo"} className="h-3.5 w-3.5" />
              Importar archivo
            </button>
            <input ref={archivo} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && void importarArchivo(e.target.files[0])} />
            <button type="button" onClick={() => setInfo(true)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              ¿De dónde sale?
            </button>
            {/*
              DÓNDE SE ASIGNA: tres niveles, en el orden de la jerarquía (Convenio → Categoría → Rol Empresa).
              Al resolver el puesto de un contrato manda el más específico: el Rol Empresa, si lo tiene.
            */}
            <span className="mx-1 h-6 w-px bg-gray-200 dark:bg-gray-700" aria-hidden />
            <button type="button" onClick={() => setInfoNiveles(true)} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400" title="Dónde se asigna el puesto" aria-label="Dónde se asigna el puesto">
              <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => navigate("/convenios")} className={boton} title="El puesto por defecto de cada convenio">
              <FontAwesomeIcon icon={faFileContract} className="h-3.5 w-3.5" />
              Convenios
            </button>
            <button type="button" onClick={() => navigate("/arca/categorias")} className={boton} title="El puesto de cada categoría (lápiz de la categoría)">
              <FontAwesomeIcon icon={faListUl} className="h-3.5 w-3.5" />
              Categorías
            </button>
            <button type="button" onClick={() => navigate("/roles-empresa")} className={boton} title="El puesto de cada rol empresa (función)">
              <FontAwesomeIcon icon={faUserGear} className="h-3.5 w-3.5" />
              Roles Empresa
            </button>
          </div>
        }
        columnasCalculadas={[
          {
            label: "Origen",
            render: (item: any) =>
              item.origen === "manual" ? (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" title="Cargado o corregido a mano: la importación no lo pisa">
                  Manual
                </span>
              ) : (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">ARCA</span>
              ),
          },
          {
            label: "Última sincronización",
            render: (item: any) => <span className="text-xs text-gray-500">{item.sincronizadoEl ? new Date(item.sincronizadoEl).toLocaleDateString("es-AR") : "—"}</span>,
          },
          {
            label: "Por defecto",
            encabezado: (
              <span className="inline-flex items-center gap-2">
                Por defecto
                <LimpiarDefaultArca campo="puestoDesempenado" queEs="el puesto desempeñado" />
              </span>
            ),
            render: (item) => <DefaultArcaStar campo="puestoDesempenado" valor={String(item.externalId || "")} nombre={`${item.externalId} — ${item.name}`} queEs="el puesto desempeñado" />,
          },
        ]}
        extraFields={[
          {
            key: "activo",
            label: "Estado",
            type: "estado",
            showColumn: true,
            filtrable: true,
            options: [
              { value: "true", label: "Activo" },
              { value: "false", label: "Inactivo" },
            ],
            ayuda: "Los inactivos no se ofrecen al asignar un puesto. Uno en uso no se puede borrar: se desactiva.",
          },
        ]}
        title="Puestos Desempeñados"
        {...encabezadoDeAmbito("puestos-desempenados")}
        icon={faUserTie}
        entityLabel="puesto desempeñado"
        nombreLabel="Descripción"
        api={api}
        templateBaseName="arca_puestos_desempenados"
        externalIdLabel="Código"
        externalIdPlaceholder="Ej: 2455"
        formatExternalId={formatCodigo}
        sanitizeExternalId={(v) => v.replace(/\D/g, "")}
        permiteImportExcel={false}
      />

      <InfoModal isOpen={!!resumen} onClose={() => setResumen(null)} title="Importación terminada" size="md">
        {resumen && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <p>
                <strong>{resumen.nuevos}</strong> nuevos
              </p>
              <p>
                <strong>{resumen.actualizados}</strong> actualizados
              </p>
              <p>
                <strong>{resumen.sinCambios}</strong> sin cambios
              </p>
              <p>
                <strong>{resumen.manualesRespetados}</strong> cargados a mano (no se pisaron)
              </p>
            </div>
            {resumen.descartadas > 0 && <p className="text-xs text-gray-500">{resumen.descartadas} línea(s) del archivo descartadas (sin código, sin descripción o repetidas).</p>}
            {[
              ["Nuevos", resumen.detalle.nuevos.map((x) => `${x.codigo} · ${x.descripcion}`)],
              ["Actualizados", resumen.detalle.actualizados.map((x) => `${x.codigo} · ${x.descripcionAnterior} → ${x.descripcion}`)],
              ["Manuales respetados", resumen.detalle.manualesRespetados.map((x) => `${x.codigo} · queda «${x.descripcionManual}» (ARCA: ${x.descripcion})`)],
            ]
              .filter(([, l]) => (l as string[]).length > 0)
              .map(([t, l]) => (
                <div key={t as string}>
                  <p className="text-xs font-bold uppercase text-gray-500 mb-1">{t as string}</p>
                  <div className="max-h-40 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 text-xs divide-y divide-gray-100 dark:divide-gray-800">
                    {(l as string[]).map((x) => (
                      <p key={x} className="px-2 py-1">
                        {x}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </InfoModal>

      <InfoModal isOpen={infoNiveles} onClose={() => setInfoNiveles(false)} title="Dónde se asigna el puesto" size="md">
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
          <p>
            Lo pide el alta URGENTE (Altas Masivas, registro de 85). Se puede asignar en tres niveles, de lo más general a lo más específico:
          </p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>
              <strong>Convenio</strong> — el puesto típico de todo el convenio («personal de apoyo a la producción» en el de televisión).
            </li>
            <li>
              <strong>Categoría</strong> — el de una categoría del convenio. Se carga en el lápiz de la categoría.
            </li>
            <li>
              <strong>Rol Empresa</strong> — el de una función («Asistente de Cámara»).
            </li>
          </ol>
          <p>
            <strong>Manda el más específico:</strong> si el Rol Empresa lo tiene, no hace falta en la categoría ni en el convenio; si no, se toma el de la categoría, y si tampoco, el del convenio. Después
            vienen el default de la empleadora y la ★ de esta pantalla. En un contrato puntual se puede elegir otro, solo para ese contrato.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Ninguno es obligatorio: alcanza con que alguno de los niveles lo tenga.</p>
        </div>
      </InfoModal>

      <InfoModal isOpen={info} onClose={() => setInfo(false)} title="Puestos desempeñados de ARCA" size="md">
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
          <p>
            Es la tabla oficial que muestra la lupa del campo <strong>«Puesto Desemp.»</strong> en Registrar Nuevas Altas de Simplificación Registral. Solo la pide el alta URGENTE (Altas Masivas,
            registro de 85); la Carga Masiva no.
          </p>
          <p>
            ARCA no la publica para descargar: <strong>Importar de ARCA</strong> la toma del Catálogo de ARCA (Configuración → ARCA → Catálogo de ARCA), que se llena leyendo la pantalla de altas con «Leer
            de ARCA» o desde la copia verificada del repo. También podés subir el archivo de la tabla.
          </p>
          <p>
            La importación agrega los nuevos y actualiza las descripciones; <strong>no pisa lo cargado a mano</strong>, no borra nada y no rompe asignaciones (se guardan por código).
          </p>
          <p>
            <strong>De dónde sale el puesto de un contrato:</strong> del Rol Empresa → de la categoría → del convenio → del default de la empleadora → de la ★ de esta pantalla.
          </p>
        </div>
      </InfoModal>
    </>
  );
};
