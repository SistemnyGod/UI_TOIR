export const mobileActionLogRetentionDays = 30;
export const maxMobileActionLogEntriesPerOwner = 2_000;

export function getMobileActionLogRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - mobileActionLogRetentionDays * 24 * 60 * 60 * 1000).toISOString();
}
