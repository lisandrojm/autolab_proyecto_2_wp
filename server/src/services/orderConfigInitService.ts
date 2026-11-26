import { Types } from "mongoose";
import { OrderConfig } from "../models/OrderConfig.js";
import { Pdf } from "../models/Pdf.js";
import { CATEGORIA_CAMBIO_TURNO, NOMBRE_CAMBIO_TURNO, PLANTILLA_CAMBIO_TURNO, REGLAS_CAMBIO_TURNO_POR_DEFECTO, SYSTEM_KEY_CAMBIO_TURNO } from "../compartido/cambioDeTurno.js";

/**
 * LA PLANTILLA PDF «Solicitud de cambio de turno», como las demás plantillas por defecto de pedidos
 * (`scripts/seedOnStart.ts`, que la incluye en su lista). Se siembra acá también porque el seed sólo corre
 * con SEED_ON_START y el tipo de sistema tiene que nacer con su plantilla asignada. Las variables
 * `turnoActual`, `turnoSolicitado`, `proyecto`, `area`, `vigencia` y `motivo` las arma
 * `utils/pdfVariableReplacer.ts` a partir de `metadata.cambioTurno` y `dynamicValue`.
 */
export const PLANTILLA_CAMBIO_TURNO_POR_DEFECTO = {
  code: PLANTILLA_CAMBIO_TURNO,
  name: "Solicitud de cambio de turno",
  content: `Por la presente notifico que hemos aprobado su solicitud de {{categoria}} N° {{numeroOrden}} en el proyecto {{proyecto}}, área {{area}}: pasa del turno {{turnoActual}} al turno {{turnoSolicitado}} {{vigencia}}.

Motivo informado: {{motivo}}.

El cambio se hace efectivo en el equipo del proyecto en la fecha indicada y queda sujeto a las políticas internas de la empresa y a la coordinación con su supervisor directo.`,
  variablesHint: "Variables: categoria, numeroOrden, proyecto, area, turnoActual, turnoSolicitado, fechaDesde, fechaHasta, vigencia, motivo, nombreUsuario, textoAdicional",
  isActive: true,
};

/** La plantilla del tenant (se crea si falta) y, si el tipo no tiene plantilla asignada, se la asigna. */
async function asegurarPlantillaCambioTurno(tid: Types.ObjectId, tipo: any): Promise<void> {
  let plantilla = await Pdf.findOne({ tenantId: tid, code: PLANTILLA_CAMBIO_TURNO });
  if (!plantilla) {
    console.log(`[OrderConfigInit] Creando la plantilla «${PLANTILLA_CAMBIO_TURNO_POR_DEFECTO.name}» para el tenant ${tid}`);
    plantilla = await Pdf.create({ ...PLANTILLA_CAMBIO_TURNO_POR_DEFECTO, tenantId: tid });
  }
  if (!tipo.pdfId) {
    tipo.pdfId = plantilla._id;
    await tipo.save();
  }
}

/*
  TIPOS DE PEDIDO DE SISTEMA (26/11/2026). Mismo patrón que `shiftInitService.ts`: al arrancar el server se
  recorren los tenants y se garantiza que cada uno tenga el tipo «Cambio de turno». Si ya existe uno con ese
  nombre (alguien lo creó a mano), se lo ASIMILA: se marca `isSystem` y se le pone la clave y el tipo de dato,
  igual que con el turno «Oficina». Si no, se crea al final del orden, activo y sin firma por defecto.

  Se reconoce por `systemKey`, no por nombre: el nombre se puede cambiar desde la pantalla (como los turnos).
*/

export async function ensureDefaultOrderConfigs(tenantId: Types.ObjectId | string): Promise<void> {
  const tid = new Types.ObjectId(tenantId);

  // Igual que los turnos: el tenant de sistema no lleva tipos de pedido.
  const { Tenant } = await import("../models/Tenant.js");
  const tenant = await Tenant.findById(tid);
  if (tenant?.isSystem || tenant?.slug === "superadmin") return;

  let tipo = await OrderConfig.findOne({ tenantId: tid, systemKey: SYSTEM_KEY_CAMBIO_TURNO });

  if (!tipo) {
    // 1. Uno con ese nombre, hecho a mano: se asimila.
    const porNombre = await OrderConfig.findOne({ tenantId: tid, name: { $regex: new RegExp(`^${NOMBRE_CAMBIO_TURNO}$`, "i") } });
    if (porNombre) {
      console.log(`[OrderConfigInit] Asimilando «${porNombre.name}» como tipo de sistema para el tenant ${tid}`);
      porNombre.isSystem = true;
      porNombre.systemKey = SYSTEM_KEY_CAMBIO_TURNO;
      porNombre.categoryType = CATEGORIA_CAMBIO_TURNO;
      porNombre.config = { ...(porNombre.config || {}), reglasCambioTurno: { ...REGLAS_CAMBIO_TURNO_POR_DEFECTO, ...((porNombre.config as any)?.reglasCambioTurno || {}) } };
      porNombre.markModified("config");
      await porNombre.save();
      tipo = porNombre;
    } else {
      // 2. Se crea, al final del orden.
      const ultimo = await OrderConfig.findOne({ tenantId: tid }).sort({ sortOrder: -1 }).select("sortOrder").lean();
      console.log(`[OrderConfigInit] Creando «${NOMBRE_CAMBIO_TURNO}» para el tenant ${tid}`);
      tipo = await OrderConfig.create({
        tenantId: tid,
        name: NOMBRE_CAMBIO_TURNO,
        informacion: "Pedí pasar a otro turno de tu área desde una fecha. Si indicás hasta cuándo, el cambio es temporal y después volvés a tu turno.",
        isSystem: true,
        systemKey: SYSTEM_KEY_CAMBIO_TURNO,
        categoryType: CATEGORIA_CAMBIO_TURNO,
        isActive: true,
        sortOrder: (ultimo?.sortOrder ?? 0) + 1,
        requiresSignature: false,
        requiresAction: false,
        config: { reglasCambioTurno: { ...REGLAS_CAMBIO_TURNO_POR_DEFECTO } },
      });
    }
  } else if (!tipo.isSystem || tipo.categoryType !== CATEGORIA_CAMBIO_TURNO) {
    // Quedó destildado o con otro tipo de dato (datos viejos): se vuelve a dejar como tipo de sistema.
    tipo.isSystem = true;
    tipo.categoryType = CATEGORIA_CAMBIO_TURNO;
    await tipo.save();
  }

  // Nace con su plantilla PDF («Plantilla asignada automáticamente», como los demás tipos).
  await asegurarPlantillaCambioTurno(tid, tipo);
}

/** Recorre todos los tenants. Se llama al arrancar (`server.ts`), junto a roles y turnos. */
export async function ensureAllTenantsHaveDefaultOrderConfigs(): Promise<void> {
  try {
    const { Tenant } = await import("../models/Tenant.js");
    const tenants = await Tenant.find({});
    console.log(`[OrderConfigInit] Verificando tipos de pedido de sistema en ${tenants.length} tenants...`);
    for (const tenant of tenants) {
      await ensureDefaultOrderConfigs(new Types.ObjectId(tenant._id as any));
    }
    console.log("[OrderConfigInit] Tipos de pedido de sistema verificados");
  } catch (error) {
    console.error("[OrderConfigInit] Error asegurando los tipos de pedido de sistema:", error);
    throw error;
  }
}
