import fs from 'fs';
const path = 'server/src/routes/hr-management.ts';
let code = fs.readFileSync(path, 'utf8');

// Replace " positionId " or " positionId" in select strings
code = code.replace(/ positionId /g, ' ');
code = code.replace(/ positionId"/g, '"');

// Replace { path: "positionId", select: "name" },
code = code.replace(/\{\s*path:\s*"positionId",\s*select:\s*"name"\s*\},?\s*/g, '');

fs.writeFileSync(path, code);
