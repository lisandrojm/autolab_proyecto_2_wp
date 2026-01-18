const fs = require("fs");
const path = "src/scripts/seedOnStart.ts";

try {
  const content = fs.readFileSync(path, "utf8");
  const lines = content.split(/\r?\n/);

  const startMarker = "// ---- OrderCategory ----";
  const endMarker = "// ---- Document (HRDocument) ----";

  const startIndex = lines.findIndex((l) => l.includes(startMarker));
  const endIndexRaw = lines.findIndex((l) => l.includes(endMarker));

  if (startIndex === -1) {
    console.error("Start marker not found");
    process.exit(1);
  }
  if (endIndexRaw === -1) {
    console.error("End marker not found");
    process.exit(1);
  }

  // The end marker is AFTER the block we want to delete.
  // We want to delete up to the closing brace of the else block before the marker.
  let endIndex = endIndexRaw - 1;
  while (endIndex > startIndex && lines[endIndex].trim() === "") {
    endIndex--;
  }
  // Now lines[endIndex] should be "}"
  const lineEndContent = lines[endIndex].trim();
  if (lineEndContent !== "}") {
    console.error('Expected closing brace before end marker, found: "' + lines[endIndex] + '"');
    process.exit(1);
  }

  console.log("Found range: " + startIndex + " to " + endIndex);
  console.log("Start line: " + lines[startIndex]);
  console.log("End line: " + lines[endIndex]);

  const replacement = '    console.log("ℹ️ Order, OrderCategory and FutureAction seeding skipped by user request.");';

  lines.splice(startIndex, endIndex - startIndex + 1, replacement);

  fs.writeFileSync(path, lines.join("\n"));
  console.log("Successfully updated " + path);
} catch (e) {
  console.error(e);
  process.exit(1);
}
