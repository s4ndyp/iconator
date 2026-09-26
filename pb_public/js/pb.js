const API_BASE = window.location.origin;

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

export function iconFileUrl(record) {
  if (!record?.id || !record?.icon) return "";
  return apiUrl(`/api/files/icons/${record.id}/${record.icon}`);
}

export async function listIcons(options = {}) {
  const { page = 1, perPage = 60, filter = "" } = options;
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
    sort: "-created",
  });
  if (filter) params.set("filter", filter);

  const response = await fetch(apiUrl(`/api/collections/icons/records?${params}`));
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json();
}

export async function createIconRecord({ name, blob, mask, transparent }) {
  const form = new FormData();
  form.append("name", name || "Naamloos icoon");
  form.append("mask", mask);
  form.append("transparent", transparent ? "true" : "false");
  form.append("icon", blob, "icon.png");

  const response = await fetch(apiUrl("/api/collections/icons/records"), {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json();
}

export async function deleteIconRecord(id) {
  const response = await fetch(apiUrl(`/api/collections/icons/records/${id}`), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
}

async function readError(response) {
  try {
    const data = await response.json();
    if (data?.message) return data.message;
    if (data?.data) return JSON.stringify(data.data);
  } catch {
    /* ignore */
  }
  return `Serverfout (${response.status})`;
}
