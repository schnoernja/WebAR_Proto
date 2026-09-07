import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { THREE_RUNTIME_TARGET_FILES } from "./prepare-three-runtime.mjs";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));

export const repositoryRoot = path.resolve(scriptsDirectory, "..");
export const frontendRoot = path.join(repositoryRoot, "frontend");
export const distRoot = path.join(repositoryRoot, "dist");

const ROOT_RUNTIME_FILES = Object.freeze([
  "index.html",
  "styles.css",
  "webxr.js"
]);

const DEFAULT_MODEL_FILES = Object.freeze([
  "models/tree.glb",
  "models/fountain.glb"
]);

const UI_ASSET_FILES = Object.freeze([
  "assets/design/ar-kamera.png",
  "assets/design/leaves_background.png",
  "assets/design/logo.png",
  "assets/tutorial/ar-flaeche-finden.gif",
  "assets/tutorial/ar-szenario-und-umfrage.gif"
]);

const IOS_ENGINE_FILES = Object.freeze([
  "vendor/8thwall/LICENSE",
  "vendor/8thwall/xr.js",
  "vendor/8thwall/xr-slam.js"
]);

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

async function listFiles(relativeDirectory, extension) {
  const absoluteDirectory = path.join(frontendRoot, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(relativePath, extension));
    } else if (entry.isFile() && (!extension || path.extname(entry.name) === extension)) {
      files.push(toPosixPath(relativePath));
    }
  }

  return files;
}

function collectAssetReferences(value, assets) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectAssetReferences(entry, assets);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if ((key === "asset" || key === "usdzAsset") && typeof entry === "string") {
      const withoutQuery = entry.split(/[?#]/, 1)[0].replace(/^\/+/, "");
      if (withoutQuery) {
        assets.add(withoutQuery);
      }
    } else {
      collectAssetReferences(entry, assets);
    }
  }
}

async function collectSiteFilesAndAssets() {
  const siteFiles = await listFiles("public/sites", ".json");
  const assets = new Set();

  for (const siteFile of siteFiles) {
    const rawConfig = JSON.parse(await readFile(path.join(frontendRoot, siteFile), "utf8"));
    collectAssetReferences(rawConfig, assets);
  }

  return {
    siteFiles,
    assetFiles: [...assets].sort()
  };
}

export async function collectRuntimeFiles() {
  const arModuleFiles = await listFiles("ar", ".js");
  const { siteFiles, assetFiles } = await collectSiteFilesAndAssets();

  return [...new Set([
    ...ROOT_RUNTIME_FILES,
    ...arModuleFiles,
    ...siteFiles,
    ...DEFAULT_MODEL_FILES,
    ...UI_ASSET_FILES,
    ...IOS_ENGINE_FILES,
    ...THREE_RUNTIME_TARGET_FILES,
    ...assetFiles
  ])].sort();
}
