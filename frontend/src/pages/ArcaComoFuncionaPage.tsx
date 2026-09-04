import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSitemap, faArrowDown, faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { PageLayout } from '../components/ui/PageLayout';
import { createSimpleCatalogApi } from '../api/simpleCatalog';
import { arcaSucursalesAPI } from '../api/arcaSucursales';
import { LAYOUT_ALTA, TipoCampoAlta } from '../components/contratos/afipTxt';

/**
 * "Cómo funciona" el alta masiva de ARCA: la cadena de dependencias y el registro de 130.
 *
 * Existe porque el orden importa y no se deduce de ninguna pantalla: ARCA solo acepta datos que la
 * empleadora tenga declarados en SU padrón, así que configurar los contratos antes que la empresa
 * garantiza un rechazo. Cada pantalla del módulo muestra su pedazo; esta muestra el conjunto.
 *
 * Dos decisiones sobre el contenido:
 *  - Los conteos salen de la API, no están escritos. Una página de ayuda que dice "2.669 convenios"
 *    cuando hay 2.700 deja de ser confiable para todo lo demás que dice.
 *  - La tabla del registro sale de `LAYOUT_ALTA`, que es lo que usa el generador del TXT. Un test
 *    compara las dos listas posición por posición.
 */

const obrasSocialesApi = createSimpleCatalogApi('/obras-sociales');
const conveniosApi = createSimpleCatalogApi('/convenios');
const tiposServicioApi = createSimpleCatalogApi('/arca/tipos-servicio');
const modContratacionApi = createSimpleCatalogApi('/arca/modalidades-contratacion');
const modLiquidacionApi = createSimpleCatalogApi('/arca/modalidades-liquidacion');

/** Un nomenclador universal, con su conteo real y el link a su pantalla. */
const Chip: React.FC<{ nombre: string; total?: number; to: string }> = ({ nombre, total, to }) => (
  <Link to={to} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-white/5 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:border-blue-400 dark:hover:border-blue-500/60 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors">
    <span className="font-medium">{nombre}</span>
    <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">{total == null ? '…' : total.toLocaleString('es-AR')}</span>
  </Link>
);

const Capa: React.FC<{ numero: number; titulo: string; descripcion: string; color: 'violeta' | 'azul' | 'verde' | 'ambar'; children?: React.ReactNode }> = ({ numero, titulo, descripcion, color, children }) => {
  const estilos = {
    violeta: 'bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-900/60',
    azul: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/60',
    verde: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/60',
    ambar: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/60',
  }[color];
  const tituloColor = {
    violeta: 'text-violet-700 dark:text-violet-300',
    azul: 'text-blue-700 dark:text-blue-300',
    verde: 'text-emerald-700 dark:text-emerald-300',
    ambar: 'text-amber-700 dark:text-amber-300',
  }[color];
  return (
    <div className={`rounded-xl border p-5 ${estilos}`}>
      <p className={`text-[11px] font-bold uppercase tracking-widest ${tituloColor}`}>
        {numero} · {titulo}
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-4">{descripcion}</p>
      {children}
    </div>
  );
};

/** La flecha entre capas dice QUÉ pasa al bajar un nivel, que es lo que explica la cadena. */
const Flecha: React.FC<{ texto: string }> = ({ texto }) => (
  <div className="flex justify-center py-2">
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <FontAwesomeIcon icon={faArrowDown} className="h-2.5 w-2.5" />
      {texto}
    </span>
  </div>
);

/** Una fila de "qué aporta" dentro de una capa. */
const Aporte: React.FC<{ que: string; para: React.ReactNode; to?: string }> = ({ que, para, to }) => (
  <div className="grid grid-cols-1 sm:grid-cols-[13rem_1fr] gap-x-4 gap-y-1 rounded-lg bg-white/60 dark:bg-white/[0.03] px-3 py-2.5">
    <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
      {to ? (
        <Link to={to} className="hover:underline inline-flex items-center gap-1.5">
          {que}
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5 opacity-60" />
        </Link>
      ) : (
        que
      )}
    </div>
    <div className="text-sm text-gray-600 dark:text-gray-400">{para}</div>
  </div>
);

