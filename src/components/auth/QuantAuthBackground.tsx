"use client";

import React, { useEffect, useRef } from "react";

export function QuantAuthBackground({
  children,
}: {
  children: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Quant Neural Constellation Canvas Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    const pointer = { x: width / 2, y: height / 2, active: false };

    const palette = {
      node: "rgba(52, 211, 153, 0.85)",
      line: "rgba(16, 185, 129, 0.22)",
      pulse: "#38bdf8",
    };

    const nodeCount = 42;
    const nodes: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      pulsePhase: number;
    }> = [];

    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.65,
        vy: (Math.random() - 0.5) * 0.65,
        r: Math.random() * 2.4 + 1.4,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    };

    const handleMouseLeave = () => {
      pointer.active = false;
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;
        n.pulsePhase += 0.03;

        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;

        if (pointer.active) {
          const dx = pointer.x - n.x;
          const dy = pointer.y - n.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 180 && dist > 1) {
            n.x += (dx / dist) * 0.35;
            n.y += (dy / dist) * 0.35;
          }
        }

        for (let j = i + 1; j < nodes.length; j++) {
          const m = nodes[j];
          const dx = n.x - m.x;
          const dy = n.y - m.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 155) {
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(m.x, m.y);
            ctx.strokeStyle = palette.line;
            ctx.lineWidth = 1 - dist / 155;
            ctx.stroke();
          }
        }

        ctx.beginPath();
        const radius = n.r + Math.sin(n.pulsePhase) * 0.8;
        ctx.arc(n.x, n.y, Math.max(0.6, radius), 0, Math.PI * 2);
        ctx.fillStyle = palette.node;
        ctx.shadowColor = palette.pulse;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <section className="quant-login-section">
      {/* Mobile Top HUD Bar (Segmented Indicator & Live Status) */}
      <div className="quant-mobile-hud" aria-hidden="true">
        <div className="quant-hud-dashes">
          <span className="quant-hud-dash active" />
          <span className="quant-hud-dash active" />
          <span className="quant-hud-dash active" />
          <span className="quant-hud-dash" />
        </div>
        <div className="quant-hud-tag">
          <span className="quant-hud-dot" />
          <span>AGENCY OS // SECURE OPERATOR ACCESS</span>
        </div>
      </div>

      {/* 8 Falling Glass CRM Nodes */}
      <div className="quant-leaves" aria-hidden="true">
        <div className="quant-set">
          <div><span className="quant-node-shard diamond">ARR</span></div>
          <div><span className="quant-node-shard ring">98%</span></div>
          <div><span className="quant-node-shard amber">ROI</span></div>
          <div><span className="quant-node-shard">CRM</span></div>
          <div><span className="quant-node-shard diamond">SQL</span></div>
          <div><span className="quant-node-shard ring">24/7</span></div>
          <div><span className="quant-node-shard amber">KPI</span></div>
          <div><span className="quant-node-shard">MQL</span></div>
        </div>
      </div>

      {/* Quant Background (Perspective Grid + Constellation Canvas + Emerald Glow Orbs) */}
      <div className="quant-bg" aria-hidden="true">
        <div className="quant-bg-orb quant-bg-orb-1" />
        <div className="quant-bg-orb quant-bg-orb-2" />
        <div className="quant-bg-orb quant-bg-orb-3" />
        <div className="quant-bg-perspective-grid" />
        <canvas ref={canvasRef} className="quant-network-canvas" />
      </div>

      {/* 15s Traversing Revenue Telemetry Pod (Behind Glass) */}
      <div className="quant-girl" aria-hidden="true">
        <div className="quant-crm-kinetic-pod">
          <div className="quant-pod-orb-core" />
          <div className="quant-pod-metrics">
            <span className="quant-pod-tag">LIVE AGENCY PIPELINE</span>
            <div className="quant-pod-value">$4.82M ARR</div>
            <div className="quant-pod-sub">+142% Velocity • 38 Active Retainers</div>
          </div>
        </div>
      </div>

      {/* Card Content Slot */}
      {children}

      {/* Foreground Architectural Frame (z-index: 100) */}
      <div className="quant-trees" aria-hidden="true">
        <div className="quant-arch-pillar left">
          <div className="quant-pillar-telemetry">
            <span>SYS // QUANT</span>
            <span>BLUR // 15PX</span>
            <span>NODE // ACTIVE</span>
          </div>
          <div className="quant-pillar-bar" />
          <div className="quant-pillar-telemetry">
            <span>GLASS // RGBA.16</span>
            <span>SYNC // 99.98%</span>
          </div>
        </div>
        <div className="quant-arch-pillar right">
          <div className="quant-pillar-telemetry" style={{ textAlign: "right" }}>
            <span>CRM // PIPELINE</span>
            <span>NET // ENCRYPTED</span>
            <span>LATENCY // 12MS</span>
          </div>
          <div className="quant-pillar-bar" />
          <div className="quant-pillar-telemetry" style={{ textAlign: "right" }}>
            <span>PORTAL // READY</span>
            <span>REV // +142%</span>
          </div>
        </div>
      </div>
    </section>
  );
}
