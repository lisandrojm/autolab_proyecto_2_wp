import fs from "fs";
import path from "path";

const files = ["server/src/routes/hr-management.ts", "server/src/routes/hr-admin.ts", "server/src/routes/orders.ts", "server/src/routes/vacations.ts", "server/src/routes/requests.ts", "server/src/routes/futureActions.ts", "server/src/scripts/seedOnStart.ts"];

const projectRoot = "c:/wamp64/www/clientes/autolab_proyecto_2_wp";

files.forEach((file) => {
  const fullPath = path.join(projectRoot, file);
  if (fs.existsSync(fullPath)) {
    console.log(`Processing ${file}...`);
    let content = fs.readFileSync(fullPath, "utf8");

    // Remove import (various formats)
    const importRegex = /import\s+{\s*ActivityLog\s*}\s+from\s+['"]\.\.\/models\/ActivityLog(\.js)?['"];?[\r\n]*/g;
    if (importRegex.test(content)) {
      console.log(`  Removing import in ${file}`);
      content = content.replace(importRegex, "");
    }

    // Remove calls
    const callRegex = /await\s+ActivityLog\.create\({[\s\S]*?\}\);/g;
    const matches = content.match(callRegex);
    if (matches) {
      console.log(`  Removing ${matches.length} ActivityLog.create calls in ${file}`);
      content = content.replace(callRegex, "");
    }

    fs.writeFileSync(fullPath, content, "utf8");
  } else {
    console.log(`File not found: ${file}`);
  }
});
