export function orderServerCandidateBaseUrls(options: {
  primaryBaseUrl?: string;
  preferredBaseUrl?: string;
  storedBaseUrl?: string;
  allowedBaseUrls: string[];
}) {
  const candidates = [
    options.storedBaseUrl,
    options.preferredBaseUrl,
    options.primaryBaseUrl,
    ...options.allowedBaseUrls
  ];

  return candidates.filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
}
