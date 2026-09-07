import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "..");
const frontendRoot = path.join(repositoryRoot, "frontend");
const threePackageRoot = path.join(frontendRoot, "node_modules", "three");
const targetRoot = path.join(frontendRoot, "vendor", "three");

export const THREE_VERSION = "0.172.0";
export const THREE_RUNTIME_FILES = Object.freeze([
  "LICENSE",
  "build/three.core.js",
  "build/three.module.js",
  "examples/jsm/controls/OrbitControls.js",
  "examples/jsm/loaders/GLTFLoader.js",
  "examples/jsm/utils/BufferGeometryUtils.js"
]);

export const THREE_RUNTIME_TARGET_FILES = Object.freeze(
  THREE_RUNTIME_FILES.map((file) => `vendor/three/${file}`)
);

export async function prepareThreeRuntime() {
  const [frontendPackage, installedPackage] = await Promise.all([
    readFile(path.join(frontendRoot, "package.json"), "utf8").then(JSON.parse),
    readFile(path.join(threePackageRoot, "package.json"), "utf8").then(JSON.parse)
  ]);

  const declaredVersion = frontendPackage.dependencies?.three;
  if (declaredVersion !== THREE_VERSION || installedPackage.version !== THREE_VERSION) {
    throw new Error(
      `Three.js-Version stimmt nicht überein: erwartet ${THREE_VERSION}, ` +
      `deklariert ${declaredVersion || "nicht gesetzt"}, installiert ${installedPackage.version}`
    );
  }

  await rm(targetRoot, { recursive: true, force: true });

  for (const relativeFile of THREE_RUNTIME_FILES) {
    const sourceFile = path.join(threePackageRoot, relativeFile);
    const targetFile = path.join(targetRoot, relativeFile);
    await mkdir(path.dirname(targetFile), { recursive: true });
    await copyFile(sourceFile, targetFile);
  }

  console.log(
    `Three.js ${THREE_VERSION} vorbereitet: ${THREE_RUNTIME_FILES.length - 1} Browsermodule und LICENSE`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareThreeRuntime().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
