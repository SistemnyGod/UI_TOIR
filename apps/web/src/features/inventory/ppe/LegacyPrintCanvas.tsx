import { useLayoutEffect, useRef, useState } from "react";
import { PrintPaper } from "./ppePrint";
import type { PrintData, PrintMode } from "./ppeTypes";

/** Keep paper geometry independent of screen width; only the viewing scale changes. */
export function LegacyPrintCanvas({ data, mode, fit }: { data: PrintData; mode: PrintMode; fit: boolean }) {
  const canvas = useRef<HTMLDivElement>(null), paper = useRef<HTMLDivElement>(null);
  const width = mode === "card" ? 794 : 1123;
  const [size, setSize] = useState({ scale: 1, height: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      if (!canvas.current || !paper.current) return;
      const scale = fit ? Math.min(1, Math.max(1, canvas.current.clientWidth - 24) / width) : 1;
      const height = paper.current.offsetHeight;
      setSize(previous => previous.scale === scale && previous.height === height ? previous : { scale, height });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    if (canvas.current) observer?.observe(canvas.current);
    if (paper.current) observer?.observe(paper.current);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [data, mode, fit, width]);
  return <div className="ppe-legacy-print-canvas" ref={canvas} role="region" aria-label="Печатный лист" tabIndex={0}>
    <div className="ppe-legacy-print-frame" style={{ width: width * size.scale, height: size.height * size.scale }}>
      <div className="ppe-legacy-print-stage" ref={paper} style={{ width, transform: `scale(${size.scale})` }}><PrintPaper data={data} mode={mode} /></div>
    </div>
  </div>;
}
