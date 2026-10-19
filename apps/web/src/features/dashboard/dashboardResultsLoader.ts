import type { ApiRequestOptions } from "../../api/client";
import type { PatrolResult } from "../../types";
import type { ResultFilterOptions, ResultPage } from "../../repositories/resultsRepository";

type PageReader = (filters: ResultFilterOptions, options: ApiRequestOptions & { page: number }) => Promise<ResultPage>;

/** A period summary is published atomically only after every group page arrives. */
export async function loadDashboardResults(readPage: PageReader, filters: ResultFilterOptions, signal: AbortSignal) {
  const results = new Map<string, PatrolResult>();
  let expectedTotal: number | undefined;
  for (let page = 1; ; page++) {
    signal.throwIfAborted();
    const response = await readPage(filters, { page, signal });
    signal.throwIfAborted();
    if (response.page !== page || !Number.isInteger(response.totalPages) || response.totalPages < 0 || !Number.isInteger(response.total) || response.total < 0 || response.totalPages < page && response.hasMore) throw new Error("Сервер вернул некорректную страницу результатов. Повторите обновление.");
    if (expectedTotal !== undefined && expectedTotal !== response.total) throw new Error("Список результатов изменился во время загрузки. Повторите обновление.");
    expectedTotal = response.total;
    const previousSize = results.size;
    for (const result of response.results) results.set(result.id, result);
    if (page > 1 && results.size === previousSize) throw new Error("Не удалось получить полный список результатов. Повторите обновление.");
    if (!response.hasMore) {
      if (response.totalPages > page) throw new Error("Сервер вернул неполный список результатов. Повторите обновление.");
      return [...results.values()];
    }
    if (response.results.length === 0 || page >= response.totalPages) throw new Error("Сервер вернул неполный список результатов. Повторите обновление.");
  }
}
