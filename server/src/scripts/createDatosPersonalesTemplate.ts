import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { Tenant } from "../models/Tenant.js";
import { Pdf } from "../models/Pdf.js";

/**
 * Crea (o actualiza) la plantilla PDF "Solicitud de Datos Personales"
 * (code = "datosPersonales") para un tenant.
 *
 * Uso: TENANT_SLUG=demo-tenant ./node_modules/.bin/dotenv -e .env.production -- \
 *        ./node_modules/.bin/tsx src/scripts/createDatosPersonalesTemplate.ts
 *
 * Idempotente: upsert por { tenantId, code } (índice único).
 */

const NAME = "Solicitud de Datos Personales";
const TITLE = "SOLICITUD DE MODIFICACIÓN DE DATOS PERSONALES";

const CONTENT = `<p>Por medio de la presente, <strong>{{nombreUsuario}}</strong> solicita la actualización de sus datos personales registrados en el sistema, conforme al detalle que se consigna a continuación.</p>

<p><strong>Detalle de la información a modificar:</strong></p>
{{datosModificados}}

<p>La presente solicitud (N.° <strong>{{numeroOrden}}</strong>) reviste carácter de declaración jurada. El/la solicitante manifiesta que los datos consignados son veraces y exactos, y asume la responsabilidad por cualquier inexactitud. La modificación se hará efectiva una vez aprobada por el área de Recursos Humanos.</p>

{{textoAdicional}}

<p>En prueba de conformidad, se firma la presente solicitud.</p>

<p style="margin-top:40px;">{{fechaCompleta}}</p>`;

async function main() {
  const tenantSlug = process.env.TENANT_SLUG?.trim();
  const tenantIdEnv = process.env.TENANT_ID?.trim();

  if (!tenantSlug && !tenantIdEnv) {
    console.error("❌ Falta TENANT_SLUG=<slug> (o TENANT_ID=<ObjectId>).");
    process.exit(1);
  }

  await connectDB();

  try {
    const tenant = tenantIdEnv
      ? await Tenant.findById(tenantIdEnv).select("_id slug name")
      : await Tenant.findOne({ slug: tenantSlug }).select("_id slug name");

    if (!tenant) {
      console.error(`❌ Tenant no encontrado (${tenantSlug || tenantIdEnv}).`);
      await disconnectDB();
      process.exit(1);
    }

    console.log(`🏢 Tenant: ${tenant.name} (slug=${tenant.slug}, id=${tenant._id})`);

    const existing = await Pdf.findOne({ tenantId: tenant._id, code: "datosPersonales" });

    const result = await Pdf.findOneAndUpdate(
      { tenantId: tenant._id, code: "datosPersonales" },
      {
        $set: {
          name: NAME,
          title: TITLE,
          content: CONTENT,
          isActive: true,
        },
        $setOnInsert: {
          tenantId: tenant._id,
          code: "datosPersonales",
        },
      },
      { upsert: true, new: true },
    );

    console.log(existing ? "♻️  Plantilla actualizada." : "✅ Plantilla creada.");
    console.log(`   _id=${result?._id} · name="${result?.name}" · code=${result?.code} · activa=${result?.isActive}`);
  } finally {
    await disconnectDB();
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
