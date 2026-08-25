import path from "node:path";
import { pathToFileURL } from "node:url";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node tools/fix_planter_materials.mjs <input.glb> <output.glb>");
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
const [{ NodeIO }, { ALL_EXTENSIONS }] = await Promise.all([import(coreUrl), import(extensionsUrl)]);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(path.resolve(inputPath));
const planterMaterials = document
  .getRoot()
  .listMaterials()
  .filter((material) => /^(Vaso_A2|Forest001_LR002)(?:\.\d+)?$/i.test(material.getName()));

if (planterMaterials.length < 2) {
  throw new Error(`Expected at least two planter materials, found ${planterMaterials.length}.`);
}

for (const material of planterMaterials) {
  const diffuseTexture = material.getBaseColorTexture() || material.getEmissiveTexture();
  if (!diffuseTexture) {
    throw new Error(`No diffuse texture found for planter material '${material.getName()}'.`);
  }

  material
    .setBaseColorFactor([1, 1, 1, 1])
    .setBaseColorTexture(diffuseTexture)
    .setEmissiveFactor([0, 0, 0])
    .setEmissiveTexture(null)
    .setMetallicFactor(0)
    .setRoughnessFactor(/^Vaso_A2/i.test(material.getName()) ? 0.78 : 0.9);
}

await io.write(path.resolve(outputPath), document);
console.log(`Repaired ${planterMaterials.length} planter materials in '${outputPath}'.`);
