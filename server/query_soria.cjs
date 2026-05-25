const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb+srv://lisandrojm_db_user:yKwTIl8vUqpVbSLw@autolab.n2rqx6g.mongodb.net/weprodu_production_integration');
  console.log("Connected to production MongoDB!");
  
  const UserSchema = new mongoose.Schema({}, { strict: false });
  const User = mongoose.model('User', UserSchema, 'users');
  
  const RequestSchema = new mongoose.Schema({}, { strict: false });
  const Request = mongoose.model('Request', RequestSchema, 'requests');
  
  const users = await User.find({ $or: [{ lastName: /Soria/i }, { firstName: /Soria/i }] });
  console.log("Found users matching Soria:", users.map(u => ({ id: u._id, name: `${u.firstName} ${u.lastName}` })));
  
  if (users.length === 0) {
    await mongoose.disconnect();
    return;
  }
  
  const userIdsStr = users.map(u => u._id.toString());
  
  // Find all requests containing Soria
  const allReports = await Request.find({});
  console.log("Total requests in database:", allReports.length);
  
  const soriaReports = allReports.filter(r => {
    if (!r.attendance) return false;
    return r.attendance.some(a => {
      const empId = a.employeeId ? a.employeeId.toString() : '';
      return userIdsStr.includes(empId);
    });
  });
  
  console.log(`Found ${soriaReports.length} Soria reports in total:`);
  soriaReports.forEach(r => {
    const att = r.attendance.find(a => userIdsStr.includes(a.employeeId ? a.employeeId.toString() : ''));
    console.log(`Date: ${r.date}, status: ${att.status}, inTime: ${att.inTime}, outTime: ${att.outTime}, overtimeHours: ${att.overtimeHours}`);
  });
  
  await mongoose.disconnect();
}

run().catch(console.error);
