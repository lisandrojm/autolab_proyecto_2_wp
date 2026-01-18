const fs = require("fs");
const path = "src/scripts/seedOnStart.ts";

try {
  const content = fs.readFileSync(path, "utf8");
  // Handle different line endings if necessary, but split by \n usually works if we join by \n
  const lines = content.split(/\r?\n/);

  // Line 1155 in view_file -> index 1154
  // Line 1793 in view_file -> index 1792
  const startIndex = 1154;
  const endIndex = 1792;

  // Verification
  const startLine = lines[startIndex].trim();
  const endLine = lines[endIndex].trim();
  const endLinePrev = lines[endIndex - 1].trim();

  console.log("Verifying start line (index " + startIndex + '): "' + startLine + '"');
  console.log("Verifying end line (index " + endIndex + '): "' + endLine + '"');
  console.log("Verifying end line prev (index " + (endIndex - 1) + '): "' + endLinePrev + '"');

  if (startLine !== "// ---- OrderCategory ----") {
    console.error('Start line mismatch! Expected "// ---- OrderCategory ----"');
    process.exit(1);
  }

  // endLine might be "}" or "}" with indentation.
  if (endLine !== "}" && endLine !== "settings: {") {
    // wait, 1793 is "}" for the "else" block
    // it is just "}" with 4 spaces
  }

  if (!lines[endIndex].includes("}") || !lines[endIndex - 1].includes("OrderCategory and Order already present")) {
    console.error('End line mismatch! Expected "}" and prev line with "already present"');
    console.log("Actual end line:", lines[endIndex]);
    console.log("Actual end prev:", lines[endIndex - 1]);
    process.exit(1);
  }

  console.log("Lines verified. Removing " + (endIndex - startIndex + 1) + " lines...");

  const replacement = '    console.log("ℹ️ Order, OrderCategory and FutureAction seeding skipped by user request.");';

  lines.splice(startIndex, endIndex - startIndex + 1, replacement);

  fs.writeFileSync(path, lines.join("\n"));
  console.log("Successfully updated " + path);
} catch (e) {
  console.error(e);
  process.exit(1);
}
