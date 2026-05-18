export interface ApiClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export interface ApiProblem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  traceId?: string;
  errors?: Record<string, string[]>;
}

export class ApiError extends Error {
  status: number;
  problem?: ApiProblem;

  constructor(message: string, status: number, problem?: ApiProblem) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor({ baseUrl = "", fetcher = fetch }: ApiClientOptions = {}) {
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, {
      method: "GET",
    });
  }

  async post<TResponse, TBody = unknown>(path: string, body?: TBody): Promise<TResponse> {
    return this.request<TResponse>(path, {
      body: body === undefined ? undefined : JSON.stringify(body),
      method: "POST",
    });
  }

  async put<TResponse, TBody = unknown>(path: string, body: TBody): Promise<TResponse> {
    return this.request<TResponse>(path, {
      body: JSON.stringify(body),
      method: "PUT",
    });
  }

  async delete<TResponse = void>(path: string): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: "DELETE",
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw await buildApiError(response, path);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

async function buildApiError(response: Response, path: string) {
  const problem = await tryReadProblem(response);
  const message = problem?.title || problem?.detail || `API ${path} вернул ${response.status}`;

  return new ApiError(message, response.status, problem);
}

async function tryReadProblem(response: Response): Promise<ApiProblem | undefined> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("json")) {
    return undefined;
  }

  try {
    return (await response.json()) as ApiProblem;
  } catch {
    return undefined;
  }
}
