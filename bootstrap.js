"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { pipeline } = require("stream/promises");
const unzipper = require("unzipper");

const rootDirectory = __dirname;
const archivePath = path.join(rootDirectory, "platform-source.zip");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

async function bootstrap() {
  if (!fs.existsSync(archivePath)) {
    // A subsequent Render build runs against the extracted project normally.
    return;
  }

  await pipeline(
    fs.createReadStream(archivePath),
    unzipper.Extract({ path: rootDirectory })
  );
  fs.unlinkSync(archivePath);

  // Use the platform's committed lockfile without recursively invoking scripts.
  execFileSync(npmCommand, ["ci", "--include=dev", "--ignore-scripts"], {
    cwd: rootDirectory,
    stdio: "inherit",
  });
  execFileSync(npmCommand, ["exec", "prisma", "generate"], {
    cwd: rootDirectory,
    stdio: "inherit",
  });
}

bootstrap().catch((error) => {
  console.error("Deployment bootstrap failed:", error);
  process.exit(1);
});
