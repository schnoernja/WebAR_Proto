import { copyFile, mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import { collectRuntimeFiles, distRoot, frontendRoot, repositoryRoot } from "./runtime-files.mjs";
import { verifyDist } from "./verify-dist.mjs";

const lfsPointerPrefix = "version https://git-lfs.github.com/spec/v1";

if (path.dirname(distRoot) !== repositoryRoot || path.basename(distRoot) !== "dist") {
  throw new Error(`Unsicheres dist-Ziel: ${distRoot}`);
}

const runtimeFiles = await collectRuntimeFiles();

await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });

for (const relativeFile of runtimeFiles) {
  const sourceFile = path.join(frontendRoot, relativeFile);
  const targetFile = path.join(distRoot, relativeFile);
  const sourceHandle = await open(sourceFile, "r");
  const prefixBuffer = Buffer.alloc(lfsPointerPrefix.length);
  try {
    await sourceHandle.read(prefixBuffer, 0, prefixBuffer.length, 0);
  } finally {
    await sourceHandle.close();
  }
  const prefix = prefixBuffer.toString("utf8");
  if (prefix === lfsPointerPrefix) {
    throw new Error(`Git-LFS-Inhalt fehlt für: ${relativeFile}`);
  }
  await mkdir(path.dirname(targetFile), { recursive: true });
  await copyFile(sourceFile, targetFile);
}

const result = await verifyDist();
console.log(`Produktions-Build erstellt: ${path.relative(repositoryRoot, distRoot)}`);
console.log(`Dateien: ${result.files.length}`);
console.log(`Größe: ${(result.totalBytes / (1024 * 1024)).toFixed(2)} MiB (${result.totalBytes} Bytes)`);
