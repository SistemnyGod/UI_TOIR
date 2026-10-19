import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

export type RingSegment = { value: number; color: string };

/**
 * Progress ring or donut drawn as SVG arcs from 12 o'clock, clockwise.
 * Segments follow each other; a small gap separates them when there are several.
 */
export function RingChart({ size, stroke, track, segments, total, children }: {
  size: number;
  stroke: number;
  track: string;
  segments: RingSegment[];
  /** Defaults to the sum of segment values. */
  total?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const visible = segments.filter(segment => segment.value > 0);
  const sum = total ?? visible.reduce((acc, segment) => acc + segment.value, 0);
  const gap = visible.length > 1 ? Math.min(stroke * 0.9, circumference * 0.02) : 0;
  let offset = 0;
  const arcs = sum > 0 ? visible.map((segment, index) => {
    const share = Math.min(1, segment.value / sum);
    const length = Math.max(0, share * circumference - gap);
    const arc = { key: index, color: segment.color, length, offset };
    offset += share * circumference;
    return arc;
  }) : [];
  return <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", left: 0, top: 0, transform: [{ rotate: "-90deg" }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      {arcs.map(arc => {
        // Round caps add half a stroke at each end, so the dash is shortened to keep the arc's true extent.
        const round = arc.length > stroke && arc.length < circumference - stroke;
        const dash = round ? arc.length - stroke : arc.length;
        return <Circle key={arc.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={arc.color} strokeWidth={stroke}
          strokeLinecap={round ? "round" : "butt"} strokeDasharray={`${dash} ${circumference}`} strokeDashoffset={-(arc.offset + (round ? stroke / 2 : 0))} />;
      })}
    </Svg>
    {children}
  </View>;
}
