const DEFAULT_TIMEOUT_MS = 15_000;

type HeaderMap = Record<string, string>;

interface ViteImportMeta {
  env?: {
    VITE_API_BASE_URL?: string;
  };
}

export interface ApiClientOptions {
  baseUrl?: string;
  credentials?: RequestCredentials;
  defaultHeaders?: HeadersInit;
  fetcher?: typeof fetch;
  getAuthToken?: () => string | undefined;
  onUnauthorized?: (error: ApiError) => void;
  timeoutMs?: number;
}

export interface ApiRequestOptions {
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ApiProblem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  traceId?: string;
  errors?: Record<string, string[]>;
}

export type ApiErrorKind = "abort" | "http" | "network" | "parse" | "timeout";

export interface ApiErrorDetails {
  kind?: ApiErrorKind;
  path?: string;
  problem?: ApiProblem;
  requestId?: string;
}

export class ApiError extends Error {
  readonly errors?: Record<string, string[]>;
  readonly kind: ApiErrorKind;
  readonly path?: string;
  readonly problem?: ApiProblem;
  readonly requestId?: string;
  readonly status: number;

  constructor(message: string, status: number, details: ApiErrorDetails = {}) {
    super(message);
    this.name = "ApiError";
    this.errors = details.problem?.errors;
    this.kind = details.kind ?? "http";
    this.path = details.path;
    this.problem = details.problem;
    this.requestId = details.requestId ?? details.problem?.traceId;
    this.status = status;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly credentials?: RequestCredentials;
  private readonly defaultHeaders?: HeadersInit;
  private readonly fetcher: typeof fetch;
  private readonly getAuthToken?: () => string | undefined;
  private readonly onUnauthorized?: (error: ApiError) => void;
  private readonly timeoutMs: number;

  constructor({
    baseUrl,
    credentials = "same-origin",
    defaultHeaders,
    fetcher = fetch,
    getAuthToken,
    onUnauthorized,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: ApiClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl ?? getDefaultApiBaseUrl());
    this.credentials = credentials;
    this.defaultHeaders = defaultHeaders;
    this.fetcher = fetcher;
    this.getAuthToken = getAuthToken;
    this.onUnauthorized = onUnauthorized;
    this.timeoutMs = timeoutMs;
  }

  async get<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    return this.request<T>(path, { method: "GET" }, options);
  }

  async post<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options: ApiRequestOptions = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(
      path,
      {
        body: body === undefined ? undefined : JSON.stringify(body),
        method: "POST",
      },
      options,
    );
  }

  async put<TResponse, TBody = unknown>(
    path: string,
    body: TBody,
    options: ApiRequestOptions = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(
      path,
      {
        body: JSON.stringify(body),
        method: "PUT",
      },
      options,
    );
  }

  async delete<TResponse = void>(path: string, options: ApiRequestOptions = {}): Promise<TResponse> {
    return this.request<TResponse>(path, { method: "DELETE" }, options);
  }

  private async request<T>(path: string, init: RequestInit, options: ApiRequestOptions): Promise<T> {
    const { cleanup, signal, timedOut } = createRequestSignal(options.signal, options.timeoutMs ?? this.timeoutMs);

    try {
      const response = await this.fetcher(buildUrl(this.baseUrl, path), {
        ...init,
        credentials: this.credentials,
        headers: this.buildHeaders(init.headers, options.headers),
        signal,
      });

      if (!response.ok) {
        const error = await buildHttpError(response, path);
        if (response.status === 401 || response.status === 403) {
          this.onUnauthorized?.(error);
        }

        throw error;
      }

      return await readResponseBody<T>(response, path);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (timedOut()) {
        throw new ApiError(`API ${path} timed out`, 0, { kind: "timeout", path });
      }

      if (options.signal?.aborted || isAbortError(error)) {
        throw new ApiError(`API ${path} was aborted`, 0, { kind: "abort", path });
      }

      throw new ApiError(error instanceof Error ? error.message : `API ${path} network error`, 0, {
        kind: "network",
        path,
      });
    } finally {
      cleanup();
    }
  }

  private buildHeaders(...headers: Array<HeadersInit | undefined>): HeaderMap {
    const nextHeaders = new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
    });

    for (const headerSet of [this.defaultHeaders, ...headers]) {
      if (!headerSet) {
        continue;
      }

      new Headers(headerSet).forEach((value, key) => {
        nextHeaders.set(key, value);
      });
    }

    const token = this.getAuthToken?.();
    if (token) {
      nextHeaders.set("Authorization", `Bearer ${token}`);
    }

    return Object.fromEntries(nextHeaders.entries());
  }
}

async function buildHttpError(response: Response, path: string) {
  const problem = await tryReadProblem(response);
  const requestId = readRequestId(response, problem);
  const message = problem?.title || problem?.detail || `API ${path} returned ${response.status}`;

  return new ApiError(message, response.status, {
    kind: "http",
    path,
    problem,
    requestId,
  });
}

async function readResponseBody<T>(response: Response, path: string): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const content = await response.text();
  if (!content) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    return content as T;
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    throw new ApiError(`API ${path} returned invalid JSON`, response.status, { kind: "parse", path });
  }
}

async function tryReadProblem(response: Response): Promise<ApiProblem | undefined> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("json")) {
    return undefined;
  }

  try {
    const body = (await response.clone().json()) as unknown;
    return isApiProblem(body) ? body : undefined;
  } catch {
    return undefined;
  }
}

function createRequestSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const abortFromParent = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    abortFromParent();
  } else {
    signal?.addEventListener("abort", abortFromParent, { once: true });
  }

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);
  }

  return {
    cleanup() {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      signal?.removeEventListener("abort", abortFromParent);
    },
    signal: controller.signal,
    timedOut: () => didTimeout,
  };
}

function getDefaultApiBaseUrl() {
  return ((import.meta as ViteImportMeta).env?.VITE_API_BASE_URL ?? "").trim();
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function buildUrl(baseUrl: string, path: string) {
  if (!baseUrl || /^https?:\/\//i.test(path)) {
    return path;
  }

  return `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
}

function readRequestId(response: Response, problem?: ApiProblem) {
  return (
    problem?.traceId ??
    response.headers.get("x-correlation-id") ??
    response.headers.get("x-request-id") ??
    response.headers.get("traceparent") ??
    undefined
  );
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isApiProblem(value: unknown): value is ApiProblem {
  return typeof value === "object" && value !== null;
}
