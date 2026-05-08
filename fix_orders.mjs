import fs from 'fs';
const path = 'server/src/routes/orders.ts';
let code = fs.readFileSync(path, 'utf8');
code = code.replace(/select: "firstName lastName email positionId metadata",\s*populate: \[\s*\{\s*path: "positionId", select: "name"\s*\},\s*\{\s*path: "metadata.projects"/g, 
  'select: "firstName lastName email metadata",\n        populate: [\n          { path: "metadata.projects"');
fs.writeFileSync(path, code);
