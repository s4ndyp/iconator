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

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
    const card = document.createElement("article");
    card.className = "icon-card";
    card.innerHTML = `
      <div class="icon-card-preview ${record.mask === "round" ? "round" : ""}">
        <img src="${url}" alt="${record.name || "Icoon"}" loading="lazy" />
      </div>
      <h3 title="${record.name || "Naamloos icoon"}">${record.name || "Naamloos icoon"}</h3>
      <p class="meta">${record.transparent ? "Transparant" : "Normaal"} · ${record.mask === "round" ? "Rond" : "Vierkant"} · ${formatDate(record.created)}</p>
      <div class="actions">
        <button type="button" class="btn btn-secondary copy-link">Kopieer link</button>
        <button type="button" class="btn btn-ghost delete-btn" title="Verwijderen">×</button>
      </div>
    `;

    card.querySelector(".copy-link").addEventListener("click", async () => {
      try {
        await copyText(url);
        setStatus("Link gekopieerd naar het klembord.");
      } catch (error) {
        setStatus("Kopiëren mislukt.", true);
      }
    });

    card.querySelector(".delete-btn").addEventListener("click", async () => {
      if (!confirm(`"${record.name || "Dit icoon"}" verwijderen?`)) return;
      try {
        await deleteIconRecord(record.id);
        records = records.filter((item) => item.id !== record.id);
        render();
        setStatus("Icoon verwijderd.");
      } catch (error) {
        setStatus(error?.message || "Verwijderen mislukt.", true);
      }
    });

    grid.appendChild(card);
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
