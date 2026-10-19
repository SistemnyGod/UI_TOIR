import React from "react";
import { vi } from "vitest";

// Gradients and vector shapes are native views; UI tests render them as named host elements.
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));

vi.mock("react-native-svg", () => {
  const host = (name: string) => (props: { children?: React.ReactNode }) => React.createElement(name, null, props.children);
  const Svg = host("Svg");
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Circle: host("SvgCircle"),
    Defs: host("SvgDefs"),
    Ellipse: host("SvgEllipse"),
    G: host("SvgG"),
    LinearGradient: host("SvgLinearGradient"),
    Path: host("SvgPath"),
    Rect: host("SvgRect"),
    Stop: host("SvgStop")
  };
});

// The scan-card "matrix" backdrop is a native-driven loop; scan tests only check texts and labels.
// Its own behaviour is covered by tests/scanMatrix.vitest.test.ts, which unmocks it.
vi.mock("@/features/patrol/ScanMatrix", () => ({
  ScanMatrix: () => null,
  ScanTerminalLine: (props: { text: string }) => React.createElement("Text", null, props.text)
}));
