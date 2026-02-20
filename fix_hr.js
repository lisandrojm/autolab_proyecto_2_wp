const fs = require('fs');
const file = './server/src/routes/hr-management.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/select: "firstName lastName email positionId metadata",/g, 'select: "firstName lastName email positionId metadata clientIds",');

content = content.replace(/\{\s*path:\s*"metadata.projects",\s*select:\s*"nombre_rol_frame"\s*\}/g, `{
              path: "metadata.projects",
              select: "nombre_rol_frame nombre_proyecto projectId",
              populate: {
                path: "projectId",
                select: "clientId",
                populate: { path: "clientId", select: "name" }
              }
            }`);

// Add populate clientIds directly on userId populate array:
content = content.replace(/\{\s*path:\s*"positionId",\s*select:\s*"name"\s*\},\n/g, '{ path: "positionId", select: "name" },\n            { path: "clientIds", select: "name" },\n');

fs.writeFileSync(file, content);
console.log('done');
