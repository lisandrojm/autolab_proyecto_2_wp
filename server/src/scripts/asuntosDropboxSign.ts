import "dotenv/config";
import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { clienteImap, extraerArchivoDeAsunto } from "../services/dropboxSignMailService.js";
import { extraerArchivoFirmado, REMITENTE_FIRMADO } from "../services/rescateFirmados.js";

/**
 * DIAGNÓSTICO DE ASUNTOS DE DROPBOX SIGN: imprime los asuntos únicos de los últimos 30 días de la
 * casilla que NO matchean ni `ASUNTO_ENVIO` ni `ASUNTO_FIRMADO`, para agregar esas formas reales como
 * fixtures en vez de inventarlas. Solo lectura. Anonimiza emails, CUIL y nombres de archivo largos.
 *
 *   TENANT=<slug|id> npm run dropbox-sign:asuntos
 */
async function main() {
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  const ref = String(process.env.TENANT || "").trim();
  const tenant: any = ref ? await Tenant.findOne(mongoose.isValidObjectId(ref) ? { _id: ref } : { slug: ref }).lean() : await Tenant.findOne({}).lean();
  if (!tenant) throw new Error(`No se encontró el tenant «${ref || "(primero)"}».`);
  const cfg: any = tenant.integrations?.dropboxSign || {};
  if (!cfg.email || !cfg.imapHost || !cfg.imapPasswordEnc) throw new Error("La casilla no está configurada.");
  console.log(`Tenant: ${tenant.name || tenant.slug} · casilla ${cfg.email}`);

  const anonimo = (s: string) =>
    s
      .replace(/[A-Za-z0-9.%+-]+-ARROBA-[A-Za-z0-9.-]+/g, "fulano-ARROBA-mail.com")
      .replace(/[A-Za-z0-9.%+-]+@[A-Za-z0-9.-]+/g, "fulano@mail.com")
      .replace(/(?<!\d)\d{11}(?!\d)/g, "20000000000");

  const client = clienteImap(cfg);
  client.on("error", (e: any) => console.warn("IMAP:", e?.message || e));
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  const conteo = { envio: 0, firmado: 0, otros: 0 };
  const otros = new Map<string, number>();
  try {
    const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const uids = await client.search({ from: REMITENTE_FIRMADO, since: desde }, { uid: true });
    console.log(`${(uids || []).length} mensaje(s) de ${REMITENTE_FIRMADO} en 30 días.`);
    if (uids && uids.length) {
      for await (const m of client.fetch(uids.join(","), { envelope: true }, { uid: true })) {
        const asunto = String((m as any)?.envelope?.subject || "");
        if (extraerArchivoDeAsunto(asunto)) conteo.envio++;
        else if (extraerArchivoFirmado(asunto)) conteo.firmado++;
        else {
          conteo.otros++;
          const forma = anonimo(asunto).replace(/\d{3,}_[A-Z+]+_/g, "NNN_PROY_").slice(0, 160);
          otros.set(forma, (otros.get(forma) || 0) + 1);
        }
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => client.close());
  }
  console.log(`Envío: ${conteo.envio} · Firmado: ${conteo.firmado} · Sin clasificar: ${conteo.otros}`);
  for (const [forma, n] of [...otros.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)} × ${forma}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
