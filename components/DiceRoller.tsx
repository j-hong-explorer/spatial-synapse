"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ModeTabs } from "./ModeTabs";
import { ViewTransition } from "react";
import type { Concept } from "@/lib/concepts";

type Phase = "idle" | "throwing" | "settled" | "zooming";

// Rotation that brings each face to camera-front (used as throw end-state)
const FACE_RESTING: Array<{ x: number; y: number }> = [
  { x: 0, y: 0 },      // face 0 — front
  { x: 0, y: -90 },    // face 1 — right
  { x: 0, y: 180 },    // face 2 — back
  { x: 0, y: 90 },     // face 3 — left
  { x: -90, y: 0 },    // face 4 — top
  { x: 90, y: 0 },     // face 5 — bottom
];

const CUBE_SIZE = 240;

export function DiceRoller({ concepts }: { concepts: Concept[] }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  // Deterministic initial faces so SSR + client match. Shuffled on first mount.
  const [faces, setFaces] = useState<Concept[]>(() => concepts.slice(0, 6));
  const [resultFace, setResultFace] = useState(0);
  const [rotation, setRotation] = useState({ x: -22, y: 28 });
  const [endRotation, setEndRotation] = useState({ x: 0, y: 0 });

  // Debug instrumentation (visible on screen). Helps diagnose mobile-only issues.
  const [mounted, setMounted] = useState(false);
  const [debug, setDebug] = useState({ taps: 0, lastEvent: "—" });

  const idleRaf = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;
  const settleTimers = useRef<number[]>([]);

  // True random sample of 6 concepts, with one constraint: no overlap with
  // the previous roll. So every roll feels fresh, but each draw is still
  // uniformly random across the rest of the archive.
  const lastSixRef = useRef<Set<string>>(new Set());
  const drawSix = useCallback((): Concept[] => {
    const excluded = lastSixRef.current;
    // Pool = everything except what was just shown. If the archive is too small
    // (≤6), fall back to using all of them so the function always returns 6.
    const pool = concepts.length > 6
      ? concepts.filter((c) => !excluded.has(c.slug))
      : [...concepts];
    // Fisher-Yates on the pool, take the first 6.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const six = pool.slice(0, 6);
    lastSixRef.current = new Set(six.map((c) => c.slug));
    return six;
  }, [concepts]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    concepts.forEach((c) => router.prefetch(`/c/${c.slug}`));
    setFaces(drawSix());
  }, [router, concepts, drawSix]);

  // Idle slow drift
  useEffect(() => {
    if (phase !== "idle") return;
    const start = performance.now();
    const tick = (t: number) => {
      if (phaseRef.current !== "idle") return;
      const elapsed = (t - start) / 1000;
      setRotation({
        x: -22 + Math.sin(elapsed * 0.5) * 6,
        y: 28 + elapsed * 10,
      });
      idleRaf.current = requestAnimationFrame(tick);
    };
    idleRaf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(idleRaf.current);
  }, [phase]);

  // Cleanup timers on unmount
  useEffect(() => () => {
    settleTimers.current.forEach(clearTimeout);
  }, []);

  const roll = useCallback(() => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "settled") return;
    cancelAnimationFrame(idleRaf.current);

    const newFaces = drawSix();
    const result = Math.floor(Math.random() * 6);
    const target = FACE_RESTING[result];

    setFaces(newFaces);
    setResultFace(result);
    setEndRotation({ x: target.x, y: target.y });
    setPhase("throwing");
  }, [drawSix]);

  // Document-level fallback listener for iOS Chrome / Safari, which sometimes
  // ignores onClick on absolute-positioned buttons over 3D-transform scenes.
  useEffect(() => {
    const make = (kind: string) => (e: Event) => {
      setDebug((d) => ({ taps: d.taps + 1, lastEvent: kind }));
      if (phaseRef.current !== "idle") return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest("a")) return;
      roll();
    };
    const onClick = make("click");
    const onTouch = make("touchend");
    const onPointer = make("pointerup");
    window.addEventListener("click", onClick);
    window.addEventListener("touchend", onTouch, { passive: true });
    window.addEventListener("pointerup", onPointer);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("touchend", onTouch);
      window.removeEventListener("pointerup", onPointer);
    };
  }, [roll]);

  const onThrowAnimationEnd = () => {
    if (phaseRef.current !== "throwing") return;
    // The cube has already landed at viewport centre. Hold the result briefly
    // for recognition, then zoom straight into it and navigate.
    setPhase("settled");
    const slug = faces[resultFace].slug;
    const t1 = window.setTimeout(() => {
      setPhase("zooming");
      const t2 = window.setTimeout(() => {
        router.push(`/c/${slug}?from=dice`);
      }, 650);
      settleTimers.current.push(t2);
    }, 550);
    settleTimers.current.push(t1);
  };

  const isInteractive = phase === "idle";
  const settled = phase === "settled" || phase === "zooming";

  // Compute cube style by phase
  const cubeStyle: React.CSSProperties & Record<string, string | number> = {
    width: CUBE_SIZE,
    height: CUBE_SIZE,
    position: "relative",
    transformStyle: "preserve-3d",
    willChange: "transform",
  };

  if (phase === "idle") {
    cubeStyle.transform = `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`;
  } else if (phase === "throwing") {
    cubeStyle.animation = "diceThrow 1.7s forwards";
    cubeStyle["--start-x"] = `${rotation.x}deg`;
    cubeStyle["--start-y"] = `${rotation.y}deg`;
    cubeStyle["--end-x"] = `${endRotation.x}deg`;
    cubeStyle["--end-y"] = `${endRotation.y}deg`;
  } else if (phase === "settled") {
    // Cube is at exact viewport centre (matches animation end). Hold here.
    cubeStyle.transform = `translate3d(0, 0, 0) scale(1) rotateX(${endRotation.x}deg) rotateY(${endRotation.y}deg) rotateZ(720deg)`;
    cubeStyle.transition = "transform 0s";
    cubeStyle.opacity = 1;
  } else if (phase === "zooming") {
    // Scale straight up from centre — opens into the detail page.
    cubeStyle.transform = `translate3d(0, 0, 380px) scale(3.6) rotateX(${endRotation.x}deg) rotateY(${endRotation.y}deg) rotateZ(720deg)`;
    cubeStyle.transition = "transform 650ms cubic-bezier(0.5, 0, 0.25, 1)";
    cubeStyle.opacity = 1;
  }

  return (
    <main className="relative min-h-[100svh] w-full overflow-hidden flex flex-col bg-bg">
      <header className="px-5 md:px-10 py-4 md:py-5 z-30">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-0">
          <div>
            <div className="tabular text-[10px] md:text-xs uppercase tracking-[0.18em] md:tracking-[0.2em] text-muted">
              Spatial Synapse<span className="md:hidden"><br />by Jaehong Park</span><span className="hidden md:inline"> by Jaehong Park</span>
            </div>
            <p className="mt-1.5 text-[10px] md:text-[11px] text-muted/55 leading-snug max-w-[270px] md:max-w-md break-keep">
              AI로 정리하는 내 머릿속 공간 아이디어 아카이브
            </p>
          </div>
          <ModeTabs />
        </div>
      </header>

      {/* Stage — visual layer only. The interactive overlay below handles taps. */}
      <div
        className="flex-1 relative grid place-items-center px-6 z-10"
        style={{ pointerEvents: "none" }}
      >
        {/* Floor shadow */}
        <div
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none transition-all duration-700"
          style={{
            top: phase === "throwing" || phase === "settled" ? "calc(50% + 230px)" : "calc(50% + 50px)",
            width: phase === "throwing" || phase === "settled" ? 220 : 180,
            height: 30,
            background: "radial-gradient(ellipse, rgba(0,0,0,0.55) 0%, transparent 70%)",
            filter: "blur(4px)",
            opacity: phase === "zooming" ? 0 : phase === "idle" ? 0.45 : 0.65,
          }}
        />

        <div
          className="dice-scene"
          style={{
            perspective: "1400px",
            perspectiveOrigin: "50% 30%",
          }}
        >
          <div
            className="dice-cube"
            style={cubeStyle}
            onAnimationEnd={onThrowAnimationEnd}
          >
            {faces.map((concept, i) => (
              <DiceFace
                key={`${concept.slug}-${i}`}
                concept={concept}
                faceIndex={i}
                size={CUBE_SIZE}
                isResult={settled && i === resultFace}
              />
            ))}
          </div>
        </div>

        {/* Status caption */}
        <div className="absolute bottom-10 md:bottom-14 left-0 right-0 z-20 px-6 text-center pointer-events-none">
          {phase === "idle" && (
            <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-muted tabular animate-pulse">
              Tap anywhere to throw ↻
            </p>
          )}
          {phase === "throwing" && (
            <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-muted tabular">
              Throwing…
            </p>
          )}
          {settled && (
            <div className="space-y-1 transition-opacity duration-500">
              <p className="text-xl md:text-2xl font-light text-accent">
                {faces[resultFace].title}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Interactive overlay — a real <button> for reliable mobile taps (iOS Chrome/Safari) */}
      {isInteractive && (
        <button
          type="button"
          onClick={roll}
          aria-label="Throw the dice"
          className="absolute inset-0 z-20 cursor-pointer focus-visible:outline-2 focus-visible:outline-accent/40 focus-visible:outline-offset-[-8px] rounded-none"
          style={{
            background: "transparent",
            border: 0,
            padding: 0,
            margin: 0,
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
            WebkitAppearance: "none",
          }}
        />
      )}

      {/* Background ambience — render only after mount to avoid any hydration mismatch */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {mounted && (
          <div className="absolute -inset-20 blur-3xl opacity-[0.06]">
            {concepts.slice(0, 4).map((c, i) => (
              <div
                key={c.slug}
                className="absolute"
                style={{
                  width: "40vw",
                  height: "40vw",
                  top: ["10%", "60%", "20%", "70%"][i],
                  left: ["10%", "60%", "70%", "20%"][i],
                }}
              >
                <div className="relative w-full h-full">
                  <Image
                    src={c.images[0].src}
                    alt=""
                    fill
                    sizes="40vw"
                    className="object-cover rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="absolute inset-0 bg-bg/60" />
      </div>
    </main>
  );
}

// ───────────────────────────────────────────────────────────
// Glass face with concept image
// ───────────────────────────────────────────────────────────

function DiceFace({
  concept,
  faceIndex,
  size,
  isResult,
}: {
  concept: Concept;
  faceIndex: number;
  size: number;
  isResult: boolean;
}) {
  const half = size / 2;
  const transforms = [
    `translateZ(${half}px)`,
    `rotateY(90deg) translateZ(${half}px)`,
    `rotateY(180deg) translateZ(${half}px)`,
    `rotateY(-90deg) translateZ(${half}px)`,
    `rotateX(90deg) translateZ(${half}px)`,
    `rotateX(-90deg) translateZ(${half}px)`,
  ];

  const inner = (
    <>
      {/* Concept image — tinted slightly for that "through glass" feel */}
      <div className="absolute inset-0">
        <Image
          src={concept.images[0].src}
          alt={concept.title}
          fill
          priority={isResult || faceIndex === 0}
          sizes={`${size}px`}
          className="object-cover"
          style={{ filter: "saturate(0.92) brightness(0.92) contrast(1.05)" }}
        />
      </div>

      {/* Glass tint — subtle blue/white wash */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, rgba(220,235,255,0.18) 0%, rgba(255,255,255,0.04) 40%, rgba(180,200,220,0.06) 100%)",
        }}
      />

      {/* Top-left highlight — like a light hitting glass */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 22% 18%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.18) 25%, transparent 55%)",
          mixBlendMode: "screen",
        }}
      />

      {/* Diagonal gloss streak */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.35) 48%, rgba(255,255,255,0.06) 52%, transparent 65%)",
          mixBlendMode: "screen",
        }}
      />

      {/* Bottom edge shadow + soft reflection at the very bottom */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, transparent 70%, rgba(0,0,0,0.18) 100%)",
        }}
      />

      {/* Inner edge gloss */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow:
            "inset 0 1.5px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(0,0,0,0.18), inset 1.5px 0 0 rgba(255,255,255,0.18), inset -1.5px 0 0 rgba(0,0,0,0.12)",
          borderRadius: "inherit",
        }}
      />
    </>
  );

  return (
    <div
      className="dice-face"
      style={{
        position: "absolute",
        inset: 0,
        width: size,
        height: size,
        transform: transforms[faceIndex],
        backfaceVisibility: "hidden",
        borderRadius: 18,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.28)",
        background: "rgba(255,255,255,0.04)",
        boxShadow:
          "0 14px 40px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.4) inset",
      }}
    >
      {isResult ? (
        <ViewTransition name={`cover-${concept.slug}`}>
          <div className="absolute inset-0">{inner}</div>
        </ViewTransition>
      ) : (
        inner
      )}
    </div>
  );
}
