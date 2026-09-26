import { deleteIconRecord, iconFileUrl, listIcons } from "./pb.js";

const grid = document.getElementById("iconGrid");
const searchInput = document.getElementById("search");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");

let records = [];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function filteredRecords() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return records;
  return records.filter((record) => (record.name || "").toLowerCase().includes(q));
}

function render() {
  const items = filteredRecords();
  grid.innerHTML = "";

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state">Geen iconen gevonden. Maak eerst een icoon of pas je zoekterm aan.</div>`;
    return;
  }

  for (const record of items) {
    const url = iconFileUrl(record);
    const name = record.name || "Naamloos icoon";
    const maskClass = record.mask === "round" ? "round" : "square";

    const tile = document.createElement("article");
    tile.className = "icon-tile";
    tile.innerHTML = `
      <div class="icon-tile-visual ${maskClass}">
        <img src="${url}" alt="${escapeHtml(name)}" loading="lazy" />
        <div class="icon-tile-overlay">
          <button type="button" class="icon-tile-btn copy-link" title="Kopieer link">
            <span aria-hidden="true">⎘</span>
            <span class="icon-tile-btn-label">Link</span>
          </button>
          <button type="button" class="icon-tile-btn delete-btn" title="Verwijderen">
            <span aria-hidden="true">×</span>
            <span class="icon-tile-btn-label">Wis</span>
          </button>
        </div>
      </div>
      <h3 class="icon-tile-name" title="${escapeHtml(name)}">${escapeHtml(name)}</h3>
    `;

    tile.querySelector(".copy-link").addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        await copyText(url);
        setStatus("Link gekopieerd naar het klembord.");
      } catch {
        setStatus("Kopiëren mislukt.", true);
      }
    });

    tile.querySelector(".delete-btn").addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!confirm(`"${name}" verwijderen?`)) return;
      try {
        await deleteIconRecord(record.id);
        records = records.filter((item) => item.id !== record.id);
        render();
        setStatus("Icoon verwijderd.");
      } catch (error) {
        setStatus(error?.message || "Verwijderen mislukt.", true);
      }
    });

    grid.appendChild(tile);
  }
}

async function loadIcons() {
  setStatus("Laden…");
  try {
    const result = await listIcons({ perPage: 200 });
    records = result.items;
    render();
    setStatus(`${records.length} icoon${records.length === 1 ? "" : "en"} geladen.`);
  } catch (error) {
    console.error(error);
    grid.innerHTML = `<div class="empty-state">Kon iconen niet laden. Controleer of PocketBase draait.</div>`;
    setStatus(error?.message || "Laden mislukt.", true);
  }
}

searchInput.addEventListener("input", render);
refreshBtn.addEventListener("click", loadIcons);

loadIcons();
