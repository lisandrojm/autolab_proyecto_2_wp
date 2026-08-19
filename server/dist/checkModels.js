import mongoose from "mongoose";
import "dotenv/config";
async function checkModels() {
    const uri = "mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_development_integration";
    try {
        await mongoose.connect(uri);
        console.log("Registered models:", mongoose.modelNames());
        if (mongoose.modelNames().includes("UserProject")) {
            console.log("UserProject is registered");
        }
        else {
            console.log("UserProject IS NOT registered");
        }
    }
    catch (err) {
        console.error("Error:", err);
    }
    finally {
        await mongoose.disconnect();
    }
}
checkModels();
