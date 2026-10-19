// Old browser drafts are exported for manual review, never treated as a confirmed issue.
const prefix = "patrol360.inventory.ppe.issue-workflow.v3.";

export function readLegacyIssueDrafts(userId: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!userId.trim()) return result;
  const ownerKey = prefix + encodeURIComponent(userId.trim());
  try {
    const storage = window.localStorage;
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key || (key !== ownerKey && !key.startsWith(ownerKey + ".")) || key.endsWith(".active") || key.endsWith(".employee")) continue;
      const value = storage.getItem(key);
      if (value) result[key] = value;
    }
  } catch {
    // Unavailable browser storage must not prevent opening server documents.
  }
  return result;
}
