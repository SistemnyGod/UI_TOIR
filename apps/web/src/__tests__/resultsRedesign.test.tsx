import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResultsWorkspace, buildResultGroups } from "../features/patrol/results/ResultsWorkspace";
import { PatrolResultDetails } from "../features/patrol/results/PatrolResultDetails";
import { ResultPointMedia } from "../features/patrol/results/ResultPointMedia";
import { ResultMediaViewer, type ResultMediaPreviewState } from "../features/patrol/results/ResultMediaViewer";
import { useState } from "react";
import { buildResultJournalCsv, buildPatrolReportCsv, filterResultJournal, resultDateRange, resultHasIssue } from "../features/patrol/results/resultPresentation";
import type { PatrolResult, PatrolResultAttachment } from "../types";

const mocks = vi.hoisted(() => ({ download: vi.fn(), getResult: vi.fn(), workspace: vi.fn(), refresh: vi.fn(), export: vi.fn() }));
vi.mock("../repositories/resultsRepository", async (importOriginal) => {
  const original = await importOriginal<typeof import("../repositories/resultsRepository")>();
  return { ...original, createApiResultsRepository: () => ({ ...original.createApiResultsRepository(), getResult: mocks.getResult }), downloadResultAttachment: mocks.download };
});
vi.mock("../hooks/useResultsWorkspace", () => ({ useResultsWorkspace: mocks.workspace }));

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const createUrl = vi.fn(() => "blob:preview");
const revokeUrl = vi.fn();
beforeEach(() => {
  mocks.download.mockResolvedValue({ blob: new Blob(["photo"]), fileName: "photo.jpg" });
  mocks.getResult.mockReset();
  createUrl.mockClear(); revokeUrl.mockClear(); mocks.workspace.mockClear(); mocks.export.mockClear();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: createUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: revokeUrl });
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); mocks.download.mockReset(); vi.useRealTimers();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: originalCreate });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: originalRevoke });
});

