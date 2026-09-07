import React, { useCallback, useEffect, useState } from "react";
import { faBriefcaseMedical } from "@fortawesome/free-solid-svg-icons";
import { encabezadoDeAmbito } from "../config/nomencladoresArca";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";
// El "ID Externo" de Obras Sociales siempre fue el código RNOS. El formato oficial vive en un solo
// lugar porque lo comparten este catálogo, la ficha de la empresa y el ABM de Empresas.
import { formatRnos } from "../utils/rnos";
import { DefaultArcaStar, LimpiarDefaultArca } from "../components/arca/DefaultArcaStar";
import { EmpresasDelItemArca, ColumnaEmpresasArca } from "../components/arca/EmpresasDelItemArca";
import { companiesAPI, Company } from "../api/companies";

const obrasSocialesApi = createSimpleCatalogApi("/obras-sociales");

const sanitizeRnos = (v: string): string => v.replace(/\D/g, "");

/**
 * Obras Sociales: el catálogo, y la que se OFRECE PRIMERO. Acá no se decide qué se declara.
 *
 * LA ★ NO ES LA OBRA SOCIAL GLOBAL QUE SE ELIMINÓ, y la diferencia es todo el punto.
 *
 * Aquella era un cuarto escalón de la cascada: cuando nada resolvía, se usaba igual. Solo entraba si
 * faltaba configurar algo aguas arriba —casi siempre un convenio sin obra social—, así que rellenaba
 * el campo con un valor sin fundamento. ARCA acepta el alta lo mismo, y el error se descubre cuando
 * ya está presentado. Ese escalón sigue eliminado: si la cascada real (la propia de la persona → la
 * del convenio → la de excluidos) no resuelve, el checklist marca FALTANTE y no se genera el TXT.
 *
 * Esta ★ solo ordena: es la que aparece primero en los selectores. Cambiarla no cambia ni un
 * carácter del archivo de altas.
 *
 * Lo que sí se decide vive donde corresponde: la obra social del convenio, en Convenios; la de los
 * excluidos de convenio y las excepciones por CCT, en la ficha de cada empleadora.
 */
export const ObrasSocialesPage: React.FC = () => {
  /*
    Las empresas, para poder registrar la obra social en varias desde acá.

    La relación vive en `Company.obrasSocialesIds`, no en la obra social: para prenderla y apagarla
    hace falta la lista entera de empresas, no solo las que ya la tienen.
  */
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const recargarEmpresas = useCallback(async () => {
    setEmpresas(await companiesAPI.list().catch(() => []));
  }, []);
  useEffect(() => {
    recargarEmpresas();
  }, [recargarEmpresas]);

  return (
  <SimpleCatalogManager
    /*
      Mismo bloque que Convenios: la vinculación por CUIT se decide sobre el ítem, no entrando a la
      ficha de cada empleadora. No entra por `extraFields` porque el dato no es de la obra social y no
      sale en el mismo `update`; cada switch guarda solo, apenas se toca.
    */
    extraSeccion={(item) => (
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Empresas que la tienen registrada</label>
        {empresas.length === 0 ? (
          <p className="text-xs text-gray-400">No hay empresas cargadas.</p>
        ) : (
          <EmpresasDelItemArca
            tipo="obraSocial"
            itemId={item._id}
            itemLabel={`${item.externalId || ''} ${item.name}`.trim()}
            empresas={empresas}
            asignadas={empresas.filter((e) => (e.obrasSocialesIds || []).map(String).includes(item._id)).map((e) => e._id)}
            onGuardado={recargarEmpresas}
            /*
              El aviso que antes daba la ficha antes de quitar una obra social. Se consulta por
              empresa y en el momento —no al cargar la pantalla— porque son N empresas y el dato solo
              hace falta cuando alguien está por sacarle una.
            */
            confirmarQuitar={async (empresa) => {
              const osId = String((item.data as { id?: number } | undefined)?.id ?? '');
              if (!osId) return null;
              try {
                const uso = await companiesAPI.obrasSocialesEnUso(empresa._id);
                const contratos = uso.contratos[osId] || 0;
                const convenios = uso.convenios[osId] || [];
                if (!contratos && convenios.length === 0) return null;
                const partes = [contratos > 0 ? `${contratos} contrato(s) la tienen fijada` : '', convenios.length > 0 ? `${convenios.length} convenio(s) registrados la heredan (${convenios.join(', ')})` : ''].filter(Boolean);
                return `${partes.join(' y ')}. Si se la quitás, ARCA va a rechazar esas altas por declarar una obra social que este CUIT no tiene registrada.`;
              } catch {
                // Si el chequeo no responde no se bloquea la baja: se pierde el aviso, no la operación.
                return null;
              }
            }}
          />
        )}
      </div>
    )}
    columnasCalculadas={[
      {
        label: "Empresas",
        render: (item) => <ColumnaEmpresasArca tipo="obraSocial" itemId={item._id} itemLabel={`${item.externalId || ''} ${item.name}`.trim()} empresas={empresas} asignadas={empresas.filter((e) => (e.obrasSocialesIds || []).map(String).includes(item._id)).map((e) => e._id)} onGuardado={recargarEmpresas} />,
      },
      {
        label: "Por defecto",
        encabezado: (
          <span className="inline-flex items-center gap-2">
            Por defecto
            <LimpiarDefaultArca campo="obraSocial" queEs="la obra social que se ofrece primero" />
          </span>
        ),
        render: (item) => <DefaultArcaStar campo="obraSocial" valor={String(item.externalId || "")} nombre={`${item.externalId} — ${item.name}`} queEs="la obra social que se ofrece primero" />,
      },
    ]}
    title="Obras Sociales"
    {...encabezadoDeAmbito("obras-sociales")}
    icon={faBriefcaseMedical}
    entityLabel="obra social"
    api={obrasSocialesApi}
    templateBaseName="obras_sociales"
    externalIdLabel="RNOS"
    externalIdPlaceholder="6 dígitos, ej: 400905"
    formatExternalId={formatRnos}
    sanitizeExternalId={sanitizeRnos}
    helpKey="obrasSociales"
  />
  );
};
