import mongoose from "mongoose";
import { Order } from "./dist/models/Order.js";

async function test() {
  await mongoose.connect("mongodb://localhost:27017/autolab");
  try {
    const o = new Order({
      tenantId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      category: "other",
      futureActions: [{
        requiereAccionFutura: true,
        tipoAccionFutura: "otra",
        descripcionAccion: "Test"
      }]
    });
    await o.validate();
    console.log("Validated ok");
  } catch(e) {
    console.error("FAIL:", e);
  }
  process.exit(0);
}
test();
