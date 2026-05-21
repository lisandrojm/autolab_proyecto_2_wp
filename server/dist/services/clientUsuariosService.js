import { Client } from "../models/Client.js";
export async function addUserToClientUsuarios({ tenantId, clientId, userId, permiso = "ver", }) {
    const client = await Client.findOne({ _id: clientId, tenantId });
    if (!client) {
        throw new Error("Client not found");
    }
    const existingUser = client.usuarios?.find((u) => u.userId.toString() === userId.toString());
    if (existingUser) {
        existingUser.permiso = permiso;
    }
    else {
        if (!client.usuarios) {
            client.usuarios = [];
        }
        client.usuarios.push({ userId, permiso });
    }
    await client.save();
}
export async function removeUserFromClientUsuarios(tenantId, clientId, userId) {
    const client = await Client.findOne({ _id: clientId, tenantId });
    if (!client) {
        throw new Error("Client not found");
    }
    if (client.usuarios) {
        client.usuarios = client.usuarios.filter((u) => u.userId.toString() !== userId.toString());
        await client.save();
    }
}
