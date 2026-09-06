import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectRuntimeFiles, distRoot, frontendRoot } from "./runtime-files.mjs";

const FORBIDDEN_FILE_PATTERN = /(?:\.blend(?:1|@)?|\.kra|\.pyc|\.md|\.txt)$/i;
const EXTERNAL_REFERENCE_PATTERN = /^(?:[a-z]+:)?\/\//i;

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

async function listFiles(root, relativeDirectory = "") {
  const absoluteDirectory = path.join(root, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, relativePath));
    } else if (entry.isFile()) {
      files.push(toPosixPath(relativePath));
    }
  }

  return files;
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const digest = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => digest.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(digest.digest("hex")));
  });
}

function normalizeLocalReference(fromFile, reference) {
  const trimmed = reference.trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("mailto:") ||
    EXTERNAL_REFERENCE_PATTERN.test(trimmed)
  ) {
    return null;
  }

  const withoutQuery = trimmed.split(/[?#]/, 1)[0];
  if (!withoutQuery) {
    return null;
  }

  const extension = path.posix.extname(fromFile).toLowerCase();
  if (extension === ".js" && !withoutQuery.startsWith(".") && !withoutQuery.startsWith("/")) {
    return null;
  }
  if (
    extension !== ".json" &&
    !withoutQuery.startsWith(".") &&
    !withoutQuery.startsWith("/") &&
    !withoutQuery.includes("/")
  ) {
    return null;
  }

  const isAppRootReference = extension === ".json" || (
    fromFile === "ar/config.js" && /^\.?\/?models\//.test(withoutQuery)
  );
  const baseDirectory = isAppRootReference ? "." : path.posix.dirname(fromFile);
  const normalized = isAppRootReference
    ? path.posix.normalize(withoutQuery.replace(/^\.\//, "").replace(/^\/+/, ""))
    : withoutQuery.startsWith("/")
      ? path.posix.normalize(withoutQuery.slice(1))
    : path.posix.normalize(path.posix.join(baseDirectory, withoutQuery));

  if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error(`Referenz verlässt dist: ${fromFile} -> ${reference}`);
  }

  return normalized;
}

function extractHtmlReferences(content) {
  return [...content.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
}

function extractCssReferences(content) {
  return [...content.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((match) => match[1]);
}

function extractJavaScriptReferences(content) {
  const references = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bnew\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g,
    /\b(?:primaryUrl|fallbackUrl)\s*:\s*["']([^"']+)["']/g
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      references.push(match[1]);
    }
  }

  return references;
}

function collectJsonAssetReferences(value, references) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectJsonAssetReferences(entry, references);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if ((key === "asset" || key === "usdzAsset") && typeof entry === "string") {
      references.push(entry);
    } else {
      collectJsonAssetReferences(entry, references);
    }
  }
}

async function collectReferencedFiles(files) {
  const references = new Map();

  for (const file of files) {
    if (file.startsWith("vendor/8thwall/")) {
      continue;
    }

    const extension = path.posix.extname(file).toLowerCase();
    if (![".html", ".css", ".js", ".json"].includes(extension)) {
      continue;
    }

    const content = await readFile(path.join(distRoot, file), "utf8");
    let rawReferences = [];
    if (extension === ".html") {
      rawReferences = extractHtmlReferences(content);
    } else if (extension === ".css") {
      rawReferences = extractCssReferences(content);
    } else if (extension === ".js") {
      rawReferences = extractJavaScriptReferences(content);
      for (const match of content.matchAll(/dataset\.preloadChunks\s*=\s*["']([^"']+)["']/g)) {
        for (const chunk of match[1].split(",").map((value) => value.trim()).filter(Boolean)) {
          references.set(`vendor/8thwall/xr-${chunk}.js`, `${file} -> iOS-Engine-Chunk ${chunk}`);
        }
      }
    } else {
      collectJsonAssetReferences(JSON.parse(content), rawReferences);
    }

    for (const rawReference of rawReferences) {
      const normalized = normalizeLocalReference(file, rawReference);
      if (normalized) {
        references.set(normalized, `${file} -> ${rawReference}`);
      }
    }
  }

  return references;
}

export async function verifyDist() {
  const expectedFiles = await collectRuntimeFiles();
  const actualFiles = await listFiles(distRoot);
  const expectedSet = new Set(expectedFiles);
  const actualSet = new Set(actualFiles);
  const missing = expectedFiles.filter((file) => !actualSet.has(file));
  const unexpected = actualFiles.filter((file) => !expectedSet.has(file));

  if (missing.length || unexpected.length) {
    throw new Error([
      missing.length ? `Fehlende Dateien:\n${missing.join("\n")}` : "",
      unexpected.length ? `Nicht erlaubte Dateien:\n${unexpected.join("\n")}` : ""
    ].filter(Boolean).join("\n\n"));
  }

  const forbidden = actualFiles.filter((file) => FORBIDDEN_FILE_PATTERN.test(file));
  if (forbidden.length) {
    throw new Error(`Verbotene Arbeitsdateien in dist:\n${forbidden.join("\n")}`);
  }

  let totalBytes = 0;
  for (const file of actualFiles) {
    const sourceFile = path.join(frontendRoot, file);
    const builtFile = path.join(distRoot, file);
    const [sourceHash, builtHash] = await Promise.all([hashFile(sourceFile), hashFile(builtFile)]);
    if (sourceHash !== builtHash) {
      throw new Error(`Laufzeitdatei weicht von der Deployment-Quelle ab: ${file}`);
    }
    totalBytes += (await stat(builtFile)).size;
  }

  const references = await collectReferencedFiles(actualFiles);
  const unresolved = [...references.entries()].filter(([file]) => !actualSet.has(file));
  if (unresolved.length) {
    throw new Error(`Nicht auflösbare lokale Laufzeitreferenzen:\n${unresolved.map(([file, source]) => `${source} => ${file}`).join("\n")}`);
  }

  const firstPartyTextFiles = actualFiles.filter((file) =>
    !file.startsWith("vendor/") && [".html", ".css", ".js", ".json"].includes(path.posix.extname(file).toLowerCase())
  );
  const usdzReferences = [];
  for (const file of firstPartyTextFiles) {
    const content = await readFile(path.join(distRoot, file), "utf8");
    if (/\.usdz(?:[?#"']|$)/i.test(content) || /usdzAsset/i.test(content)) {
      usdzReferences.push(file);
    }
  }
  if (usdzReferences.length) {
    throw new Error(`Unerwartete USDZ-Referenzen in dist:\n${usdzReferences.join("\n")}`);
  }

  return {
    files: actualFiles,
    referencedFiles: [...references.keys()].sort(),
    totalBytes
  };
}

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB (${bytes} Bytes)`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyDist()
    .then((result) => {
      console.log(`dist geprüft: ${result.files.length} Dateien, ${formatBytes(result.totalBytes)}`);
      console.log(`Lokale Laufzeitreferenzen geprüft: ${result.referencedFiles.length}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
