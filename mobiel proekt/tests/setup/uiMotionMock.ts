import React from "react";
import { vi } from "vitest";

// Entrance animations need the native Reanimated runtime; UI tests only check structure and text.
vi.mock("@/ui/motion", () => ({
  Rise: (props: { children?: React.ReactNode }) => React.createElement("Rise", null, props.children),
  Fade: (props: { children?: React.ReactNode }) => React.createElement("Fade", null, props.children)
}));
