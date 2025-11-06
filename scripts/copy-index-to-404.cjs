const fs = require("fs");
const path = require("path");

const dist = path.resolve(__dirname, "..", "dist");
const from = path.join(dist, "index.html");
const to = path.join(dist, "404.html");

if (!fs.existsSync(from)) {
  console.error("copy-index-to-404: dist/index.html not found. Run build first.");
  process.exit(1);
}

try {
  fs.copyFileSync(from, to);
  console.log("copy-index-to-404: OK -> dist/404.html created");
} catch (err) {
  console.error("copy-index-to-404 error:", err);
  process.exit(1);
}