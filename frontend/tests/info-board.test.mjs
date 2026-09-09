import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  InfoBoard,
  InfoBoardManager,
  wrapInfoBoardText
} from "../ar/InfoBoard.js";
import { PlacementController } from "../ar/PlacementController.js";
import { UIController } from "../ar/UIController.js";

class FakeCanvasContext {
  constructor() {
    this.font = "54px sans-serif";
    this.drawnLines = [];
  }

  measureText(text) {
    const fontSize = Number.parseFloat(this.font.match(/([0-9.]+)px/)?.[1] || "54");
    return { width: Array.from(String(text)).length * fontSize * 0.55 };
  }

  beginPath() {}
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  closePath() {}
  save() {}
  restore() {}
  fill() {}
  stroke() {}
  clearRect() {}
  fillText(text, x, y) { this.drawnLines.push({ text, x, y }); }
}

function createFakeCanvas() {
  const context = new FakeCanvasContext();
  return {
    width: 0,
    height: 0,
    context,
    getContext: () => context
  };
}

test("Infotafel bricht Absätze und lange Wörter innerhalb der Textbreite um", () => {
  const context = new FakeCanvasContext();
  context.font = "20px sans-serif";
  const lines = wrapInfoBoardText(
    context,
    "Eine automatisch umgebrochene Zeile\nDonaudampfschifffahrtsgesellschaft",
    110
  );

  assert.ok(lines.length > 3);
  assert.ok(lines.every((line) => context.measureText(line).width <= 110));
});

test("Infotafel aktualisiert die Canvas-Textur nur bei Darstellungsänderungen", () => {
  const canvas = createFakeCanvas();
  const board = new InfoBoard({
    id: "test",
    text: "Statischer Inhalt",
    createCanvas: () => canvas
  });
  const initialTextureVersion = board.canvasState.texture.version;

  assert.equal(board.object3D.isMesh, true);
  assert.equal(board.geometry.type, "PlaneGeometry");
  assert.equal(board.object3D.children.length, 0);
  assert.equal(board.update({ position: { x: 1, y: 2, z: 3 } }), false);
  assert.equal(board.canvasState.texture.version, initialTextureVersion);
  assert.equal(board.update({ text: "Geänderter, längerer Inhalt für zwei Zeilen" }), true);
  assert.ok(board.canvasState.texture.version > initialTextureVersion);
  assert.ok(board.getLayout().lines.length >= 2);
  assert.equal(canvas.context.drawnLines.at(-1).text, board.getLayout().lines.at(-1));

  board.dispose();
});

test("Skalierung, Grundrotation und deaktiviertes Billboard bleiben konfigurierbar", () => {
  const board = new InfoBoard({
    id: "static",
    text: "Konfigurierbar",
    widthMeters: 1.2,
    scaleFactor: 1.5,
    rotationDeg: 30,
    billboard: false,
    createCanvas: createFakeCanvas
  });

  assert.ok(Math.abs(board.object3D.scale.x - 1.8) < 1e-9);
  assert.ok(Math.abs(THREE.MathUtils.radToDeg(board.object3D.rotation.y) - 30) < 1e-9);
  assert.equal(board.updateBillboard({ position: new THREE.Vector3(3, 2, 1) }), false);
  assert.ok(Math.abs(THREE.MathUtils.radToDeg(board.object3D.rotation.y) - 30) < 1e-9);
  board.dispose();
});

test("Billboard bleibt in Weltkoordinaten aufrecht und zeigt zur Kamera", () => {
  const parent = new THREE.Group();
  parent.rotation.set(0.2, 0.4, -0.15);
  const scene = new THREE.Scene();
  scene.add(parent);
  const board = new InfoBoard({
    id: "billboard",
    text: "Blick zur Kamera",
    position: { x: 0, y: 1.5, z: 0 },
    createCanvas: createFakeCanvas
  });
  parent.add(board.object3D);
  scene.updateMatrixWorld(true);

  assert.equal(board.updateBillboard({ position: new THREE.Vector3(2, 4, 3) }), true);
  scene.updateMatrixWorld(true);

  const worldQuaternion = board.object3D.getWorldQuaternion(new THREE.Quaternion());
  const boardForward = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuaternion).setY(0).normalize();
  const boardPosition = board.object3D.getWorldPosition(new THREE.Vector3());
  const cameraDirection = new THREE.Vector3(2, 0, 3)
    .sub(new THREE.Vector3(boardPosition.x, 0, boardPosition.z))
    .normalize();
  const boardUp = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuaternion);

  assert.ok(boardForward.dot(cameraDirection) > 0.9999);
  assert.ok(boardUp.dot(new THREE.Vector3(0, 1, 0)) > 0.9999);
  board.dispose();
});

