let pbInstance;

function getPb() {
  if (!pbInstance) {
    if (!window.PocketBase) {
      throw new Error("PocketBase kon niet worden geladen.");
    }
    pbInstance = new window.PocketBase(window.location.origin);
  }
  return pbInstance;
}

export function iconFileUrl(record) {
  if (!record?.id || !record?.icon) return "";
  return getPb().files.getURL(record, record.icon);
}

export async function listIcons(options = {}) {
  const { page = 1, perPage = 60, filter = "" } = options;
  return getPb().collection("icons").getList(page, perPage, {
    sort: "-created",
    filter,
  });
}

export async function createIconRecord({ name, blob, mask, transparent }) {
  const form = new FormData();
  form.append("name", name || "Naamloos icoon");
  form.append("mask", mask);
  form.append("transparent", transparent ? "true" : "false");
  form.append("icon", blob, "icon.png");
  return getPb().collection("icons").create(form);
}

export async function deleteIconRecord(id) {
  return getPb().collection("icons").delete(id);
}
