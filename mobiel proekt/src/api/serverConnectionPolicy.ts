// The health endpoint has its own per-request timeout. This separate cap
// bounds the full automatic fallback search, so one lost Wi-Fi connection
// cannot make the settings screen wait once per server candidate.
export const serverConnectionProbeBudgetMs = 12_000;

