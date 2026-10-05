import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { User } from "../models/User.js";
async function resetPasswordsToDNI() {
    console.log("🌱 Conectando a la base de datos...");
    await connectDB();
    // Usuarios a excluir (creados en seedOnStart)
    const seedEmails = ["superadmin@example.com", "user@example.com", "colaborador@mobile.com", "coordinador@mobile.com", process.env.SEED_ADMIN_EMAIL || "admin@demo.com"];
    console.log("� Iniciando el reseteo de contraseñas...");
    try {
        const users = await User.find({ email: { $nin: seedEmails } });
        console.log(`� Se encontraron ${users.length} usuarios para procesar.`);
        let updatedCount = 0;
        let skippedCount = 0;
        for (const user of users) {
            const documento = user.metadata?.documento;
            if (documento && documento.trim() !== "") {
                const cleanDNI = documento.trim();
                user.password = cleanDNI;
                // El pre-save hook en models/User.ts se encargará de hashear la contraseña
                await user.save();
                console.log(`✅ Contraseña actualizada para: ${user.email} (DNI: ${cleanDNI})`);
                updatedCount++;
            }
            else {
                console.warn(`⚠️ Skippeando usuario ${user.email}: No tiene documento en metadata.`);
                skippedCount++;
            }
        }
        console.log("\n✨ Proceso finalizado:");
        console.log(`   - Actualizados: ${updatedCount}`);
        console.log(`   - Saltados: ${skippedCount}`);
    }
    catch (error) {
        console.error("❌ Error durante el proceso:", error);
    }
    finally {
        await disconnectDB();
        console.log("👋 Desconectado de la base de datos.");
        process.exit(0);
    }
}
resetPasswordsToDNI();
