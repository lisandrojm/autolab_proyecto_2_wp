import { Info } from "../models/Info.js";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TIPOS DE ENTIDAD FINANCIERA: Banco, Billetera Virtual, Compañía Financiera…
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Eran una lista fija en el código, repetida en tres pantallas. Ahora se administran desde
 * Entidades Financieras → Tipos, y cada uno dice QUÉ DATOS PIDE: una billetera no tiene tipo ni número
 * de cuenta, y su número se llama CVU y no CBU. Eso es lo que arma la cascada de datos bancarios del
 * registro y de la ficha de usuario.
 *
 * `clave` es lo que queda guardado en cada entidad (`Banco.tipoEntidad`) y en cada persona
 * (`metadata.tipoEntidadFinanciera`). Por eso sale del nombre al crear y NO se cambia después: el nombre
 * se puede corregir, la clave no.
 *
 * VIVE EN `infos` (type "tipo-entidad-financiera") y no en una colección propia: el cluster de Atlas
 * está en su tope de colecciones.
 */

export const TIPO_INFO = "tipo-entidad-financiera";

/** «No tengo Banco» no es un tipo de entidad: es la ausencia de una. No se puede crear con esa clave. */
export const CLAVE_SIN_BANCO = "sin_banco";

export const ROTULOS_CBU = ["CBU", "CVU", "CBU/CVU"] as const;
export type RotuloCbu = (typeof ROTULOS_CBU)[number];

export interface TipoEntidadFinanciera {
  _id: string;
  clave: string;
  nombre: string;
  /** Si se ofrece en los selectores. Quien ya lo tiene cargado lo sigue viendo. */
  activo: boolean;
  pideTipoCuenta: boolean;
  pideNroCuenta: boolean;
  rotuloCbu: RotuloCbu;
  orden: number;
}

/** Los que existían en el código: se cargan solos la primera vez, con la misma configuración que tenían. */
const INICIALES: Omit<TipoEntidadFinanciera, "_id" | "activo" | "orden">[] = [
  { clave: "banco", nombre: "Banco", pideTipoCuenta: true, pideNroCuenta: true, rotuloCbu: "CBU" },
  { clave: "billetera_virtual", nombre: "Billetera Virtual", pideTipoCuenta: false, pideNroCuenta: false, rotuloCbu: "CVU" },
  { clave: "compania_financiera", nombre: "Compañía Financiera", pideTipoCuenta: false, pideNroCuenta: true, rotuloCbu: "CBU" },
  { clave: "caja_credito", nombre: "Caja de Crédito", pideTipoCuenta: true, pideNroCuenta: true, rotuloCbu: "CBU" },
  { clave: "otro", nombre: "Otro", pideTipoCuenta: false, pideNroCuenta: false, rotuloCbu: "CBU/CVU" },
];

export const aTipo = (d: any): TipoEntidadFinanciera => ({
  _id: String(d._id),
  clave: String(d.externalId || d.data?.clave || ""),
  nombre: String(d.name || d.data?.nombre || ""),
  activo: d.data?.activo !== false,
  pideTipoCuenta: !!d.data?.pideTipoCuenta,
  pideNroCuenta: !!d.data?.pideNroCuenta,
  rotuloCbu: (ROTULOS_CBU as readonly string[]).includes(d.data?.rotuloCbu) ? d.data.rotuloCbu : "CBU/CVU",
  orden: Number(d.data?.orden) || 0,
});

/** «Compañía Financiera» → «compania_financiera»: sin acentos, minúsculas y guiones bajos. */
export const claveDesdeNombre = (nombre: string): string =>
  nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

let sembrado = false;

/**
 * Carga los tipos de siempre si todavía no hay NINGUNO.
 *
 * Sólo con cero, no «si falta alguno»: si alguien borró «Otro» a propósito, no tiene que volver a
 * aparecer al reiniciar el server. Y por clave con upsert, así dos pedidos a la vez no los duplican.
 */
async function asegurarTiposIniciales(): Promise<void> {
  if (sembrado) return;
  const hay = await Info.countDocuments({ type: TIPO_INFO });
  if (hay === 0) {
    await Info.bulkWrite(
      INICIALES.map((t, i) => ({
        updateOne: {
          filter: { type: TIPO_INFO, externalId: t.clave },
          update: { $setOnInsert: { type: TIPO_INFO, externalId: t.clave, name: t.nombre, data: { id: i + 1, nombre: t.nombre, clave: t.clave, activo: true, pideTipoCuenta: t.pideTipoCuenta, pideNroCuenta: t.pideNroCuenta, rotuloCbu: t.rotuloCbu, orden: i + 1 } } },
          upsert: true,
        },
      })),
      { strict: false } as any,
    );
  }
  sembrado = true;
}

/** Todos los tipos, en su orden. `soloActivos` para lo que se ofrece a elegir (el registro público). */
export async function listarTipos(soloActivos = false): Promise<TipoEntidadFinanciera[]> {
  await asegurarTiposIniciales();
  const docs = await Info.find({ type: TIPO_INFO }).lean();
  return docs
    .map(aTipo)
    .filter((t) => !soloActivos || t.activo)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}