test("Szenenwechsel und Entfernen geben Textur, Material und Geometrie frei", () => {
  const scene = new THREE.Scene();
  const manager = new InfoBoardManager({ parent: scene, createCanvas: createFakeCanvas });
  const first = manager.createBoard({ id: "a", text: "Erste Tafel" });
  let textureDisposed = false;
  let materialDisposed = false;
  let geometryDisposed = false;
  first.canvasState.texture.addEventListener("dispose", () => { textureDisposed = true; });
  first.material.addEventListener("dispose", () => { materialDisposed = true; });
  first.geometry.addEventListener("dispose", () => { geometryDisposed = true; });

  manager.setBoards([{ id: "b", text: "Neue Szene" }]);
  assert.equal(scene.getObjectByName("info-board-a"), undefined);
  assert.equal(manager.boards.size, 1);
  assert.equal(textureDisposed, true);
  assert.equal(materialDisposed, true);
  assert.equal(geometryDisposed, true);

  manager.clear();
  assert.equal(manager.boards.size, 0);
  manager.dispose();
});

test("Geo-Instanzen teilen Tafelressourcen und werden ohne Doppelanlage entfernt", () => {
  const primaryParent = new THREE.Group();
  const instanceParent = new THREE.Group();
  const manager = new InfoBoardManager({ parent: primaryParent, createCanvas: createFakeCanvas });
  const board = manager.createBoard({
    id: "shared",
    text: "Gemeinsamer Inhalt",
    position: { x: 1, y: 1.5, z: 2 }
  });

  assert.equal(manager.addInstanceParent(instanceParent), true);
  assert.equal(manager.addInstanceParent(instanceParent), false);
  assert.equal(instanceParent.children.length, 1);
  const clone = instanceParent.children[0];
  assert.equal(clone.geometry, board.geometry);
  assert.equal(clone.material, board.material);

  manager.updateBoard("shared", { position: { x: 4, y: 1.2, z: -2 }, scaleFactor: 0.75 });
  assert.deepEqual(clone.position.toArray(), [4, 1.2, -2]);
  assert.equal(clone.scale.x, board.object3D.scale.x);

  assert.equal(manager.removeInstanceParent(instanceParent), true);
  assert.equal(instanceParent.children.length, 0);
  assert.equal(primaryParent.children.length, 1);
  manager.dispose();
});

test("Placement bindet Tafeln an GLB-Koordinaten und räumt Geo-Klone getrennt auf", () => {
  const scene = new THREE.Scene();
  const stagingRoot = new THREE.Group();
  const manager = new InfoBoardManager({ parent: stagingRoot, createCanvas: createFakeCanvas });
  const controller = new PlacementController({ scene, infoBoardManager: manager });
  controller.setInfoBoards([{
    id: "placed",
    text: "Am Modell",
    active: true,
    offset: { x: 2, y: 1.4, z: -3 },
    billboard: true
  }]);

  const wrapper = new THREE.Group();
  const modelRoot = new THREE.Group();
  wrapper.add(modelRoot);
  controller.setAsset(wrapper);
  const board = manager.boards.get("placed");
  assert.equal(board.object3D.parent, modelRoot);
  assert.deepEqual(board.object3D.position.toArray(), [2, 1.4, -3]);

  controller.addGeoInstance(new THREE.Vector3(5, 0, 7));
  assert.equal(manager.instanceParents.size, 1);
  assert.equal(manager.instancesById.get("placed").size, 2);
  controller.clearGeoInstances();
  assert.equal(manager.instanceParents.size, 0);
  assert.equal(manager.instancesById.get("placed").size, 1);

  let textureDisposed = false;
  board.canvasState.texture.addEventListener("dispose", () => { textureDisposed = true; });
  controller.dispose();
  assert.equal(textureDisposed, false);
  assert.equal(board.object3D.parent, stagingRoot);
  manager.dispose();
  assert.equal(textureDisposed, true);
});

