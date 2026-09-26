const pb = new window.PocketBase(window.location.origin);

export function iconFileUrl(record) {
  if (!record?.id || !record?.icon) return "";
  return pb.files.getURL(record, record.icon);
}

export async function listIcons(options = {}) {
  const { page = 1, perPage = 60, filter = "" } = options;
  return pb.collection("icons").getList(page, perPage, {
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
  return pb.collection("icons").create(form);
}

export async function deleteIconRecord(id) {
  return pb.collection("icons").delete(id);
}

export { pb };
