import * as THREE from "three";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const MIN_TEXTURE_WIDTH = 256;
const MAX_TEXTURE_WIDTH = 2048;
const MIN_TEXTURE_HEIGHT = 128;
const MAX_TEXTURE_HEIGHT = 4096;

export const DEFAULT_INFO_BOARD_STYLE = Object.freeze({
  backgroundColor: "rgba(17, 26, 28, 0.94)",
  textColor: "#f4f1e7",
  borderColor: "#5ab776",
  shadowColor: "rgba(0, 0, 0, 0.3)",
  fontFamily: '"Space Grotesk", "Avenir Next", "Segoe UI", sans-serif',
  fontWeight: 600,
  fontSizePx: 54,
  minFontSizePx: 34,
  lineHeight: 1.32,
  paddingX: 76,
  paddingY: 64,
  borderWidth: 8,
  cornerRadius: 44,
  shadowBlur: 26,
  shadowOffsetY: 12,
  shadowPadding: 40,
  textureWidth: 1024,
  maxTextureHeight: MAX_TEXTURE_HEIGHT
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeStyle(style = {}, baseStyle = DEFAULT_INFO_BOARD_STYLE) {
  const source = style && typeof style === "object" ? style : {};
  const textureWidth = Math.round(clamp(
    finiteOr(source.textureWidth, baseStyle.textureWidth),
    MIN_TEXTURE_WIDTH,
    MAX_TEXTURE_WIDTH
  ));
  const maxTextureHeight = Math.round(clamp(
    finiteOr(source.maxTextureHeight, baseStyle.maxTextureHeight),
    MIN_TEXTURE_HEIGHT,
    MAX_TEXTURE_HEIGHT
  ));
  const fontSizePx = clamp(finiteOr(source.fontSizePx, baseStyle.fontSizePx), 12, 180);
  const minFontSizePx = clamp(
    finiteOr(source.minFontSizePx, baseStyle.minFontSizePx),
    12,
    fontSizePx
  );

  return {
    backgroundColor: typeof source.backgroundColor === "string" ? source.backgroundColor : baseStyle.backgroundColor,
    textColor: typeof source.textColor === "string" ? source.textColor : baseStyle.textColor,
    borderColor: typeof source.borderColor === "string" ? source.borderColor : baseStyle.borderColor,
    shadowColor: typeof source.shadowColor === "string" ? source.shadowColor : baseStyle.shadowColor,
    fontFamily: typeof source.fontFamily === "string" && source.fontFamily.trim()
      ? source.fontFamily.trim()
      : baseStyle.fontFamily,
    fontWeight: source.fontWeight ?? baseStyle.fontWeight,
    fontSizePx,
    minFontSizePx,
    lineHeight: clamp(finiteOr(source.lineHeight, baseStyle.lineHeight), 1, 2),
    paddingX: clamp(finiteOr(source.paddingX, baseStyle.paddingX), 0, textureWidth * 0.35),
    paddingY: clamp(finiteOr(source.paddingY, baseStyle.paddingY), 0, maxTextureHeight * 0.25),
    borderWidth: clamp(finiteOr(source.borderWidth, baseStyle.borderWidth), 0, 32),
    cornerRadius: clamp(finiteOr(source.cornerRadius, baseStyle.cornerRadius), 0, 160),
    shadowBlur: clamp(finiteOr(source.shadowBlur, baseStyle.shadowBlur), 0, 80),
    shadowOffsetY: clamp(finiteOr(source.shadowOffsetY, baseStyle.shadowOffsetY), -40, 80),
    shadowPadding: clamp(finiteOr(source.shadowPadding, baseStyle.shadowPadding), 0, 120),
    textureWidth,
    maxTextureHeight
  };
}

function setTextStyle(context, style, fontSizePx) {
  context.font = `${style.fontWeight} ${fontSizePx}px ${style.fontFamily}`;
  context.textAlign = "left";
  context.textBaseline = "top";
}

function splitLongWord(context, word, maxWidth) {
  const chunks = [];
  let chunk = "";

  for (const character of Array.from(word)) {
    const candidate = `${chunk}${character}`;
    if (chunk && context.measureText(candidate).width > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }

  if (chunk) {
    chunks.push(chunk);
  }
  return chunks;
}

export function wrapInfoBoardText(context, text, maxWidth) {
  if (!context || typeof context.measureText !== "function") {
    throw new TypeError("Infotafel benötigt einen gültigen 2D-Canvas-Kontext.");
  }
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    throw new RangeError("Infotafel benötigt eine positive Textbreite.");
  }

  const paragraphs = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const lines = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim() ? paragraph.trim().split(/\s+/u) : [];
    if (!words.length) {
      lines.push("");
      continue;
    }

    let currentLine = "";
    for (const word of words) {
      const wordParts = context.measureText(word).width > maxWidth
        ? splitLongWord(context, word, maxWidth)
        : [word];

      for (const wordPart of wordParts) {
        const candidate = currentLine ? `${currentLine} ${wordPart}` : wordPart;
        if (currentLine && context.measureText(candidate).width > maxWidth) {
          lines.push(currentLine);
          currentLine = wordPart;
        } else {
          currentLine = candidate;
        }
      }
    }

    lines.push(currentLine);
  }

  return lines.length ? lines : [""];
}

function defaultCanvasFactory() {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    throw new Error("Infotafel kann ohne DOM-Canvas nicht erzeugt werden.");
  }
  return document.createElement("canvas");
}

