"use client";

import { useEffect, useRef } from "react";
import { canonical, EDGES, LANDMARKS } from "@/lib/face/canonical";

const ACCENT = "168, 211, 242";

/** The canonical face mesh, turning slowly, with a few of the report's measurement lines. */
export function HeroMesh({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = (time: number) => {
      const t = time / 1000;
      const yaw = still ? 0.32 : Math.sin(t * 0.32) * 0.52;
      const pitch = still ? -0.05 : Math.sin(t * 0.21) * 0.07 - 0.03;
      const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
      const scale = Math.min(width, height) / 21;
      const project = (v: readonly number[]) => {
        const x = cy * v[0]! + sy * v[2]!;
        const z0 = -sy * v[0]! + cy * v[2]!;
        const y = cp * v[1]! - sp * z0;
        const z = sp * v[1]! + cp * z0;
        const depth = 1 + z * 0.012;
        return [width / 2 + x * scale * depth, height / 2 - (y + 0.4) * scale * depth, z] as const;
      };
      const points = canonical.vertices.map(project);
      context.clearRect(0, 0, width, height);

      context.lineWidth = 1;
      for (const [a, b] of EDGES) {
        const pa = points[a]!;
        const pb = points[b]!;
        const depth = (pa[2] + pb[2]) / 2;
        const alpha = Math.max(0.03, Math.min(0.42, 0.1 + (depth + 2) * 0.03));
        context.strokeStyle = `rgba(${ACCENT}, ${alpha})`;
        context.beginPath();
        context.moveTo(pa[0], pa[1]);
        context.lineTo(pb[0], pb[1]);
        context.stroke();
      }
      for (const p of points) {
        const alpha = Math.max(0.12, Math.min(0.85, 0.25 + (p[2] + 2) * 0.06));
        context.fillStyle = `rgba(${ACCENT}, ${alpha})`;
        context.fillRect(p[0] - 0.8, p[1] - 0.8, 1.6, 1.6);
      }

      // Measurement overlays: the two thirds lines and the canthal segments.
      const line = (a: number, b: number, alpha: number) => {
        context.strokeStyle = `rgba(219, 238, 251, ${alpha})`;
        context.lineWidth = 1.25;
        context.beginPath();
        context.moveTo(points[a]![0], points[a]![1]);
        context.lineTo(points[b]![0], points[b]![1]);
        context.stroke();
      };
      const pulse = still ? 0.8 : 0.55 + 0.35 * Math.sin(t * 1.3);
      line(LANDMARKS.exocanthion_r, LANDMARKS.endocanthion_r, pulse);
      line(LANDMARKS.endocanthion_l, LANDMARKS.exocanthion_l, pulse);
      line(LANDMARKS.endocanthion_r, LANDMARKS.endocanthion_l, pulse * 0.6);
      line(LANDMARKS.glabella, LANDMARKS.subnasale, pulse * 0.7);
      line(LANDMARKS.subnasale, LANDMARKS.menton, pulse * 0.7);
      line(LANDMARKS.cheilion_r, LANDMARKS.cheilion_l, pulse * 0.6);
      line(LANDMARKS.gonion_r, LANDMARKS.gonion_l, pulse * 0.35);
      for (const index of Object.values(LANDMARKS)) {
        const p = points[index]!;
        context.fillStyle = "rgba(238, 247, 253, 0.95)";
        context.beginPath();
        context.arc(p[0], p[1], 2.1, 0, Math.PI * 2);
        context.fill();
      }
      if (!still) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={className}
      role="img"
      aria-label="A wireframe face mesh with measurement lines"
    />
  );
}
