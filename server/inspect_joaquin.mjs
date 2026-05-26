import mongoose from "mongoose";

async function test() {
  await mongoose.connect("mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/", { dbName: "weprodu_production_integration" });
  try {
    console.log("Connected to DB...");
    const db = mongoose.connection.db;

    const joaquin = await db.collection("users").findOne({ firstName: /Joaquin/i, lastName: /Navarro/i });
    const project = await db.collection("projects").findOne({ name: /426_LN/i });
    const allAreas = await db.collection("areas").find().toArray();
    const allShifts = await db.collection("shifts").find().toArray();

    const currentEmp = {
      id: String(joaquin._id),
      name: `${joaquin.firstName} ${joaquin.lastName}`,
      metadataProjects: joaquin.metadata?.projects || []
    };

    console.log("Joaquin metadataProjects:", currentEmp.metadataProjects);

    const teamConfigMember = project.teamConfig?.find(c => {
      const cUserId = typeof c.userId === "object" ? c.userId?._id : c.userId;
      return String(cUserId) === String(currentEmp.id);
    });

    console.log("Found teamConfigMember:", teamConfigMember);

    let areaId = "";
    let shiftId = "";

    if (teamConfigMember) {
      if (teamConfigMember.areaId) {
        areaId = String(teamConfigMember.areaId?._id || teamConfigMember.areaId);
      }
      if (teamConfigMember.shiftId) {
        shiftId = String(teamConfigMember.shiftId?._id || teamConfigMember.shiftId);
      }
      if ((!areaId || !shiftId) && teamConfigMember.areaShiftAssignments?.length > 0) {
        const firstAsa = teamConfigMember.areaShiftAssignments[0];
        if (!areaId) {
          areaId = String(firstAsa.areaId?._id || firstAsa.areaId || "");
        }
        if (!shiftId && firstAsa.shiftIds && firstAsa.shiftIds.length > 0) {
          shiftId = String(firstAsa.shiftIds[0]?._id || firstAsa.shiftIds[0] || "");
        }
      }
    }

    console.log("Resolved areaId:", areaId);
    console.log("Resolved shiftId:", shiftId);

    const areaName = allAreas.find((a) => String(a._id) === areaId)?.name || "";
    const shiftName = allShifts.find((s) => String(s._id || s.id) === shiftId)?.name || "";

    console.log("Resolved areaName:", areaName);
    console.log("Resolved shiftName:", shiftName);

  } catch(e) {
    console.error("ERROR:", e);
  }
  process.exit(0);
}
test();
