import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faCircleInfo, faTriangleExclamation, faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { Company } from '../../api/companies';
import { InfoModal } from '../ui/InfoModal';

/**
 * Si una empleadora puede dar altas en ARCA: LA definición, usada por el listado y por su ficha.
 *
 * Estaban escritas dos veces —el ABM contaba tres requisitos y la ficha cuatro, con textos parecidos
 * pero distintos—, así que la misma empresa podía verse "sin configurar" en una pantalla y con otro
 * detalle en la otra. Es el mismo problema que tenían las dos tablas de convenios: dos copias de una
 * sola verdad terminan divergiendo. Acá vive una vez y las dos pantallas la muestran.
 */
export interface RequisitoArca {
  clave: string;
  titulo: string;
  /** Si el requisito está cumplido. */
  ok: (c: Company) => boolean;
  /** Qué hay, cuando está cumplido: "5 convenios registrados". */
  resumen: (c: Company) => string;
  /** Qué desbloquea —y por lo tanto qué se rompe sin esto—. Se muestra cuando falta. */
  desbloquea: string;
  /** Detalle cuando ya está: mata el "listo" a secas, que no dice nada. */
  notaOk: (c: Company) => string;
  /** Dónde se resuelve. */
  ruta: (c: Company) => string;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export const REQUISITOS_ARCA: RequisitoArca[] = [
  {
    clave: 'convenios',
    titulo: 'Convenios',
    ok: (c) => (c.convenioIds || []).length > 0,
    resumen: (c) => plural((c.convenioIds || []).length, 'convenio registrado', 'convenios registrados'),
    desbloquea: 'Definen qué categorías profesionales se le pueden dar de alta: ARCA solo ofrece las de los convenios que el CUIT tiene registrados. Sin convenio no hay categoría posible.',
    notaOk: () => 'Definen qué categorías se le pueden dar de alta.',
    ruta: (c) => `/empresas/${c._id}/arca/convenios`,
  },
  {
    clave: 'domicilios',
    titulo: 'Domicilios de explotación',
    ok: (c) => (c.sucursalIds || []).length > 0,
    resumen: (c) => plural((c.sucursalIds || []).length, 'domicilio registrado', 'domicilios registrados'),
    desbloquea: 'El alta declara UN domicilio y UNA de sus actividades. Sin domicilios no hay dónde declarar el trabajo.',
    notaOk: () => 'Con sus actividades declaradas.',
    ruta: (c) => `/empresas/${c._id}/arca/domicilios`,
  },
  {
    clave: 'obras sociales',
    titulo: 'Obras sociales',
    ok: (c) => (c.obrasSocialesIds || []).length > 0,
    resumen: (c) => plural((c.obrasSocialesIds || []).length, 'obra social registrada', 'obras sociales registradas'),
    desbloquea: 'ARCA solo acepta altas con una de las obras sociales que el CUIT tiene declaradas. Sin ninguna registrada no se puede verificar que la del contrato sea válida, y el organismo la rechaza al subir el archivo.',
    // Tener obras sociales y no tener default no es un error, pero cambia a dónde va a parar quien no
    // hereda ninguna: conviene decirlo acá y no descubrirlo cuando el TXT ya salió.
    notaOk: (c) => ((c.obraSocialDefaultId ?? c.obraSocialId) != null ? 'Con una obra social para los excluidos de convenio (9999/99).' : 'Sin obra social para los excluidos de convenio: quien no herede ninguna va a usar la global del catálogo.'),
    ruta: (c) => `/empresas/${c._id}/arca/obras-sociales`,
  },
  {
    clave: 'cuit',
    titulo: 'CUIT',
    ok: (c) => !!c.cuit,
    resumen: (c) => `CUIT ${c.cuit}`,
    desbloquea: 'Sin CUIT no se sabe con qué sesión de ARCA se presenta el archivo.',
    notaOk: () => 'Es el CUIT con el que se sube el TXT.',
    ruta: () => '/empresas',
  },
];

export const faltantesArca = (c: Company) => REQUISITOS_ARCA.filter((r) => !r.ok(c));
export const cumplidosArca = (c: Company) => REQUISITOS_ARCA.length - faltantesArca(c).length;

/**
 * El estado de ARCA de una empleadora, como botón.
 *
 * El badge ENTERO es clickeable, no solo el ⓘ: un ícono de 12 píxeles es un blanco chico al lado de
 * algo que ya se lee como una unidad. Y lleva el "N de 4" porque "Sin configurar" no distingue a la
 * que no tiene nada de la que tiene tres de cuatro y está a un paso de poder operar.
 */
export const EstadoArcaBadge: React.FC<{ empresa: Company; onClick: (c: Company) => void; tamano?: 'sm' | 'md' }> = ({ empresa, onClick, tamano = 'sm' }) => {
  const listo = faltantesArca(empresa).length === 0;
  const cumplidos = cumplidosArca(empresa);
  const chico = tamano === 'sm';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(empresa);
      }}
      title={listo ? `Ver qué tiene registrado ante ARCA ${empresa.razonSocial}` : `Ver qué le falta a ${empresa.razonSocial} para ARCA`}
      aria-label={listo ? `Ver qué tiene registrado ante ARCA ${empresa.razonSocial}` : `Ver qué le falta a ${empresa.razonSocial} para ARCA`}
      className={`inline-flex items-center gap-1.5 rounded border transition-colors ${chico ? 'px-1.5 py-1' : 'px-2.5 py-1.5'} ${listo ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 hover:border-emerald-400 dark:hover:border-emerald-600' : 'bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900/60 hover:border-amber-400 dark:hover:border-amber-600'}`}
    >
      <FontAwesomeIcon icon={listo ? faCheck : faTriangleExclamation} className={`${chico ? 'h-2.5 w-2.5' : 'h-3 w-3'} ${listo ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`} />
      <span className={`font-bold whitespace-nowrap ${chico ? 'text-[10px]' : 'text-xs'} ${listo ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>
        {listo ? 'Lista para ARCA' : 'Sin configurar'}
        <span className="opacity-70 font-semibold">
          {' '}
          · {cumplidos} de {REQUISITOS_ARCA.length}
        </span>
      </span>
      <FontAwesomeIcon icon={faCircleInfo} className={`${chico ? 'h-3 w-3' : 'h-3.5 w-3.5'} ${listo ? 'text-emerald-700/70 dark:text-emerald-400/70' : 'text-amber-700/70 dark:text-amber-400/70'}`} />
    </button>
  );
};

/**
 * Los cuatro requisitos, uno por uno, para ESTA empleadora.
 *
 * Es el mismo modal en los dos estados a propósito: la pregunta es la misma —"¿puede dar altas?"— y
 * quien lo abre estando lista quiere ver CON QUÉ cuenta. Cada ítem es un link a donde se resuelve,
 * así que el modal no solo informa: es por donde se sale a arreglarlo.
 */
export const ArcaRequisitosModal: React.FC<{ empresa: Company | null; onClose: () => void }> = ({ empresa, onClose }) => {
  if (!empresa) return null;
  const listo = faltantesArca(empresa).length === 0;

  return (
    <InfoModal isOpen onClose={onClose} title={listo ? 'Lista para dar altas en ARCA' : 'Sin configurar para ARCA'} subtitle={`${empresa.razonSocial} · ${cumplidosArca(empresa)} de ${REQUISITOS_ARCA.length} requisitos`} size="md" actions={[{ label: 'Entendido', onClick: onClose, variant: 'primary' }]}>
      <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        {listo ? (
          <p>
            Esta empleadora tiene registrado ante ARCA todo lo que el organismo exige para dar un alta. Lo que sigue es <strong>lo que tiene declarado</strong>, y es el universo del que pueden elegir sus contratos: ARCA rechaza cualquier alta con un dato que no esté en estas listas.
          </p>
        ) : (
          <p>
            Esta empleadora todavía no tiene registrado ante ARCA todo lo que el organismo exige para dar un alta. Mientras falte algo, <strong>ninguno de sus contratos puede generar el TXT</strong>: el chequeo de Datos ARCA los va a marcar incompletos, o —peor— el archivo sale y el organismo lo rechaza.
          </p>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">No es un dato que se complete por contrato: se resuelve una vez para la empresa y vale para todos.</p>

        <div className="space-y-2">
          {REQUISITOS_ARCA.map((r) => {
            const ok = r.ok(empresa);
            return (
              <Link key={r.clave} to={r.ruta(empresa)} onClick={onClose} className={`flex items-start gap-2 rounded-lg border p-3 transition-colors ${ok ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/40' : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40'}`}>
                <FontAwesomeIcon icon={ok ? faCheck : faTriangleExclamation} className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>{r.titulo}</span>
                    {/* Cuando está listo, el estado dice CUÁNTO hay: "listo" a secas no distingue
                        entre un convenio cargado de prueba y los cinco que la empresa usa. */}
                    <span className={`ml-auto text-[11px] font-bold uppercase tracking-wider ${ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400'}`}>{ok ? r.resumen(empresa) : 'falta'}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5">{ok ? r.notaOk(empresa) : r.desbloquea}</p>
                </div>
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5 mt-1 shrink-0 text-gray-400" />
              </Link>
            );
          })}
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">El dato real sale del padrón del organismo, logueado con este CUIT: en Datos del Empleador están las obras sociales, los convenios y los domicilios que tiene declarados. Acá se refleja cuáles son.</p>
      </div>
    </InfoModal>
  );
};
