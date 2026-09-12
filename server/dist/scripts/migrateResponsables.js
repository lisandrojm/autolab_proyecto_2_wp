import mongoose from 'mongoose';
import { Project } from '../models/Project.js';
import { User } from '../models/User.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env.development') });
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGO_DB_NAME;
async function run() {
    if (!MONGO_URI || !DB_NAME) {
        console.error('Missing MONGO_URI or MONGO_DB_NAME');
        process.exit(1);
    }
    const connectionString = `${MONGO_URI}${DB_NAME}`;
    console.log('Connecting to:', connectionString);
    await mongoose.connect(connectionString);
    console.log('Connected to MongoDB');
    const projects = await Project.find({});
    console.log(`Found ${projects.length} projects`);
    let updatedCount = 0;
    for (const project of projects) {
        const responsableId = project.metadata?.responsableId;
        if (!responsableId) {
            console.log(`Project ${project.name} has no responsableId in metadata.`);
            continue;
        }
        const tenantId = project.tenantId;
        // Find the user by metadata.id
        const user = await User.findOne({
            tenantId,
            'metadata.id': responsableId
        });
        if (!user) {
            console.warn(`User with metadata.id ${responsableId} not found for tenant ${tenantId} (Project: ${project.name})`);
            continue;
        }
        /*
          Antes esto le agregaba el rol "Responsable de Proyecto", buscándolo por nombre. Poder quedar a
          cargo de un proyecto dejó de ser un rol: es un tilde en la ficha de la persona, que es lo que
          lee el selector de responsable (`GET /users/eligible-responsables`).
        */
        if (!user.isProjectResponsible) {
            user.isProjectResponsible = true;
            await user.save();
            console.log(`[UPDATED] Marked as project responsible: ${user.firstName} ${user.lastName} (ID: ${responsableId}) - Project: ${project.name}`);
            updatedCount++;
        }
        else {
            console.log(`[SKIP] User ${user.firstName} ${user.lastName} is already marked - Project: ${project.name}`);
        }
    }
    console.log(`\nMigration complete. Total users updated: ${updatedCount}`);
    await mongoose.disconnect();
}
run().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
