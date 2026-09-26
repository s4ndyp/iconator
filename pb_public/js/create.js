import { createIconRecord } from "./pb.js";

const VIEW_SIZE = 360;
const EXPORT_SIZE = 512;

const stage = document.getElementById("editorStage");
const canvas = document.getElementById("editorCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const maskRing = document.getElementById("maskRing");
const fileInput = document.getElementById("imageInput");
const nameInput = document.getElementById("iconName");
const thresholdInput = document.getElementById("threshold");
const thresholdValue = document.getElementById("thresholdValue");
const previewImg = document.getElementById("exportPreview");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
const maskButtons = [...document.querySelectorAll("[data-mask]")];
const modeButtons = [...document.querySelectorAll("[data-mode]")];

canvas.width = VIEW_SIZE;
canvas.height = VIEW_SIZE;

let image = null;
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let dragging = false;
let lastPointer = { x: 0, y: 0 };
let maskType = "round";
let transparentMode = true;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function fitImageToStage() {
  if (!image) return;
  const padding = maskType === "square" ? VIEW_SIZE * 0.16 : 0;
  const inner = VIEW_SIZE - padding * 2;
  const fit = Math.min(inner / image.width, inner / image.height);
  scale = fit;
  offsetX = (VIEW_SIZE - image.width * scale) / 2;
  offsetY = (VIEW_SIZE - image.height * scale) / 2;
}

function getClipRect() {
  if (maskType === "round") {
    return { x: 0, y: 0, w: VIEW_SIZE, h: VIEW_SIZE, round: true };
  }
  const inset = VIEW_SIZE * 0.08;
  return { x: inset, y: inset, w: VIEW_SIZE - inset * 2, h: VIEW_SIZE - inset * 2, round: false };
}

function applyClip(context, clip, scaleFactor = 1) {
  const x = clip.x * scaleFactor;
  const y = clip.y * scaleFactor;
  const w = clip.w * scaleFactor;
  const h = clip.h * scaleFactor;
  context.beginPath();
  if (clip.round) {
    context.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
  } else {
    context.rect(x, y, w, h);
  }
  context.clip();
}

function drawEditor() {
  ctx.clearRect(0, 0, VIEW_SIZE, VIEW_SIZE);
  if (!image) {
    ctx.fillStyle = "rgba(148, 163, 184, 0.35)";
    ctx.font = "600 15px DM Sans, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Kies een afbeelding", VIEW_SIZE / 2, VIEW_SIZE / 2);
    previewImg.removeAttribute("src");
    saveBtn.disabled = true;
    return;
  }

  saveBtn.disabled = false;
  const clip = getClipRect();
  ctx.save();
  applyClip(ctx, clip);
  ctx.drawImage(image, offsetX, offsetY, image.width * scale, image.height * scale);
  ctx.restore();

  updateExportPreview();
}

function removeBlackBackground(imageData, threshold) {
  const data = imageData.data;
  const limit = (threshold / 100) * 255;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const darkness = 255 - max;
    const isNeutralDark = max - min < 28 && max < limit + 40;
    if (max <= limit || (isNeutralDark && darkness > threshold * 1.6)) {
      const edge = Math.max(0, Math.min(1, (max - limit + 18) / 18));
      data[i + 3] = Math.round(data[i + 3] * edge);
    }
  }
  return imageData;
}

function renderExportCanvas() {
  if (!image) return null;
  const out = document.createElement("canvas");
  out.width = EXPORT_SIZE;
  out.height = EXPORT_SIZE;
  const octx = out.getContext("2d", { willReadFrequently: true });
  const ratio = EXPORT_SIZE / VIEW_SIZE;
  const clip = getClipRect();

  octx.save();
  applyClip(octx, clip, ratio);
  octx.drawImage(
    image,
    offsetX * ratio,
    offsetY * ratio,
    image.width * scale * ratio,
    image.height * scale * ratio
  );
  octx.restore();

  if (transparentMode) {
    const threshold = Number(thresholdInput.value);
    const clipped = octx.getImageData(0, 0, EXPORT_SIZE, EXPORT_SIZE);
    octx.putImageData(removeBlackBackground(clipped, threshold), 0, 0);
  }

  return out;
}

function updateExportPreview() {
  const exported = renderExportCanvas();
  if (!exported) return;
  previewImg.src = exported.toDataURL("image/png");
}

function loadImageFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      image = img;
      fitImageToStage();
      drawEditor();
      setStatus("Afbeelding geladen. Sleep om te positioneren, scroll om te zoomen.");
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function pointerPos(event) {
  const rect = canvas.getBoundingClientRect();
  const clientX = event.clientX ?? event.touches?.[0]?.clientX;
  const clientY = event.clientY ?? event.touches?.[0]?.clientY;
  return {
    x: ((clientX - rect.left) / rect.width) * VIEW_SIZE,
    y: ((clientY - rect.top) / rect.height) * VIEW_SIZE,
  };
}

stage.addEventListener("pointerdown", (event) => {
  if (!image) return;
  dragging = true;
  stage.classList.add("dragging");
  lastPointer = pointerPos(event);
  stage.setPointerCapture(event.pointerId);
});

stage.addEventListener("pointermove", (event) => {
  if (!dragging || !image) return;
  const pos = pointerPos(event);
  offsetX += pos.x - lastPointer.x;
  offsetY += pos.y - lastPointer.y;
  lastPointer = pos;
  drawEditor();
});

stage.addEventListener("pointerup", () => {
  dragging = false;
  stage.classList.remove("dragging");
});

stage.addEventListener(
  "wheel",
  (event) => {
    if (!image) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.92 : 1.08;
    const pos = pointerPos(event);
    const prevScale = scale;
    scale = Math.min(8, Math.max(0.05, scale * delta));
    offsetX = pos.x - ((pos.x - offsetX) * scale) / prevScale;
    offsetY = pos.y - ((pos.y - offsetY) * scale) / prevScale;
    drawEditor();
  },
  { passive: false }
);

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) loadImageFromFile(file);
});

thresholdInput.addEventListener("input", () => {
  thresholdValue.textContent = `${thresholdInput.value}%`;
  drawEditor();
});

maskButtons.forEach((button) => {
  button.addEventListener("click", () => {
    maskType = button.dataset.mask;
    maskButtons.forEach((b) => b.setAttribute("aria-pressed", b === button ? "true" : "false"));
    maskRing.classList.toggle("round", maskType === "round");
    maskRing.classList.toggle("square", maskType === "square");
    fitImageToStage();
    drawEditor();
  });
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    transparentMode = button.dataset.mode === "transparent";
    modeButtons.forEach((b) => b.setAttribute("aria-pressed", b === button ? "true" : "false"));
    thresholdInput.disabled = !transparentMode;
    drawEditor();
  });
});

saveBtn.addEventListener("click", async () => {
  const exported = renderExportCanvas();
  if (!exported) return;

  saveBtn.disabled = true;
  setStatus("Opslaan…");

  try {
    const blob = await new Promise((resolve) => exported.toBlob(resolve, "image/png"));
    await createIconRecord({
      name: nameInput.value.trim(),
      blob,
      mask: maskType,
      transparent: transparentMode,
    });
    setStatus("Icoon opgeslagen in de bibliotheek.");
    nameInput.value = "";
  } catch (error) {
    console.error(error);
    setStatus(error?.message || "Opslaan mislukt.", true);
  } finally {
    saveBtn.disabled = !image;
  }
});

drawEditor();