const TAG: Record<TipoCampoAlta, { texto: string; clase: string }> = {
  obligatorio: { texto: 'obligatorio', clase: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900' },
  condicional: { texto: 'condicional', clase: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900' },
  constante: { texto: 'constante', clase: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700' },
  en_blanco: { texto: 'en blanco', clase: 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-900/60 dark:text-gray-500 dark:border-gray-800' },
};

const Nota: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <div className="rounded-lg border border-gray-200 dark:border-gray-700 border-l-[3px] border-l-blue-500 dark:border-l-blue-500 bg-white dark:bg-gray-800/60 px-4 py-3.5 text-sm text-gray-600 dark:text-gray-400">
    <strong className="text-gray-900 dark:text-gray-100">{titulo}</strong> {children}
  </div>
);

export const ArcaComoFuncionaPage: React.FC = () => {
  const [conteos, setConteos] = useState<Record<string, number>>({});

  useEffect(() => {
    const cargar = async (clave: string, fn: () => Promise<unknown[]>) => {
      try {
        const items = await fn();
        setConteos((prev) => ({ ...prev, [clave]: items.length }));
      } catch {
        /* Sin conteo se muestra "…": mejor que un número inventado. */
      }
    };
    cargar('obrasSociales', () => obrasSocialesApi.list());
    cargar('convenios', () => conveniosApi.list());
    cargar('tiposServicio', () => tiposServicioApi.list());
    cargar('modContratacion', () => modContratacionApi.list());
    cargar('modLiquidacion', () => modLiquidacionApi.list());
    cargar('domicilios', () => arcaSucursalesAPI.list());
  }, []);

  return (
    <PageLayout title="Cómo funciona" subtitle="De dónde sale cada dato del archivo de alta, y en qué orden hay que configurarlo." faIcon={{ icon: faSitemap }} shouldShowInfo={false}>
      <div className="max-w-5xl space-y-8">
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">La cadena de dependencias</h2>

          <Capa numero={1} titulo="Nomencladores de ARCA" color="violeta" descripcion="Universales: los publica el organismo, son iguales para todos los CUIT y se importan una vez.">
            <div className="flex flex-wrap gap-2">
              <Chip nombre="Obras Sociales" total={conteos.obrasSociales} to="/obras-sociales" />
              <Chip nombre="Convenios" total={conteos.convenios} to="/convenios" />
              <Chip nombre="Categorías profesionales" to="/arca/categorias" total={undefined} />
              <Chip nombre="Tipos de Servicio" total={conteos.tiposServicio} to="/arca/tipos-servicio" />
              <Chip nombre="Modalidades de Contrato" total={conteos.modContratacion} to="/arca/modalidades-contratacion" />
              <Chip nombre="Modalidades de Liquidación" total={conteos.modLiquidacion} to="/arca/modalidades-liquidacion" />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              Las <strong>categorías</strong> cuelgan de su convenio y su escala salarial del grupo, así que no tienen un total suelto: se cuentan por CCT. Hay además un{' '}
              <Link to="/arca/actividades" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                diccionario de Actividades
              </Link>{' '}
              que sirve para autocompletar el código y normalizar la descripción, pero <strong>no</strong> es de donde un contrato elige: ARCA solo acepta las actividades declaradas para ese domicilio, así que la lista que vale está en el nivel de abajo.
            </p>
          </Capa>

          <Flecha texto="cada empleadora registra su subconjunto ante ARCA" />

          <Capa numero={2} titulo="Empresa empleadora (por CUIT)" color="azul" descripcion="Sale del padrón de cada CUIT, en Datos del Empleador. Hay que repetirlo logueado con cada empleadora.">
            <div className="space-y-2">
              <Aporte
                que="Convenios registrados"
                para={
                  <>
                    Determinan <em className="not-italic font-medium text-gray-800 dark:text-gray-200">qué categorías</em> se le pueden dar de alta y <em className="not-italic font-medium text-gray-800 dark:text-gray-200">qué obra social</em> corresponde. La empresa puede pisar la obra social como excepción.
                  </>
                }
              />
              <Aporte
                que="Domicilios de Explotación"
                to="/arca/sucursales"
                para={
                  <>
                    Cada uno con su <em className="not-italic font-medium text-gray-800 dark:text-gray-200">código de sucursal</em> y las <em className="not-italic font-medium text-gray-800 dark:text-gray-200">actividades</em> declaradas para ese domicilio. Un domicilio puede tener más de una. {conteos.domicilios != null && <span className="text-gray-400">({conteos.domicilios} cargados)</span>}
                  </>
                }
              />
              <Aporte
                que="Obras Sociales registradas"
                para={
                  <>
                    El conjunto que ARCA acepta para este CUIT: <em className="not-italic font-medium text-gray-800 dark:text-gray-200">valida</em> lo que resolvió el convenio. Acá también se elige la de los excluidos de convenio (9999/99).
                  </>
                }
              />
              <Aporte que="Defaults" para="Tipo de servicio y modalidad de liquidación, cuando no varían por contrato." />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              Todo esto se configura en la <strong>ficha de cada empresa</strong>, en su sección ARCA. Se llega desde el bloque <strong>Fichas</strong> del menú.
            </p>
          </Capa>

          <Flecha texto="el contrato elige entre lo que su empleadora tiene registrado" />

          <Capa numero={3} titulo="Contrato de una persona" color="verde" descripcion="Lo único que se carga por persona. Todo lo demás se hereda.">
            <div className="space-y-2">
              <Aporte
                que="CUIL y fechas"
                para={
                  <>
                    De la persona y del contrato. La <em className="not-italic font-medium text-gray-800 dark:text-gray-200">fecha de fin</em> es obligatoria solo si la modalidad es a plazo determinado; en las de tiempo indeterminado tiene que ir en blanco.
                  </>
                }
              />
              <Aporte
                que="Categoría"
                para={
                  <>
                    Arrastra su <em className="not-italic font-medium text-gray-800 dark:text-gray-200">convenio</em> → obra social, y su <em className="not-italic font-medium text-gray-800 dark:text-gray-200">grupo salarial</em> → retribución.
                  </>
                }
              />
              <Aporte
                que="Domicilio"
                para={
                  <>
                    Arrastra la <em className="not-italic font-medium text-gray-800 dark:text-gray-200">actividad</em>: si el domicilio declara una sola, se completa sola; si tiene varias, hay que elegir cuál se informa.
                  </>
                }
              />
              <Aporte
                que="Tipo de contrato"
                to="/contratos"
                para={
                  <>
                    Arrastra <em className="not-italic font-medium text-gray-800 dark:text-gray-200">modalidad de contrato</em>, <em className="not-italic font-medium text-gray-800 dark:text-gray-200">tipo de servicio</em> y <em className="not-italic font-medium text-gray-800 dark:text-gray-200">modalidad de liquidación</em>.
                  </>
                }
              />
            </div>
          </Capa>

          <Flecha texto="un archivo por empleadora" />

          <Capa numero={4} titulo="Archivo TXT" color="ambar" descripcion="Registro de ancho fijo: 130 caracteres por línea, una línea por alta.">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Se genera desde{' '}
              <Link to="/admin/contracts" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                Admin GENERAL → Contratos
              </Link>
              , pestaña <em className="not-italic font-medium">Alta temprana de ARCA</em>, y se sube en <strong>ARCA → Relaciones Laborales → Carga Masiva</strong> con la clave fiscal de la empleadora.
            </p>
          </Capa>

          <div className="mt-4">
            <Nota titulo="Por qué importa el orden.">ARCA solo acepta lo que la empleadora tiene declarado en su padrón: una categoría de un convenio que no registró, una actividad que no está en ese domicilio o una obra social que no figura en su lista son rechazadas. Por eso primero se registra la empresa y recién después se completan los contratos — al revés, el archivo sale y vuelve rebotado.</Nota>
          </div>
        </section>

        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">Los 130 caracteres, campo por campo</h2>

          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-2.5 whitespace-nowrap w-px">Pos.</th>
                  <th className="px-4 py-2.5">Campo</th>
                  <th className="px-4 py-2.5">De dónde sale</th>
                  <th className="px-4 py-2.5 text-right whitespace-nowrap w-px" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-800">
                {LAYOUT_ALTA.map((c) => {
                  const tag = TAG[c.tipo];
                  const atenuado = c.tipo === 'constante' || c.tipo === 'en_blanco';
                  return (
                    <tr key={c.desde} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                      <td className="px-4 py-2 font-mono text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap align-top">
                        {c.desde}
                        {c.hasta !== c.desde ? `-${c.hasta}` : ''}
                      </td>
                      <td className={`px-4 py-2 align-top ${atenuado ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>{c.nombre}</td>
                      <td className="px-4 py-2 align-top text-gray-600 dark:text-gray-400">{c.origen}</td>
                      <td className="px-4 py-2 align-top text-right">
                        <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold border whitespace-nowrap ${tag.clase}`}>{tag.texto}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <Nota titulo="Situación de revista y régimen no existen en este formato.">Aparecen en la pantalla de alta individual de ARCA, pero el registro de 130 posiciones no los lleva. Tampoco hay que pedir el trabajador agropecuario ni el CCG: son constantes para una productora. Lo mismo con puesto desempeñado y convenio colectivo, que van en blanco — ARCA infiere el convenio de la categoría.</Nota>
          </div>
        </section>

        <p className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-4">
          Los domicilios y sus actividades se declaran en <strong>ARCA → Datos del Empleador → Domicilios de Explotación</strong>; las obras sociales y los convenios, en las pantallas homónimas de esa misma sección. Acá solo se reflejan: dar de alta algo en WeProdu no lo declara ante el organismo.
        </p>
      </div>
    </PageLayout>
  );
};
