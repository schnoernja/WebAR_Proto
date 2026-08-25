import path from "node:path";
import { pathToFileURL } from "node:url";

const [inputPath, outputPath, targetWidthArgument] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node tools/optimize_fountain_animation.mjs <input.gltf> <output.glb>");
}

const gltfTransformRoot = path.join(
  process.env.APPDATA,
  "npm",
  "node_modules",
  "@gltf-transform",
  "cli",
  "node_modules",
  "@gltf-transform"
);
const coreUrl = pathToFileURL(path.join(gltfTransformRoot, "core", "dist", "index.modern.js")).href;
const extensionsUrl = pathToFileURL(
  path.join(gltfTransformRoot, "extensions", "dist", "index.modern.js")
).href;
const [{ NodeIO, getBounds }, { ALL_EXTENSIONS }] = await Promise.all([import(coreUrl), import(extensionsUrl)]);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(path.resolve(inputPath));
const root = document.getRoot();
const meshes = root.listMeshes();
const originalTargetCount = meshes[0]?.listPrimitives()[0]?.listTargets().length || 0;
const targetWidthMeters = Number(targetWidthArgument || 3.2);

if (originalTargetCount < 3) {
  throw new Error(`Expected a morph animation with at least three targets, found ${originalTargetCount}.`);
}

if (!Number.isFinite(targetWidthMeters) || targetWidthMeters <= 0) {
  throw new Error("The target width must be a positive number in meters.");
}

for (const mesh of meshes) {
  for (const primitive of mesh.listPrimitives()) {
    if (primitive.listTargets().length !== originalTargetCount) {
      throw new Error("All animated fountain primitives must use the same number of morph targets.");
    }
  }
}

const keptTargetIndices = [];
for (let index = 0; index < originalTargetCount; index += 3) {
  keptTargetIndices.push(index);
}
if (keptTargetIndices.at(-1) !== originalTargetCount - 1) {
  keptTargetIndices.push(originalTargetCount - 1);
}

for (const animation of root.listAnimations()) {
  for (const channel of animation.listChannels()) {
    if (channel.getTargetPath() !== "weights") {
      continue;
    }

    const sampler = channel.getSampler();
    const input = sampler.getInput();
    const output = sampler.getOutput();
    const inputArray = input.getArray();
    const outputArray = output.getArray();
    if (!inputArray || !outputArray || outputArray.length !== inputArray.length * originalTargetCount) {
      throw new Error("Unexpected morph animation layout in fountain source model.");
    }

    const keptKeyRows = [0, ...keptTargetIndices.map((index) => index + 1)];
    const nextInput = new Float32Array(keptKeyRows.length);
    const nextOutput = new Float32Array(keptKeyRows.length * keptTargetIndices.length);

    keptKeyRows.forEach((sourceRow, targetRow) => {
      nextInput[targetRow] = inputArray[sourceRow];
      keptTargetIndices.forEach((sourceTarget, targetIndex) => {
        nextOutput[targetRow * keptTargetIndices.length + targetIndex] =
          outputArray[sourceRow * originalTargetCount + sourceTarget];
      });
    });

    input.setArray(nextInput);
    output.setArray(nextOutput);
  }
}

for (const mesh of meshes) {
  const originalWeights = mesh.getWeights();
  mesh.setWeights(keptTargetIndices.map((index) => originalWeights[index] || 0));

  for (const primitive of mesh.listPrimitives()) {
    const targets = primitive.listTargets();
    const keptTargets = new Set(keptTargetIndices.map((index) => targets[index]));
    for (const target of targets) {
      if (!keptTargets.has(target)) {
        primitive.removeTarget(target);
        target.dispose();
      }
    }
  }
}

for (const material of root.listMaterials()) {
  if (material.getAlphaMode() === "BLEND") {
    material.setDoubleSided(false);
  }
}

const scene = root.listScenes()[0];
const bounds = getBounds(scene);
const sourceWidth = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]);
const meterScale = targetWidthMeters / sourceWidth;
for (const node of scene.listChildren()) {
  const scale = node.getScale();
  node.setScale([scale[0] * meterScale, scale[1] * meterScale, scale[2] * meterScale]);
}

await io.write(path.resolve(outputPath), document);
console.info(
  `Reduced fountain animation from ${originalTargetCount} to ${keptTargetIndices.length} morph targets per mesh ` +
    `and scaled it to ${targetWidthMeters.toFixed(2)} m width.`
);
