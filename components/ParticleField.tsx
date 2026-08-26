"use client";

import { useEffect, useRef } from "react";

export default function ParticleField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * DPR;
      canvas.height = h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const N = 110;
    const pts = Array.from({ length: N }, () => ({
      x: (Math.random() - 0.5) * 1700,
      y: (Math.random() - 0.5) * 1000,
      z: (Math.random() - 0.5) * 900,
    }));

    const rotY = 0.00035;
    const fov = 700;
    let t = 0;

    const render = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);
      const cos = Math.cos(t * rotY);
      const sin = Math.sin(t * rotY);
      const cx = w / 2;
      const cy = h / 2;

      for (const p of pts) {
        const x = p.x * cos - p.z * sin;
        const z = p.x * sin + p.z * cos;
        const y = p.y + Math.sin(t * 0.008 + p.x * 0.01) * 40;
        const s = fov / (fov + z + 600);
        const sx = cx + x * s;
        const sy = cy + y * s;
        const alpha = Math.max(0, Math.min(1, (z + 600) / 1200)) * 0.5;
        const size = Math.max(0.5, 1.9 * s);
        const hue = 258 + (z / 1600) * 55;

        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 90%, 72%, ${alpha})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-70" />;
}
