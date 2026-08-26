"use client";

import { useRef, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  glare?: boolean;
  style?: CSSProperties;
};

export default function TiltCard({ children, className = "", maxTilt = 6, glare = true, style }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState("perspective(1100px) rotateX(0deg) rotateY(0deg)");
  const [gl, setGl] = useState({ x: 50, y: 50, o: 0 });

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTf(
      `perspective(1100px) rotateX(${((0.5 - py) * maxTilt * 2).toFixed(2)}deg) rotateY(${(
        (px - 0.5) *
        maxTilt *
        2
      ).toFixed(2)}deg)`
    );
    setGl({ x: px * 100, y: py * 100, o: 1 });
  };

  const onLeave = () => {
    setTf("perspective(1100px) rotateX(0deg) rotateY(0deg)");
    setGl((g) => ({ ...g, o: 0 }));
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`relative transition-transform duration-200 ease-out will-change-transform ${className}`}
      style={{ transformStyle: "preserve-3d", transform: tf, ...style }}
    >
      <div className="h-full" style={{ transform: "translateZ(22px)", transformStyle: "preserve-3d" }}>
        {children}
      </div>
      {glare && (
        <div
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
          style={{
            opacity: gl.o * 0.13,
            background: `radial-gradient(circle at ${gl.x}% ${gl.y}%, #ffffff, transparent 55%)`,
          }}
        />
      )}
    </div>
  );
}