test("Live-Textänderung aktualisiert nur die ausgewählte Tafeltextur", () => {
  const scene = new THREE.Scene();
  const manager = new InfoBoardManager({ parent: new THREE.Group(), createCanvas: createFakeCanvas });
  const controller = new PlacementController({ scene, infoBoardManager: manager });
  controller.setInfoBoards([
    { id: "tafel-1", text: "Erster Text", active: true, offset: { x: 0, y: 1, z: 0 } },
    { id: "tafel-2", text: "Zweiter Text", active: true, offset: { x: 1, y: 1, z: 0 } }
  ]);
  const first = manager.boards.get("tafel-1");
  const second = manager.boards.get("tafel-2");
  const firstVersion = first.canvasState.texture.version;
  const secondVersion = second.canvasState.texture.version;

  controller.updateInfoBoard({
    id: "tafel-1",
    text: "Geänderter erster Text",
    active: true,
    offset: { x: 2, y: 1.4, z: -1 },
    scaleFactor: 1.2,
    widthMeters: 1.3,
    rotationDeg: 15,
    billboard: true
  });

  assert.ok(first.canvasState.texture.version > firstVersion);
  assert.equal(second.canvasState.texture.version, secondVersion);
  assert.deepEqual(first.object3D.position.toArray(), [2, 1.4, -1]);
  controller.updateInfoBoard({ id: "tafel-1", active: false });
  assert.equal(manager.boards.has("tafel-1"), false);
  assert.equal(manager.boards.has("tafel-2"), true);

  controller.dispose();
  manager.dispose();
});

test("Dev-Editor kennzeichnet Szene und Tafel und gibt direkt nutzbares JSON aus", () => {
  const createField = (value = "") => ({ value, checked: false, disabled: false });
  const select = {
    value: "",
    disabled: false,
    children: [],
    replaceChildren() { this.children = []; },
    append(option) { this.children.push(option); }
  };
  const ui = Object.create(UIController.prototype);
  ui.document = { createElement: () => ({ value: "", textContent: "", selected: false }) };
  ui.infoBoardRefs = {
    select,
    selection: { textContent: "" },
    xRange: createField(),
    yRange: createField(),
    zRange: createField(),
    scaleRange: createField(),
    widthRange: createField(),
    rotationRange: createField(),
    activeToggle: createField(),
    billboardToggle: createField(),
    textInput: createField(),
    adoptButton: { disabled: false },
    resetButton: { disabled: false },
    jsonOutput: createField()
  };
  ui.infoBoardSceneId = null;
  ui.infoBoardSceneLabel = null;
  ui.infoBoardSourceDrafts = [];
  ui.infoBoardDrafts = [];
  ui.selectedInfoBoardId = null;

  ui.setInfoBoardTargets({
    sceneId: "a",
    sceneLabel: "Szenario A",
    infoBoards: [
      {
        id: "tafel-1",
        text: "Text 1",
        sceneId: "a",
        active: true,
        offset: { x: 1, y: 1.5, z: 2 },
        scaleFactor: 1,
        widthMeters: 1.2,
        rotationDeg: 0,
        billboard: true
      },
      {
        id: "tafel-3",
        text: "Unabhängiger Text 3",
        sceneId: "a",
        active: true,
        offset: { x: 3, y: 1, z: -2 },
        scaleFactor: 1,
        widthMeters: 1.2,
        rotationDeg: 0,
        billboard: true
      }
    ]
  });

  assert.equal(ui.infoBoardRefs.selection.textContent, "Szenario A · tafel-1");
  assert.deepEqual(select.children.map((option) => option.textContent), [
    "Szenario A · tafel-1",
    "Szenario A · tafel-3"
  ]);

  ui.infoBoardRefs.xRange.value = "4.25";
  ui.infoBoardRefs.textInput.value = "Nur Tafel 1 geändert";
  ui.infoBoardRefs.activeToggle.checked = true;
  ui.infoBoardRefs.billboardToggle.checked = false;
  const changed = ui.updateSelectedInfoBoardDraftFromInputs();
  ui.renderInfoBoardJsonOutput();
  const output = JSON.parse(ui.infoBoardRefs.jsonOutput.value);

  assert.equal(changed.offset.x, 4.25);
  assert.equal(changed.text, "Nur Tafel 1 geändert");
  assert.equal(changed.billboard, false);
  assert.equal(output.infoBoards[0].text, "Nur Tafel 1 geändert");
  assert.equal(output.infoBoards[1].text, "Unabhängiger Text 3");
  assert.equal(output.infoBoards[0].sceneId, "a");
});

test("Zu langer Text wird kontrolliert abgelehnt und niemals abgeschnitten", () => {
  assert.throws(
    () => new InfoBoard({
      id: "overflow",
      text: "Sehr langer Text ".repeat(200),
      style: {
        textureWidth: 256,
        maxTextureHeight: 128,
        fontSizePx: 20,
        minFontSizePx: 20,
        paddingX: 24,
        paddingY: 24,
        shadowPadding: 8
      },
      createCanvas: createFakeCanvas
    }),
    /nicht abgeschnitten/
  );
});