export function createInfoBoardCanvasTexture({ createCanvas = defaultCanvasFactory } = {}) {
  const canvas = createCanvas();
  const context = canvas && typeof canvas.getContext === "function"
    ? canvas.getContext("2d", { alpha: true })
    : null;

  if (!context) {
    throw new Error("2D-Canvas für Infotafel ist nicht verfügbar.");
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return { canvas, context, texture };
}

function roundedRectPath(context, x, y, width, height, radius) {
  const normalizedRadius = Math.min(Math.max(radius, 0), width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + normalizedRadius, y);
  context.lineTo(x + width - normalizedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + normalizedRadius);
  context.lineTo(x + width, y + height - normalizedRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - normalizedRadius, y + height);
  context.lineTo(x + normalizedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - normalizedRadius);
  context.lineTo(x, y + normalizedRadius);
  context.quadraticCurveTo(x, y, x + normalizedRadius, y);
  context.closePath();
}

function calculateTextLayout(context, text, style) {
  const panelWidth = style.textureWidth - style.shadowPadding * 2;
  const textWidth = panelWidth - style.paddingX * 2;
  if (textWidth <= 0) {
    throw new RangeError("Infotafel-Innenabstand lässt keinen Platz für Text.");
  }

  for (let fontSizePx = style.fontSizePx; fontSizePx >= style.minFontSizePx; fontSizePx -= 2) {
    setTextStyle(context, style, fontSizePx);
    const lines = wrapInfoBoardText(context, text, textWidth);
    const lineHeightPx = Math.ceil(fontSizePx * style.lineHeight);
    const panelHeight = Math.ceil(style.paddingY * 2 + lines.length * lineHeightPx);
    const textureHeight = Math.ceil(panelHeight + style.shadowPadding * 2);
    if (textureHeight <= style.maxTextureHeight) {
      return {
        lines,
        fontSizePx,
        lineHeightPx,
        panelWidth,
        panelHeight,
        textureHeight,
        textWidth
      };
    }
  }

  throw new RangeError(
    "Infotafel-Text ist selbst bei der kleinsten konfigurierten Schriftgröße zu lang; Inhalt wurde nicht abgeschnitten."
  );
}

function drawBoard(context, canvas, text, style) {
  const layout = calculateTextLayout(context, text, style);
  canvas.width = style.textureWidth;
  canvas.height = layout.textureHeight;
  setTextStyle(context, style, layout.fontSizePx);
  context.clearRect(0, 0, canvas.width, canvas.height);

  const x = style.shadowPadding;
  const y = style.shadowPadding;
  roundedRectPath(context, x, y, layout.panelWidth, layout.panelHeight, style.cornerRadius);
  context.save();
  context.shadowColor = style.shadowColor;
  context.shadowBlur = style.shadowBlur;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = style.shadowOffsetY;
  context.fillStyle = style.backgroundColor;
  context.fill();
  context.restore();

  if (style.borderWidth > 0) {
    roundedRectPath(context, x, y, layout.panelWidth, layout.panelHeight, style.cornerRadius);
    context.lineWidth = style.borderWidth;
    context.strokeStyle = style.borderColor;
    context.stroke();
  }

  context.fillStyle = style.textColor;
  const textX = x + style.paddingX;
  let textY = y + style.paddingY;
  for (const line of layout.lines) {
    context.fillText(line, textX, textY);
    textY += layout.lineHeightPx;
  }

  return layout;
}

function normalizePosition(position, fallback = { x: 0, y: 0, z: 0 }) {
  const source = position && typeof position === "object" ? position : {};
  return {
    x: finiteOr(source.x, fallback.x),
    y: finiteOr(source.y, fallback.y),
    z: finiteOr(source.z, fallback.z)
  };
}

function normalizeRotationDeg(value, fallback = 0) {
  const source = finiteOr(value, fallback);
  const normalized = source % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export class InfoBoard {
  constructor({
    id = "info-board",
    text = "",
    position = null,
    widthMeters = 1.2,
    scaleFactor = 1,
    rotationDeg = 0,
    billboard = true,
    visible = true,
    style = null,
    createCanvas
  } = {}) {
    this.id = String(id || "info-board");
    this.text = String(text ?? "");
    this.style = normalizeStyle(style || {});
    this.widthMeters = clamp(finiteOr(widthMeters, 1.2), 0.1, 20);
    this.scaleFactor = clamp(finiteOr(scaleFactor, 1), 0.1, 10);
    this.rotationDeg = normalizeRotationDeg(rotationDeg);
    this.billboard = billboard !== false;
    this.canvasState = createInfoBoardCanvasTexture({ createCanvas });
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.material = new THREE.MeshBasicMaterial({
      map: this.canvasState.texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false
    });
    this.object3D = new THREE.Mesh(this.geometry, this.material);
    this.object3D.name = `info-board-${this.id}`;
    this.object3D.visible = Boolean(visible);
    this.object3D.userData.infoBoardId = this.id;
    this.object3D.position.copy(normalizePosition(position));

    this.renderSignature = null;
    this.layout = null;
    this.disposed = false;
    this.cameraWorldPosition = new THREE.Vector3();
    this.boardWorldPosition = new THREE.Vector3();
    this.directionToCamera = new THREE.Vector3();
    this.parentWorldQuaternion = new THREE.Quaternion();
    this.targetWorldQuaternion = new THREE.Quaternion();
    this.targetLocalQuaternion = new THREE.Quaternion();
    this.applyBaseRotation();

    try {
      this.updateTextureIfNeeded();
    } catch (error) {
      this.disposed = true;
      this.material.map = null;
      this.canvasState.texture.dispose();
      this.material.dispose();
      this.geometry.dispose();
      throw error;
    }
  }

  createRenderSignature(text = this.text, style = this.style) {
    return JSON.stringify({ text, style });
  }

  updateTextureIfNeeded(text = this.text, style = this.style) {
    const nextSignature = this.createRenderSignature(text, style);
    if (nextSignature === this.renderSignature) {
      return false;
    }

    this.layout = drawBoard(
      this.canvasState.context,
      this.canvasState.canvas,
      text,
      style
    );
    this.canvasState.texture.needsUpdate = true;
    this.text = text;
    this.style = style;
    this.renderSignature = nextSignature;
    this.updateMeshScale();
    return true;
  }

  updateMeshScale() {
    const aspect = this.canvasState.canvas.height / Math.max(this.canvasState.canvas.width, 1);
    const effectiveWidth = this.widthMeters * this.scaleFactor;
    this.object3D.scale.set(effectiveWidth, effectiveWidth * aspect, 1);
  }

  applyBaseRotation(object3D = this.object3D) {
    object3D.rotation.set(0, THREE.MathUtils.degToRad(this.rotationDeg), 0);
  }

  update({ text, position, widthMeters, scaleFactor, rotationDeg, billboard, visible, style } = {}) {
    if (this.disposed) {
      return false;
    }

    const nextText = text !== undefined ? String(text ?? "") : this.text;
    const nextStyle = style !== undefined ? normalizeStyle(style || {}, this.style) : this.style;
    const textureUpdated = this.updateTextureIfNeeded(nextText, nextStyle);

    if (position !== undefined) {
      this.object3D.position.copy(normalizePosition(position, this.object3D.position));
    }
    if (widthMeters !== undefined) {
      this.widthMeters = clamp(finiteOr(widthMeters, this.widthMeters), 0.1, 20);
    }
    if (scaleFactor !== undefined) {
      this.scaleFactor = clamp(finiteOr(scaleFactor, this.scaleFactor), 0.1, 10);
    }
    if (rotationDeg !== undefined) {
      this.rotationDeg = normalizeRotationDeg(rotationDeg, this.rotationDeg);
    }
    if (billboard !== undefined) {
      this.billboard = billboard !== false;
    }
    if (visible !== undefined) {
      this.object3D.visible = Boolean(visible);
    }

    if (!textureUpdated && (widthMeters !== undefined || scaleFactor !== undefined)) {
      this.updateMeshScale();
    }
    if (rotationDeg !== undefined || billboard !== undefined) {
      this.applyBaseRotation();
    }
    return textureUpdated;
  }

  updateBillboard(cameraOrState) {
    return this.updateObjectBillboard(this.object3D, cameraOrState);
  }

  updateObjectBillboard(object3D, cameraOrState) {
    if (this.disposed || !this.billboard || !object3D || !object3D.visible || !cameraOrState) {
      return false;
    }

    if (typeof cameraOrState.getWorldPosition === "function") {
      cameraOrState.getWorldPosition(this.cameraWorldPosition);
    } else if (cameraOrState.position) {
      this.cameraWorldPosition.copy(cameraOrState.position);
    } else {
      return false;
    }

    object3D.getWorldPosition(this.boardWorldPosition);
    this.directionToCamera.subVectors(this.cameraWorldPosition, this.boardWorldPosition);
    this.directionToCamera.y = 0;
    if (this.directionToCamera.lengthSq() < 1e-8) {
      return false;
    }

    const yaw = Math.atan2(this.directionToCamera.x, this.directionToCamera.z);
    this.targetWorldQuaternion.setFromAxisAngle(WORLD_UP, yaw);
    if (object3D.parent) {
      object3D.parent.getWorldQuaternion(this.parentWorldQuaternion);
      this.targetLocalQuaternion
        .copy(this.parentWorldQuaternion)
        .invert()
        .multiply(this.targetWorldQuaternion);
    } else {
      this.targetLocalQuaternion.copy(this.targetWorldQuaternion);
    }

    if (Math.abs(object3D.quaternion.dot(this.targetLocalQuaternion)) > 0.999999) {
      return false;
    }
    object3D.quaternion.copy(this.targetLocalQuaternion);
    return true;
  }

  getLayout() {
    if (!this.layout) {
      return null;
    }
    return {
      ...this.layout,
      lines: [...this.layout.lines]
    };
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.object3D.parent) {
      this.object3D.parent.remove(this.object3D);
    }
    this.material.map = null;
    this.canvasState.texture.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }
}

export class InfoBoardManager {
  constructor({ parent, createCanvas } = {}) {
    if (!parent || typeof parent.add !== "function") {
      throw new TypeError("Infotafel-Manager benötigt eine bestehende Three.js-Szenenwurzel.");
    }
    this.parent = parent;
    this.createCanvas = createCanvas;
    this.boards = new Map();
    this.instancesById = new Map();
    this.instanceParents = new Set();
  }

  setParent(parent) {
    if (!parent || typeof parent.add !== "function") {
      throw new TypeError("Infotafel-Manager benötigt eine bestehende Three.js-Szenenwurzel.");
    }
    this.parent = parent;
    for (const board of this.boards.values()) {
      parent.add(board.object3D);
    }
  }

  createInstance(board, parent) {
    const instance = board.object3D.clone(false);
    instance.userData.infoBoardId = board.id;
    board.applyBaseRotation(instance);
    parent.add(instance);
    this.instancesById.get(board.id).add(instance);
    return instance;
  }

  createBoard(config = {}) {
    const id = typeof config.id === "string" && config.id.trim() ? config.id.trim() : "";
    if (!id || this.boards.has(id)) {
      throw new Error("Infotafel benötigt eine eindeutige ID.");
    }

    const board = new InfoBoard({ ...config, id, createCanvas: this.createCanvas });
    this.boards.set(id, board);
    this.instancesById.set(id, new Set([board.object3D]));
    this.parent.add(board.object3D);
    for (const parent of this.instanceParents) {
      this.createInstance(board, parent);
    }
    return board;
  }

  syncBoardInstances(board) {
    const instances = this.instancesById.get(board.id);
    if (!instances) {
      return;
    }
    for (const instance of instances) {
      if (instance === board.object3D) {
        continue;
      }
      instance.position.copy(board.object3D.position);
      instance.scale.copy(board.object3D.scale);
      instance.visible = board.object3D.visible;
      board.applyBaseRotation(instance);
    }
  }

  addInstanceParent(parent) {
    if (!parent || typeof parent.add !== "function" || this.instanceParents.has(parent)) {
      return false;
    }
    this.instanceParents.add(parent);
    for (const board of this.boards.values()) {
      this.createInstance(board, parent);
    }
    return true;
  }

  removeInstanceParent(parent) {
    if (!this.instanceParents.delete(parent)) {
      return false;
    }
    for (const [id, instances] of this.instancesById) {
      for (const instance of [...instances]) {
        if (instance !== this.boards.get(id)?.object3D && instance.parent === parent) {
          parent.remove(instance);
          instances.delete(instance);
        }
      }
    }
    return true;
  }

  removeUnmanagedClones(root) {
    if (!root || typeof root.traverse !== "function") {
      return;
    }
    const clonedBoards = [];
    root.traverse((node) => {
      if (node.userData && node.userData.infoBoardId) {
        clonedBoards.push(node);
      }
    });
    for (const clonedBoard of clonedBoards) {
      clonedBoard.removeFromParent();
    }
  }

  setBoards(configs) {
    if (!Array.isArray(configs)) {
      throw new TypeError("Infotafel-Konfiguration muss eine Liste sein.");
    }

    const nextIds = new Set();
    for (const config of configs) {
      const id = config && typeof config.id === "string" ? config.id.trim() : "";
      if (!id || nextIds.has(id)) {
        throw new Error("Infotafel-Konfiguration enthält eine fehlende oder doppelte ID.");
      }
      nextIds.add(id);
    }

    for (const id of [...this.boards.keys()]) {
      if (!nextIds.has(id)) {
        this.removeBoard(id);
      }
    }
    for (const config of configs) {
      const id = config.id.trim();
      const existing = this.boards.get(id);
      if (existing) {
        existing.update(config);
        this.syncBoardInstances(existing);
      } else {
        this.createBoard(config);
      }
    }
    return this.boards.size;
  }

  updateBoard(id, options) {
    const board = this.boards.get(id);
    if (!board) {
      return false;
    }
    const textureUpdated = board.update(options);
    this.syncBoardInstances(board);
    return textureUpdated;
  }

  updateBillboards(cameraOrState) {
    for (const [id, board] of this.boards) {
      for (const instance of this.instancesById.get(id) || []) {
        board.updateObjectBillboard(instance, cameraOrState);
      }
    }
  }

  removeBoard(id) {
    const board = this.boards.get(id);
    if (!board) {
      return false;
    }
    this.boards.delete(id);
    const instances = this.instancesById.get(id) || [];
    for (const instance of instances) {
      if (instance !== board.object3D) {
        instance.removeFromParent();
      }
    }
    this.instancesById.delete(id);
    board.dispose();
    return true;
  }

  clear() {
    for (const id of [...this.boards.keys()]) {
      this.removeBoard(id);
    }
  }

  dispose() {
    this.clear();
    this.instanceParents.clear();
    this.parent = null;
  }
}
