import React from "react";
import { vi } from "vitest";

// Entrance animations need the native Reanimated runtime; UI tests only check structure and text.
vi.mock("@/ui/motion", () => ({
  Rise: (props: { children?: React.ReactNode }) => React.createElement("Rise", null, props.children),
  Fade: (props: { children?: React.ReactNode }) => React.createElement("Fade", null, props.children)
}));

// The real icon font package cannot load under Node; every UI test renders icons by name only.
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
