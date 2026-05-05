import mongoose from "mongoose";
import { env } from "./env.js";
function maskMongoUri(uri) {
    try {
        const u = new URL(uri);
        if (u.username)
            u.username = "****";
        if (u.password)
            u.password = "****";
        return u.toString();
    }
    catch {
        return uri.replace(/\/\/[^@]*@/, "//****:****@");
    }
}
export async function connectDB() {
    console.log("[db] NODE_ENV:", env.NODE_ENV);
    console.log("[db] MONGO_DB_NAME:", env.MONGO_DB_NAME);
    console.log("[db] MONGO_URI:", maskMongoUri(env.MONGO_URI));
    // Debug en desarrollo
    if (env.NODE_ENV === "development") {
        mongoose.set("debug", true);
    }
    mongoose.connection.on("error", (err) => {
        console.error("[db] connection error:", err?.message || err);
    });
    mongoose.connection.on("connected", () => {
        console.log("[db] ✅ MongoDB connected successfully");
    });
    console.log("[db] connecting...");
    const clientOptions = {
        dbName: env.MONGO_DB_NAME,
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 20000,
    };
    try {
        await mongoose.connect(env.MONGO_URI, clientOptions);
        console.log("[db] connected:", {
            host: mongoose.connection.host,
            name: mongoose.connection.name,
            readyState: mongoose.connection.readyState, // 1 = connected
        });
    }
    catch (err) {
        console.error("[db] FAILED to connect:", err?.message || err);
        throw err;
    }
}
export async function disconnectDB() {
    await mongoose.disconnect();
    console.log("[db] disconnected");
}
