import fs from 'fs';

const files = [
  'server/src/routes/hr-management.ts',
  'server/src/routes/hr-admin.ts'
];

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');

  // Replace " turnos " or " turnos" or "turnos " in select strings
  code = code.replace(/ turnos"/g, '"');
  code = code.replace(/ turnos /g, ' ');
  code = code.replace(/"turnos /g, '"');

  // Replace { path: "turnos", select: "name startTime endTime days", model: "Shift" },
  code = code.replace(/\{\s*path:\s*"turnos",\s*select:\s*"name startTime endTime days",\s*model:\s*"Shift"\s*\},?\s*/g, '');

  // Replace .populate("turnos", "name startTime endTime days") in hr-admin.ts
  code = code.replace(/\.populate\("turnos",\s*"name startTime endTime days"\)/g, '');

  fs.writeFileSync(file, code);
  console.log(`Fixed ${file}`);
}
