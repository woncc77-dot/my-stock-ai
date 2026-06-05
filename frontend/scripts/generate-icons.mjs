import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const svg = fs.readFileSync(path.join(__dirname, "icon-source.svg"));

async function writeIcon(size, outPath) {
  await sharp(svg).resize(size, size).png().toFile(outPath);
  console.log(`Wrote ${outPath} (${size}x${size})`);
}

const publicDir = path.join(root, "public");
const appDir = path.join(root, "app");

await writeIcon(512, path.join(publicDir, "icon-512.png"));
await writeIcon(192, path.join(publicDir, "icon-192.png"));
await writeIcon(180, path.join(publicDir, "apple-touch-icon.png"));
await writeIcon(180, path.join(appDir, "apple-icon.png"));
await writeIcon(48, path.join(appDir, "icon.png"));