describe("results journal", () => {
  it("paginates by patrol, defaults to newest first and resets the page for search", async () => {
    const results = Array.from({ length: 14 }, (_, index) => result(`r-${index}`, { assignmentId: `a-${index}`, route: `Маршрут ${index}`, actualAt: `2026-09-${String(index + 1).padStart(2, "0")}T08:00:00`, shift: index % 2 ? "Ночь" : "День" }));
    workspace(results);
    render(<ResultsWorkspace dataSourceMode="mock" />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(7);
    expect(within(table).getAllByRole("row")[1].textContent).toContain("Маршрут 13");
    fireEvent.click(screen.getByRole("button", { name: "Следующая страница результатов" }));
    expect(within(table).getAllByRole("row")[1].textContent).toContain("Маршрут 7");
    fireEvent.change(screen.getByLabelText("Поиск по результатам обходов"), { target: { value: "Маршрут 13" } });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Страница результатов 1" }).getAttribute("aria-current")).toBe("page");
    fireEvent.change(screen.getByLabelText("Поиск по результатам обходов"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Порядок результатов"), { target: { value: "oldest" } });
    expect(within(table).getAllByRole("row")[1].textContent).toContain("Маршрут 0");
    fireEvent.change(screen.getByLabelText("Смена результатов"), { target: { value: "Ночь" } });
    expect(within(table).getAllByRole("row")[1].textContent).toContain("Маршрут 1");
  });

  it("sends the selected date period to loading and export and exports the whole filtered journal", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 1, 14));
    workspace([result("r-1", { actualAt: "2026-10-01T08:00:00", photos: 1 })]);
    mocks.export.mockResolvedValue({ blob: new Blob(["csv"]), headers: {}, fileName: "results.csv" });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<ResultsWorkspace dataSourceMode="api" />);
    fireEvent.change(screen.getByLabelText("Период результатов"), { target: { value: "week" } });
    expect(mocks.workspace.mock.lastCall?.[0].filters).toMatchObject({ dateFrom: "2026-09-25", dateTo: "2026-10-01" });
    fireEvent.click(screen.getByRole("button", { name: "Экспорт" }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledWith(expect.objectContaining({ dateFrom: "2026-09-25", dateTo: "2026-10-01" })));
    expect(mocks.export.mock.lastCall?.[0].assignmentId).toBeUndefined();
    await waitFor(() => expect(screen.getByRole("button", { name: "Экспорт" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("tab", { name: /С медиа/ }));
    fireEvent.click(screen.getByRole("button", { name: "Экспорт" }));
    await waitFor(() => expect(mocks.export.mock.lastCall?.[0]).toMatchObject({ hasPhotos: true }));
  });

  it("clamps the last page when refreshed data becomes shorter", async () => {
    const results = Array.from({ length: 14 }, (_, index) => result(`r-${index}`, { assignmentId: `a-${index}` }));
    workspace(results);
    const view = render(<ResultsWorkspace dataSourceMode="mock" />);
    fireEvent.click(screen.getByRole("button", { name: "Страница результатов 3" }));
    workspace(results.slice(0, 2)); view.rerender(<ResultsWorkspace dataSourceMode="mock" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Страница результатов 1" }).getAttribute("aria-current")).toBe("page"));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(3);
    workspace(results); view.rerender(<ResultsWorkspace dataSourceMode="mock" />);
    expect(screen.getByRole("button", { name: "Страница результатов 1" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("result presentation", () => {
  it("uses local calendar days, includes the last day and filters by shift", () => {
    const range = resultDateRange("week", new Date(2026, 9, 1, 23, 59));
    expect(range).toEqual({ dateFrom: "2026-09-25", dateTo: "2026-10-01" });
    const groups = buildResultGroups([
      result("first", { assignmentId: "first", actualAt: "25.09.2026, 00:00", shift: "Ночь" }),
      result("last", { assignmentId: "last", actualAt: "01.10.2026, 23:59", shift: "Ночь" }),
      result("before", { assignmentId: "before", actualAt: "24.09.2026, 23:59" }),
      result("after", { assignmentId: "after", actualAt: "02.10.2026, 00:00" }),
    ]);
    expect(filterResultJournal(groups, range, "Ночь", "newest").map((group) => group.results[0].id)).toEqual(["last", "first"]);
    expect(filterResultJournal(groups, range, "Ночь", "oldest").map((group) => group.results[0].id)).toEqual(["first", "last"]);
  });
  it.each(["нет", "none", "-", "без замечаний"])("does not count empty issue type %s as a defect", (issueType) => {
    expect(resultHasIssue(result("ok", { issueType }))).toBe(false);
    expect(buildResultGroups([result("ok", { issueType })])[0].issuePoints).toBe(0);
  });
  it("keeps unavailable marks as remarks and safely quotes CSV", () => {
    expect(resultHasIssue(result("skipped", { status: "skipped", comment: "Метка недоступна" }))).toBe(true);
    const csv = buildResultJournalCsv(buildResultGroups([result("csv", { employee: '=HYPERLINK("bad")', route: 'Печь; "А"' })]));
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"'); expect(csv).toContain('"Печь; ""А"""'); expect(csv.startsWith("\uFEFF")).toBe(true);
    const report = buildPatrolReportCsv(buildResultGroups([result("report", { point: "Галерея 1", comment: "Осмотрено", attachments: [attachment("photo")] })]));
    expect(report).toContain('"Галерея 1"'); expect(report).toContain('"Осмотрено"'); expect(report).toContain('"photo.jpg"');
  });
});

describe("patrol detail and media", () => {
  it("expands a long comment and opens attachments from its own row without preloading files", () => {
    const first = result("long", { point: "Печь 1", comment: "Подробное замечание по ограждению. ".repeat(15).trim(), photos: 2 });
    const second = result("next", { point: "Печь 2", comment: "Крепление исправно." });
    const onOpenAttachment = vi.fn(); const onBeforeOpenAttachment = vi.fn();
    render(<PatrolResultDetails group={buildResultGroups([first, second])[0]} initialReadingMode="comments"
      onClose={vi.fn()} onCreateRequest={vi.fn()} onExport={vi.fn()} onOpenRequest={vi.fn()}
      onOpenAttachment={onOpenAttachment} onBeforeOpenAttachment={onBeforeOpenAttachment} photoLoadingResultId={null} />);
    const overview = screen.getByRole("region", { name: "Комментарии по точкам" });
    const expand = within(overview).getByRole("button", { name: "Читать полностью" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expand);
    expect(within(overview).getByRole("button", { name: "Свернуть комментарий" }).getAttribute("aria-expanded")).toBe("true");
    expect(within(overview).getByText(first.comment).textContent).toBe(first.comment);
    expect(mocks.download).not.toHaveBeenCalled();
    const media = within(overview).getByRole("button", { name: "Просмотреть вложения · 2" });
    fireEvent.click(media);
    expect(onBeforeOpenAttachment).toHaveBeenCalledWith(media);
    expect(onOpenAttachment).toHaveBeenCalledWith(first, 1, 0);
    expect(within(overview).getByText(second.comment)).toBeTruthy();
    fireEvent.click(within(overview).getByRole("button", { name: "Свернуть комментарий" }));
    expect(within(overview).getByRole("button", { name: "Читать полностью" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("reads full multiline comments together without downloading originals and keeps the chosen point on refresh", async () => {
    const first = result("one", { point: "Галерея 1", comment: "Первая строка\nВторая строка", attachments: [attachment("one")] });
    const second = result("two", { point: "Галерея 2", comment: "Проверить поручень после ремонта", actualAt: "01.10.2026, 10:20" });
    const props = { onClose: vi.fn(), onCreateRequest: vi.fn(), onExport: vi.fn(), onOpenRequest: vi.fn(), onOpenAttachment: vi.fn(), photoLoadingResultId: null };
    const view = render(<PatrolResultDetails group={buildResultGroups([first, second])[0]} initialReadingMode="comments" {...props} />);
    const overview = screen.getByRole("region", { name: "Комментарии по точкам" });
    expect(within(overview).getByText("Первая строка Вторая строка").textContent).toBe(first.comment);
    expect(within(overview).getByText(second.comment)).toBeTruthy();
    expect(mocks.download).not.toHaveBeenCalled();
    fireEvent.click(within(overview).getAllByRole("button", { name: "Открыть точку" })[1]);
    expect(screen.getByRole("heading", { name: "Галерея 2" })).toBeTruthy();
    view.rerender(<PatrolResultDetails group={buildResultGroups([{ ...first }, { ...second }])[0]} initialReadingMode="comments" {...props} />);
    expect(screen.getByRole("heading", { name: "Галерея 2" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Предыдущая точка" }));
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Галерея 1" })).toBeTruthy();
  });

  it("opens comments and points with attachments straight from the journal", async () => {
    workspace([result("one", { comment: "Нужно заменить крепление", photos: 1, attachments: [attachment("one")] })]);
    render(<ResultsWorkspace dataSourceMode="mock" />);
    fireEvent.click(screen.getByRole("button", { name: /Комментарии обхода:/ }));
    expect(screen.getByRole("region", { name: "Комментарии по точкам" })).toBeTruthy();
    expect(mocks.download).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getAllByRole("button", { name: /^Закрыть$/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Вложения обхода:/ }));
    expect(within(screen.getByRole("dialog")).getByRole("tab", { name: /С медиа/ }).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
  });

  it("discards detail responses from the previous session and clears an open report", async () => {
    const id = "10000000-0000-4000-8000-000000000001";
    const point = result(id, { photos: 1 }); workspace([point]);
    let resolve: (value: PatrolResult) => void = () => {};
    const pending = new Promise<PatrolResult>(done => { resolve = done; });
    mocks.getResult.mockReturnValueOnce(pending).mockResolvedValue({ ...point, attachments: [attachment("new-session")] });
    const view = render(<ResultsWorkspace dataSourceMode="api" sessionKey="first" openResultId={id} />);
    await waitFor(() => expect(mocks.getResult).toHaveBeenCalledTimes(1));
    view.rerender(<ResultsWorkspace dataSourceMode="api" sessionKey="second" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => { resolve({ ...point, attachments: [attachment("old-session")] }); await pending; });
    fireEvent.click(screen.getByRole("button", { name: /^Открыть$/ }));
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
    expect(mocks.getResult).toHaveBeenCalledTimes(2);
    expect(mocks.download.mock.calls.map(([item]) => item.id)).toEqual(["new-session"]);
  });
  it("loads detail for a direct result link and retries a failed point request", async () => {
    const id = "10000000-0000-4000-8000-000000000001";
    const point = result(id, { photos: 1 }); workspace([point]);
    mocks.getResult.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ...point, attachments: [attachment("photo")] });
    render(<ResultsWorkspace dataSourceMode="api" openResultId={id} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Повторить загрузку точки" })).toBeTruthy());
    expect(mocks.getResult).toHaveBeenCalledWith(id);
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку точки" }));
    await waitFor(() => expect(screen.getByRole("img").getAttribute("src")).toBe("blob:preview"));
    expect(mocks.getResult).toHaveBeenCalledTimes(2);
  });

  it("selects points, filters remarks with original order and respects creation permissions", async () => {
    const group = buildResultGroups([result("one", { point: "Галерея 1", attachments: [attachment("photo")] }), result("two", { point: "Галерея 2", actualAt: "01.10.2026, 10:20", issueType: "Повреждение", comment: "Повреждён поручень" })])[0];
    render(<PatrolResultDetails group={group} onClose={vi.fn()} onCreateRequest={vi.fn()} onExport={vi.fn()} onOpenRequest={vi.fn()} onOpenAttachment={vi.fn()} photoLoadingResultId={null} canCreateRequest={false} />);
    expect(screen.queryByRole("button", { name: "Создать заявку" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("img").getAttribute("src")).toBe("blob:preview"));
    expect(mocks.download).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("tab", { name: /Замечания\s*1/ }));
    expect(screen.getByRole("heading", { name: "Галерея 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /2 Галерея 2/ })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Выбранная точка обхода" })).getByText("Повреждён поручень")).toBeTruthy();
    expect(revokeUrl).toHaveBeenCalledWith("blob:preview");
    fireEvent.change(screen.getByLabelText("Поиск точки обхода"), { target: { value: "несуществующая" } });
    expect(screen.getByText("Точки по выбранному фильтру не найдены.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Галерея 2" })).toBeNull();
  });

  it("loads only the displayed attachment, cleans its URL and enlarges the selected index", async () => {
    const enlarge = vi.fn();
    render(<ResultPointMedia attachments={[attachment("one"), attachment("two")]} expectedCount={2} pointName="Печь" onEnlarge={enlarge} />);
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
    expect(mocks.download.mock.calls.map(([item]) => item.id)).toEqual(["one"]);
    fireEvent.click(screen.getByRole("button", { name: "Следующее вложение" }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(2));
    expect(revokeUrl).toHaveBeenCalledWith("blob:preview");
    fireEvent.click(screen.getByRole("button", { name: "Увеличить" }));
    expect(enlarge.mock.lastCall?.[1]).toBe(1);
  });

  it("offers retry on failure and hides arrows for one attachment", async () => {
    mocks.download.mockRejectedValueOnce(new Error("offline"));
    render(<ResultPointMedia attachments={[attachment("one")]} expectedCount={1} pointName="Печь" onEnlarge={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Повторить" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Следующее вложение" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("Не удалось открыть изображение. Повторите загрузку.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeTruthy();
  });

  it("ignores a download completed after unmount", async () => {
    let resolve: (file: { blob: Blob }) => void = () => {};
    const pending = new Promise<{ blob: Blob }>((done) => { resolve = done; }); mocks.download.mockReturnValue(pending);
    const view = render(<ResultPointMedia attachments={[attachment("late")]} expectedCount={1} pointName="Печь" onEnlarge={vi.fn()} />);
    view.unmount(); await act(async () => { resolve({ blob: new Blob(["photo"]) }); await pending; });
    expect(createUrl).not.toHaveBeenCalled();
  });
});

describe("large attachment viewer", () => {
  it("keeps the selected photo and scale while hiding its details and expanding the window", async () => {
    render(<MediaHarness />);
    await screen.findByRole("img");
    fireEvent.click(screen.getByRole("button", { name: "Увеличить фото" }));
    fireEvent.click(screen.getByRole("button", { name: "Скрыть детали точки" }));
    expect(screen.queryByRole("complementary", { name: "Детали точки" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Развернуть окно" }));
    expect(screen.getByRole("button", { name: "Обычный размер окна" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Масштаб фото").textContent).toBe("150%");
    expect(screen.getByRole("img").getAttribute("alt")).toBe("one.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Показать детали точки" }));
    expect(screen.getByRole("complementary", { name: "Детали точки" }).textContent).toContain("Заменить крепление");
    fireEvent.click(screen.getByRole("button", { name: "Обычный размер окна" }));
    expect(screen.getByLabelText("Масштаб фото").textContent).toBe("150%");
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it("opens and brings the point comment into view from the mobile header", async () => {
    vi.stubGlobal("matchMedia", vi.fn(query => ({ matches: query === "(max-width: 760px)", addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
    try {
      render(<MediaHarness />);
      await screen.findByRole("img");
      expect(screen.getByRole("button", { name: "Показать детали точки" }).getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(screen.getByRole("button", { name: "Показать детали точки" }));
      await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" }));
      expect(screen.getByRole("button", { name: "Скрыть детали точки" }).getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByText("Проверить поручень Заменить крепление")).toBeTruthy();
      expect(mocks.download).toHaveBeenCalledTimes(1);
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("preserves the image centre when zooming and pans with the keyboard without changing files", async () => {
    render(<MediaHarness />);
    await screen.findByRole("img");
    const stage = screen.getByRole("region", { name: "Фотография: масштаб и перемещение" });
    Object.defineProperties(stage, { clientWidth: { value: 600 }, clientHeight: { value: 400 } });
    fireEvent.click(screen.getByRole("button", { name: "Увеличить фото" }));
    expect(stage.scrollLeft).toBe(150); expect(stage.scrollTop).toBe(100);
    stage.focus(); fireEvent.keyDown(stage, { key: "ArrowRight" });
    expect(stage.scrollLeft).toBe(210);
    expect(screen.getByRole("img").getAttribute("alt")).toBe("one.jpg");
    fireEvent.keyDown(stage, { key: "0" });
    expect(screen.getByLabelText("Масштаб фото").textContent).toBe("100%");
    expect(stage.scrollLeft).toBe(0); expect(stage.scrollTop).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Следующий снимок" }));
    await waitFor(() => expect(screen.getByRole("img").getAttribute("alt")).toBe("two.jpg"));
  });

  it("moves between points with attachments and retains the report when the viewer is closed", async () => {
    const first = result("first", { point: "Галерея 1", photos: 1, attachments: [attachment("first")] });
    const second = result("second", { point: "Галерея 2", photos: 1, attachments: [attachment("second")] });
    workspace([first, second]);
    render(<ResultsWorkspace dataSourceMode="mock" />);
    fireEvent.click(screen.getByRole("button", { name: /Вложения обхода:/ }));
    await screen.findByRole("img");
    fireEvent.click(screen.getByRole("button", { name: "Увеличить" }));
    const viewer = await screen.findByRole("dialog", { name: "Галерея 1" });
    fireEvent.click(within(viewer).getByRole("button", { name: "Следующая точка с вложениями" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Галерея 2" })).toBeTruthy());
    expect(within(screen.getByRole("dialog", { name: "Галерея 2" })).getByRole("button", { name: "Следующая точка с вложениями" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Вернуться к отчёту" }));
    expect(screen.queryByRole("dialog", { name: "Галерея 2" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Обход «Помол»" })).toBeTruthy();
  });

  it("does not reopen the photo dialog when a delayed point arrives after closing", async () => {
    const first = result("10000000-0000-4000-8000-000000000011", { point: "Галерея 1", photos: 1, attachments: [attachment("first")] });
    const second = result("10000000-0000-4000-8000-000000000012", { point: "Галерея 2", photos: 1 });
    workspace([first, second]);
    let resolve: (value: PatrolResult) => void = () => {};
    const pending = new Promise<PatrolResult>(done => { resolve = done; });
    mocks.getResult.mockReturnValue(pending);
    render(<ResultsWorkspace dataSourceMode="api" />);
    fireEvent.click(screen.getByRole("button", { name: /Вложения обхода:/ }));
    await screen.findByRole("img");
    fireEvent.click(screen.getByRole("button", { name: "Увеличить" }));
    await screen.findByRole("dialog", { name: "Галерея 1" });
    fireEvent.click(screen.getByRole("button", { name: "Следующая точка с вложениями" }));
    fireEvent.click(screen.getByRole("button", { name: "Вернуться к отчёту" }));
    await act(async () => { resolve({ ...second, attachments: [attachment("late")] }); await pending; });
    expect(screen.queryByRole("dialog", { name: "Галерея 2" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Галерея 1" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Обход «Помол»" })).toBeTruthy();
  });

  it("zooms, fits, navigates with arrows, resets zoom for the next photo and downloads the selected original", async () => {
    const download = vi.fn();
    render(<MediaHarness onDownload={download} />);
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Увеличить фото" }));
    expect(screen.getByLabelText("Масштаб фото").textContent).toBe("150%");
    fireEvent.click(screen.getByRole("button", { name: "По размеру окна" }));
    expect(screen.getByLabelText("Масштаб фото").textContent).toBe("100%");
    fireEvent.doubleClick(screen.getByRole("img"));
    expect(screen.getByLabelText("Масштаб фото").textContent).toBe("200%");
    fireEvent.keyDown(screen.getByRole("button", { name: "Закрыть" }), { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByRole("img").getAttribute("alt")).toBe("two.jpg"));
    expect(screen.getByLabelText("Масштаб фото").textContent).toBe("100%");
    expect(revokeUrl).toHaveBeenCalledWith("blob:preview");
    fireEvent.click(screen.getByRole("button", { name: "Скачать оригинал" }));
    expect(download.mock.calls[0][0].id).toBe("two");
    expect(screen.getByText("Проверить поручень Заменить крепление").textContent).toContain("Заменить крепление");
  });

  it("does not download again or reset zoom when point metadata is refreshed", async () => {
    const preview: ResultMediaPreviewState = { result: result("one"), attachments: [attachment("one")], index: 0 };
    const props = { onClose: vi.fn(), onDownload: vi.fn(), onSelect: vi.fn() };
    const view = render(<ResultMediaViewer preview={preview} {...props} />);
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Увеличить фото" }));
    view.rerender(<ResultMediaViewer preview={{ ...preview, attachments: [{ ...preview.attachments[0] }], result: { ...preview.result, comment: "Обновлённый комментарий" } }} {...props} />);
    expect(screen.getByText("Обновлённый комментарий")).toBeTruthy();
    expect(screen.getByLabelText("Масштаб фото").textContent).toBe("150%");
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it("locks original download until it settles and supplies the already loaded blob", async () => {
    let reject: (error: Error) => void = () => {};
    const pending = new Promise<void>((_, fail) => { reject = fail; });
    const download = vi.fn((_attachment: PatrolResultAttachment, _file?: { blob: Blob }) => pending);
    render(<MediaHarness onDownload={download} />);
    await screen.findByRole("img");
    const button = screen.getByRole("button", { name: "Скачать оригинал" });
    fireEvent.click(button); fireEvent.click(button);
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0][1]!.blob).toBeInstanceOf(Blob);
    expect(button.hasAttribute("disabled")).toBe(true);
    await act(async () => { reject(new Error("browser download failed")); await pending.catch(() => {}); });
    expect(screen.getByRole("alert").textContent).toContain("Не удалось скачать файл");
    expect(screen.getByRole("button", { name: "Скачать оригинал" }).hasAttribute("disabled")).toBe(false);
  });

  it("retries network and decoding errors without losing the point comment", async () => {
    mocks.download.mockRejectedValueOnce(new Error("offline"));
    render(<MediaHarness />);
    fireEvent.click(await screen.findByRole("button", { name: "Повторить загрузку" }));
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("Не удалось открыть изображение. Повторите загрузку.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    await waitFor(() => expect(screen.getByRole("img")).toBeTruthy());
    expect(mocks.download).toHaveBeenCalledTimes(3);
  });

  it("does not display an old photo that arrives after the selection changes", async () => {
    let resolve: (value: { blob: Blob }) => void = () => {};
    const pending = new Promise<{ blob: Blob }>(done => { resolve = done; });
    mocks.download.mockReturnValueOnce(pending);
    render(<MediaHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Следующее вложение" }));
    await waitFor(() => expect(screen.getByRole("img").getAttribute("alt")).toBe("two.jpg"));
    await act(async () => { resolve({ blob: new Blob(["old photo"]) }); await pending; });
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("img").getAttribute("alt")).toBe("two.jpg");
  });

  it("offers original download for unsupported files without trying to preview them", () => {
    render(<ResultMediaViewer preview={{ result: result("file"), attachments: [{ ...attachment("doc"), fileName: "act.pdf", contentType: "application/pdf" }], index: 0 }} onClose={vi.fn()} onSelect={vi.fn()} onDownload={vi.fn()} />);
    expect(screen.getByText("Предпросмотр недоступен")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Скачать оригинал" })).toBeTruthy();
    expect(mocks.download).not.toHaveBeenCalled();
  });
});

function MediaHarness({ onDownload = vi.fn() }: { onDownload?: (attachment: PatrolResultAttachment) => void }) {
  const [index, setIndex] = useState(0);
  return <ResultMediaViewer preview={{ result: result("point", { comment: "Проверить поручень\nЗаменить крепление" }), attachments: [attachment("one"), attachment("two")], index, order: 2 }} onClose={vi.fn()} onSelect={setIndex} onDownload={onDownload} />;
}

function workspace(results: PatrolResult[]) {
  mocks.workspace.mockReturnValue({ results, selectedResult: results[0], listStatus: "ready", refreshResults: mocks.refresh, exportResults: mocks.export, hasMoreResults: false, loadMoreResults: vi.fn(), loadMoreStatus: "idle", totalResults: buildResultGroups(results).length });
}
function result(id: string, patch: Partial<PatrolResult> = {}): PatrolResult {
  return { id, assignmentId: "a-1", actualAt: "01.10.2026, 10:00", chronology: [], comment: "без комментария", deviation: "0", employee: "Иванов Иван Иванович", employeeId: "e-1", issueType: "нет", photos: 0, plannedAt: "01.10.2026, 09:00", point: "Галерея", pointId: id, route: "Помол", routeId: "route-1", severity: "-", shift: "День", status: "Подтверждено", territory: "Цех", ...patch };
}
function attachment(id: string): PatrolResultAttachment {
  return { id, contentType: "image/jpeg", createdAt: "01.10.2026, 10:00", downloadUrl: `/photo/${id}`, fileName: `${id}.jpg`, sizeBytes: 1200 };
}
