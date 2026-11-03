import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { datosPlanillaJornaleros } from "../services/planillaJornaleros.js";
const t0 = Date.now();
await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
const t: any = await Tenant.findOne({ slug: "demo-tenant" }).lean();
try {
  const p = await datosPlanillaJornaleros(t._id, "2026-10");
  console.log("OK", Date.now() - t0, "ms", JSON.stringify(p.totales), p.advertencias?.length);
} catch (e) { console.error("ERR", Date.now() - t0, "ms", e); }
await mongoose.disconnect();
