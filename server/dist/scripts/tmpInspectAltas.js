import mongoose from "mongoose";
import { User } from "../models/User.js";
async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const names = ["Cairo", "lautaro", "MARTINA", "Camila", "nicolas"];
    const users = await User.find({
        $or: names.map((n) => ({ $or: [{ firstName: new RegExp(n, "i") }, { "metadata.fullName": new RegExp(n, "i") }] })),
    }).select("email firstName lastName metadata.isSolicitud metadata.solicitudStatus metadata.activo metadata.fullName metadata.projectIds projectIds tenantId").lean();
    for (const u of users) {
        console.log(JSON.stringify({
            name: u.metadata?.fullName || `${u.firstName} ${u.lastName}`,
            email: u.email,
            isSolicitud: u.metadata?.isSolicitud,
            solicitudStatus: u.metadata?.solicitudStatus,
            activo: u.metadata?.activo,
            metaProjectIds: (u.metadata?.projectIds || []).map(String),
            projectIds: (u.projectIds || []).map(String),
            tenantId: String(u.tenantId),
        }));
    }
    console.log("total:", users.length);
    await mongoose.disconnect();
}
main();
