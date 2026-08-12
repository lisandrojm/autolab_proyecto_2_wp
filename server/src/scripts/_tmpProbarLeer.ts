import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { Tenant } from "../models/Tenant.js";

await mongoose.connect(`${process.env.MONGO_URI}`, { dbName: process.env.MONGO_DB_NAME });
const tenant: any = await Tenant.findOne({ slug: "demo-tenant" }).lean();

const token = jwt.sign(
  { sub: String(tenant._id), email: "diagnostico@local", roles: ["admin"], primaryRole: "admin", tenantId: String(tenant._id), tenantSlug: tenant.slug },
  process.env.JWT_SECRET!,
  { expiresIn: "10m" },
);

// prueba:true => solo conecta a la casilla y cuenta avisos. NO escribe en Dropbox ni marca mails.
const r = await fetch("https://autolab.fun:7001/api/v1/dropbox-sign/leer", {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-tenant-id": "demo-tenant", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ prueba: true }),
});
console.log("HTTP", r.status, r.status === 404 ? "← la ruta NO existe todavia en el server" : "← la ruta ya existe");
console.log(await r.text());
await mongoose.disconnect();
