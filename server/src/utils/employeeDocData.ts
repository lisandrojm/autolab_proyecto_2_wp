import { CategoriaSat } from "../models/CategoriaSat.js";
import { numeroALetras } from "./numeroALetras.js";
import { formatDateAr } from "./releaseFiller.js";

const num = (n: any): string => (n != null && n !== "" && !isNaN(Number(n)) ? Number(n).toLocaleString("es-AR") : "");

/**
 * Construye el mapa de variables para rellenar plantillas .docx (contratos y releases)
 * a partir del empleado, su UserProject en el proyecto y el contrato seleccionado.
 *
 * Provee múltiples alias (camelCase y nombres usados en las plantillas) para máxima cobertura.
 * Las variables que no estén acá quedan visibles como {variable} (ver nullGetter en releaseFiller).
 */
export async function buildEmployeeDocData(user: any, up: any, contract: any): Promise<Record<string, any>> {
  const meta: any = user?.metadata || {};
  const c: any = contract || {};
  const nombre = user?.firstName || "";
  const apellido = user?.lastName || "";

  // Número de categoría SAT (lookup por el id externo guardado en el contrato)
  let catSatNumero = "";
  let catSatNombre = c.nombre_categoria_sat || "";
  if (c.categoria_sat_id != null) {
    try {
      const cat = await CategoriaSat.findOne({ "data.id": Number(c.categoria_sat_id) }).lean();
      if (cat) {
        catSatNumero = String((cat as any).data?.numeroCategoria ?? (cat as any).data?.id ?? "");
        catSatNombre = catSatNombre || (cat as any).name || (cat as any).data?.nombre || "";
      }
    } catch {
      /* sin categoría → queda vacío */
    }
  }
  if (!catSatNumero && c.categoria_sat_id != null) catSatNumero = String(c.categoria_sat_id);

  const sueldoJornadaNum = Number(c.sueldo_jornada) || 0;
  const sueldoManoNum = Number(c.sueldo_mano) || 0;

  return {
    // ── Datos personales ──
    nombre,
    apellido,
    nombreCompleto: `${nombre} ${apellido}`.trim(),
    dni: meta.documento || "",
    documento: meta.documento || "",
    cuit: meta.cuit || "",
    email: user?.email || "",
    fechaDeNacimiento: formatDateAr(meta.fechaNac),
    fechaNacimiento: formatDateAr(meta.fechaNac),
    estadoCivil: meta.estadoCivil || "",
    telefono: meta.telefono || "",
    telefono2: meta.telefono2 || "",

    // ── Domicilio ──
    direccion: meta.calle || "",
    calle: meta.calle || "",
    altura: meta.altura || "",
    pisoDepto: meta.pisoDepto || "",
    localidad: meta.localidad || "",
    codigoPostal: meta.codigoPostal || "",

    // ── Datos bancarios ──
    cbu: meta.cbu || "",
    aliasBancario: meta.aliasBancario || "",
    nroDeCuentaBancaria: meta.nroDeCuentaBancaria || "",
    tipoDeCuentaBancaria: meta.tipoDeCuentaBancaria || "",

    // ── Datos del contrato ──
    nombreProyecto: c.nombre_proyecto || up?.nombre_proyecto || "",
    rolFrame: c.nombre_rol_frame || up?.nombre_rol_frame || "",
    nombreRolFrame: c.nombre_rol_frame || up?.nombre_rol_frame || "",
    nombreContrato: c.nombre_contrato || "",
    nombreSede: c.nombre_sede || "",
    sede: c.nombre_sede || "",
    nombreCargo: c.nombre_cargo || "",
    cargo: c.nombre_cargo || "",
    nombreNivel: c.nombre_nivel || "",
    nivel: c.nombre_nivel || "",
    nombreArea: c.nombre_area || "",
    area: c.nombre_area || "",
    nombreTurno: c.nombre_turno || "",
    turno: c.nombre_turno || "",
    fechaAltaContrato: formatDateAr(c.fecha_alta_contrato),
    fechaBajaContrato: formatDateAr(c.fecha_baja_contrato),
    horaInicio: c.hora_inicio || "",
    horaFin: c.hora_fin || "",
    cantidadJornadas: c.cantidad_jornadas_laborales != null ? String(c.cantidad_jornadas_laborales) : "",

    // ── Categoría SAT ──
    catSatNumero,
    categoriaSat: catSatNombre,
    nombreCategoriaSat: catSatNombre,

    // ── Sueldos ──
    SueldoJornada: num(sueldoJornadaNum),
    sueldoJornada: num(sueldoJornadaNum),
    SueldoJornadaLetras: numeroALetras(sueldoJornadaNum),
    sueldoJornadaLetras: numeroALetras(sueldoJornadaNum),
    sueldoMano: num(sueldoManoNum),
    SueldoMano: num(sueldoManoNum),
    sueldoManoLetras: c.sueldo_mano_texto || numeroALetras(sueldoManoNum),
    SueldoManoLetras: c.sueldo_mano_texto || numeroALetras(sueldoManoNum),
    sueldoNeto: num(c.sueldo_neto),
    sueldoBruto: num(c.sueldo_bruto),
    sueldoDiarioNeto: num(c.sueldo_diario_neto),

    // ── Otros ──
    fecha: formatDateAr(new Date()),
  };
}
