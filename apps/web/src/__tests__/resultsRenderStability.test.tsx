import React, { Profiler } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ResultsWorkspace } from "../features/patrol/results/ResultsWorkspace";

class RenderLimit extends React.Component<React.PropsWithChildren, { stopped: boolean }> {
  state = { stopped: false };
  static getDerivedStateFromError() { return { stopped: true }; }
  render() { return this.state.stopped ? <span>render limit</span> : this.props.children; }
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(["api", "mock"] as const)("settles without user interaction in %s mode", async (mode) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    items: [], page: 1, pageSize: 100, total: 0, totalPages: 0, hasNext: false,
  }), { headers: { "Content-Type": "application/json" } })));
  vi.spyOn(console, "error").mockImplementation(() => {});
  let commits = 0;
  const view = render(<RenderLimit><Profiler id="results" onRender={() => {
    if (++commits > 30) throw new Error("Runaway render");
  }}><ResultsWorkspace dataSourceMode={mode} /></Profiler></RenderLimit>);
  await waitFor(() => expect(view.queryByText("render limit")).toBeNull());
  expect(commits).toBeLessThan(30);
});
