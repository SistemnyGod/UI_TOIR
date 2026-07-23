export function orderServerCandidateBaseUrls(options: {
  primaryBaseUrl?: string;
  preferredBaseUrl?: string;
  storedBaseUrl?: string;
  allowedBaseUrls: string[];
}) {
  const candidates = [
    options.primaryBaseUrl,
    options.preferredBaseUrl,
    options.storedBaseUrl,
    ...options.allowedBaseUrls
  ];

  return candidates.filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
}
