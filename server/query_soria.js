const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_development_integration');
  console.log("Connected to MongoDB!");
  
  const UserSchema = new mongoose.Schema({}, { strict: false });
  const User = mongoose.model('User', UserSchema, 'users');
  
  const RequestSchema = new mongoose.Schema({}, { strict: false });
  const Request = mongoose.model('Request', RequestSchema, 'requests');
  
  const soria = await User.findOne({ lastName: /Soria/i });
  if (!soria) {
    console.log("Soria not found!");
    await mongoose.disconnect();
    return;
  }
  console.log("Soria user id:", soria._id, soria.firstName, soria.lastName);
  
  const reports = await Request.find({
    date: { $gte: "2026-05-01", $lte: "2026-05-31" },
    "attendance.employeeId": soria._id
  });
  
  console.log(`Found ${reports.length} reports for Soria:`);
  reports.forEach(r => {
    const att = r.attendance.find(a => a.employeeId.toString() === soria._id.toString());
    console.log(`Date: ${r.date}, status: ${att.status}, inTime: ${att.inTime}, outTime: ${att.outTime}, overtimeHours: ${att.overtimeHours}`);
  });
  
  await mongoose.disconnect();
}

run().catch(console.error);
