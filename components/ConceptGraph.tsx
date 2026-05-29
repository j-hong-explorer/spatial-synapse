"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import type { Concept } from "@/lib/concepts";
import { ModeTabs } from "./ModeTabs";
import { SiteFooter } from "./SiteFooter";

// ForceGraph3D uses WebGL + Three.js → must be client-only (no SSR)
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-[0.3em] text-muted">
      Loading graph…
    </div>
  ),
});

type GNode = {
  id: string;
  title: string;
  tags: string[];
  image: string;
  // populated by force-graph after simulation
  x?: number;
  y?: number;
  z?: number;
};

type GLink = {
  source: string | GNode;
  target: string | GNode;
  value: number;
  tags: string[];
};

function buildGraphData(concepts: Concept[]): { nodes: GNode[]; links: GLink[] } {
  const nodes: GNode[] = concepts.map((c) => ({
    id: c.slug,
    title: c.title,
    tags: c.tags,
    image: c.images[0].src,
  }));

  const links: GLink[] = [];
  for (let i = 0; i < concepts.length; i++) {
    for (let j = i + 1; j < concepts.length; j++) {
      const a = concepts[i];
      const b = concepts[j];
      const shared = a.tags.filter((t) => b.tags.includes(t));
      if (shared.length >= 2) {
        links.push({
          source: a.slug,
          target: b.slug,
          value: shared.length,
          tags: shared,
        });
      }
    }
  }
  return { nodes, links };
}

export function ConceptGraph({ concepts }: { concepts: Concept[] }) {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [selectedNode, setSelectedNode] = useState<GNode | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [isTransitioning, setIsTransitioning] = useState(false);

  const graphData = useMemo(() => buildGraphData(concepts), [concepts]);

  // Stable refs that custom three objects can read each frame without rerendering React
  const selectedIdRef = useRef<string | null>(null);
  const connectedIdsRef = useRef<Set<string>>(new Set());
  const spriteCache = useRef<Map<string, THREE.Sprite>>(new Map());
  const circularTextureCache = useRef<Map<string, THREE.CanvasTexture>>(new Map());
  const linkObjectCache = useRef<Map<string, THREE.Object3D>>(new Map());
  // Saved when the graph first settles, used to restore the wide view when the
  // user taps empty space.
  const initialCameraRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  // Track viewport
  useEffect(() => {
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Set up smooth OrbitControls once graph mounts + capture initial wide view
  useEffect(() => {
    const id = setInterval(() => {
      if (!fgRef.current?.controls) return;
      const controls = fgRef.current.controls();
      if (!controls) return;
      controls.enableDamping = true;
      controls.dampingFactor = 0.15;
      controls.rotateSpeed = 1.8;   // bumped up — touch drag was sluggish
      controls.zoomSpeed = 1.0;
      controls.panSpeed = 0.8;
      clearInterval(id);
      // After a beat (so the entry orbit has chosen a nice angle), snapshot
      // the camera pose so we can return to it later.
      setTimeout(() => {
        const cam = fgRef.current?.camera?.();
        const c = fgRef.current?.controls?.();
        if (cam && c) {
          initialCameraRef.current = {
            pos: cam.position.clone(),
            target: c.target.clone(),
          };
        }
      }, 1500);
    }, 100);
    return () => clearInterval(id);
  }, []);

  // Position camera close enough that nodes fill the view, then gentle orbit until user interacts
  useEffect(() => {
    let stopped = false;
    let raf = 0;
    const distance = 220;

    // Poll for graph to be ready, then snap camera close + start orbit
    const setup = setInterval(() => {
      const fg = fgRef.current;
      if (stopped || !fg?.cameraPosition) return;
      clearInterval(setup);

      // Snap camera to closer initial position so graph fills viewport
      fg.cameraPosition({ x: 0, y: 30, z: distance }, { x: 0, y: 0, z: 0 }, 0);

      // After a short pause, begin slow orbit
      const orbitStart = setTimeout(() => {
        if (stopped) return;
        let angle = 0;
        const orbit = () => {
          if (stopped) return;
          angle += 0.0006;
          fg.cameraPosition({
            x: distance * Math.sin(angle),
            z: distance * Math.cos(angle),
            y: 30 + 25 * Math.sin(angle * 0.5),
          });
          raf = requestAnimationFrame(orbit);
        };
        raf = requestAnimationFrame(orbit);
      }, 800);

      // Stop orbit on user interaction — but ignore the first ~1.5s of events
      // because mobile browsers often fire a synthetic touchstart on page entry,
      // which would otherwise kill the orbit immediately.
      const grace = Date.now() + 1500;
      const stop = (e: Event) => {
        if (Date.now() < grace) return;
        // Only react to events that actually came from the user, on the canvas
        // area. Synthetic events from iOS sometimes have no isTrusted.
        if (!e.isTrusted) return;
        stopped = true;
        clearTimeout(orbitStart);
        cancelAnimationFrame(raf);
        window.removeEventListener("pointerdown", stop);
        window.removeEventListener("wheel", stop);
        window.removeEventListener("touchstart", stop);
      };
      window.addEventListener("pointerdown", stop);
      window.addEventListener("wheel", stop);
      window.addEventListener("touchstart", stop);
    }, 120);

    return () => {
      stopped = true;
      clearInterval(setup);
      cancelAnimationFrame(raf);
    };
  }, [graphData]);

  // Preload images into circular CanvasTextures (image clipped inside a circle).
  // Async — sprites that mount before the texture is ready start blank, then
  // have their map swapped in once the texture finishes building.
  useEffect(() => {
    concepts.forEach((c) => {
      const url = c.images[0].src;
      if (circularTextureCache.current.has(url)) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const size = 384;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // (1) Clip to circle and draw cover-fit image
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

        // (2) Top-light wash — gives a sense of "lit from above"
        const litGrad = ctx.createLinearGradient(0, 0, 0, size);
        litGrad.addColorStop(0, "rgba(255,255,255,0.16)");
        litGrad.addColorStop(0.5, "rgba(255,255,255,0.02)");
        litGrad.addColorStop(1, "rgba(0,0,0,0.18)");
        ctx.fillStyle = litGrad;
        ctx.fillRect(0, 0, size, size);

        // (3) Edge vignette — sphere-like rim shadow (gentler now; edge fade handles dissolve)
        const vignette = ctx.createRadialGradient(
          size / 2, size / 2, size * 0.28,
          size / 2, size / 2, size / 2
        );
        vignette.addColorStop(0, "rgba(0,0,0,0)");
        vignette.addColorStop(0.65, "rgba(0,0,0,0.10)");
        vignette.addColorStop(1, "rgba(0,0,0,0.35)");
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, size, size);

        // (4) Soft specular halo — large, upper-left, screen-blended
        ctx.globalCompositeOperation = "screen";
        const softHi = ctx.createRadialGradient(
          size * 0.32, size * 0.27, 0,
          size * 0.32, size * 0.27, size * 0.45
        );
        softHi.addColorStop(0, "rgba(255,255,255,0.45)");
        softHi.addColorStop(0.4, "rgba(255,255,255,0.12)");
        softHi.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = softHi;
        ctx.fillRect(0, 0, size, size);

        // (5) Crisp specular spot — small bright highlight where light hits the sphere
        const crispHi = ctx.createRadialGradient(
          size * 0.30, size * 0.21, 0,
          size * 0.30, size * 0.21, size * 0.11
        );
        crispHi.addColorStop(0, "rgba(255,255,255,0.95)");
        crispHi.addColorStop(0.45, "rgba(255,255,255,0.25)");
        crispHi.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = crispHi;
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = "source-over";

        // (6) Edge fade — blends sphere into the page background (#0a0a0a)
        //     Color goes to bg near rim; pixel alpha stays high so alphaTest still
        //     writes depth and keeps link capsules occluded behind the sphere.
        const edgeFade = ctx.createRadialGradient(
          size / 2, size / 2, size * 0.40,
          size / 2, size / 2, size / 2 - 1
        );
        edgeFade.addColorStop(0,    "rgba(10,10,10,0.00)");
        edgeFade.addColorStop(0.65, "rgba(10,10,10,0.20)");
        edgeFade.addColorStop(0.88, "rgba(10,10,10,0.75)");
        edgeFade.addColorStop(1,    "rgba(10,10,10,0.97)");
        ctx.fillStyle = edgeFade;
        ctx.fillRect(0, 0, size, size);

        ctx.restore();

        // Force the perimeter pixels to alpha 1 so the sphere occludes any
        // link that crosses through its on-screen area — even links that are
        // technically in front of the sphere. The soft fade is still visible
        // because (6) above paints the rim dark to match the page bg.
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(10,10,10,1)";
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        circularTextureCache.current.set(url, tex);

        // Swap into the corresponding sprite if it already exists
        const sprite = spriteCache.current.get(c.slug);
        if (sprite) {
          const mat = sprite.material as THREE.SpriteMaterial;
          mat.map = tex;
          mat.needsUpdate = true;
        }
      };
      img.src = url;
    });
  }, [concepts]);

  // Build a sprite ONCE per node, cache it. Opacity is updated via effect (no rebuild).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeThreeObject = useCallback((rawNode: any) => {
    const node = rawNode as GNode;
    let sprite = spriteCache.current.get(node.id);
    if (!sprite) {
      const texture = circularTextureCache.current.get(node.image);
      const material = new THREE.SpriteMaterial({
        map: texture, // may be undefined initially; preload effect swaps it in
        transparent: true,
        opacity: 1,
        // Very low alphaTest so nearly every pixel inside the disc is opaque
        // and writes depth — combined with the rim-alpha boost in the texture,
        // this means links are fully hidden anywhere the sphere covers them
        // on screen, regardless of depth ordering.
        alphaTest: 0.05,
        depthWrite: true,
        depthTest: true,
      });
      sprite = new THREE.Sprite(material);
      const baseSize = 18;
      const sizeVal = baseSize + (node.tags?.length ?? 0) * 0.8;
      sprite.scale.set(sizeVal, sizeVal, 1);
      sprite.userData.baseScale = sizeVal; // remember natural size for selection scaling
      sprite.renderOrder = 2; // Draw spheres above link capsules
      spriteCache.current.set(node.id, sprite);
    }
    return sprite;
  }, []);

  // Custom edge: open-ended cylinder + two endpoint spheres sharing one material.
  // Only the cylinder is Y-scaled; sphere endpoints stay perfectly round at constant
  // thickness no matter how long the link is.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkThreeObject = useCallback((rawLink: any) => {
    const link = rawLink as GLink;
    const src = typeof link.source === "object" ? link.source.id : link.source;
    const tgt = typeof link.target === "object" ? link.target.id : link.target;
    const key = `${src}|${tgt}`;
    let group = linkObjectCache.current.get(key);
    if (!group) {
      const radius = 0.20;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.10,
        depthWrite: false,
        depthTest: true,
      });
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 1, 16, 1, true), // openEnded
        mat
      );
      const sphereStart = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12),
        mat
      );
      const sphereEnd = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12),
        mat
      );
      cyl.renderOrder = 0;
      sphereStart.renderOrder = 0;
      sphereEnd.renderOrder = 0;
      const g = new THREE.Group();
      g.add(cyl);
      g.add(sphereStart);
      g.add(sphereEnd);
      g.userData = { cyl, sphereStart, sphereEnd, mat };
      linkObjectCache.current.set(key, g);
      group = g;
    }
    return group;
  }, []);

  // Per-frame: position the cylinder + endpoint spheres of each link.
  // Endpoints are pulled inward by each node's radius so the cylinder stops
  // at the sphere edge (no spikes inside nodes).
  const linkPositionUpdate = useCallback(
    (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      obj: any,
      { start, end }: { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      link: any
    ) => {
      const group = obj as THREE.Group;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { cyl, sphereStart, sphereEnd } = group.userData as any;

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dz = end.z - start.z;
      const fullLen = Math.hypot(dx, dy, dz);

      if (fullLen < 0.001) {
        group.visible = false;
        return true;
      }

      const srcId = typeof link.source === "object" ? link.source.id : link.source;
      const tgtId = typeof link.target === "object" ? link.target.id : link.target;
      const srcSprite = spriteCache.current.get(srcId);
      const tgtSprite = spriteCache.current.get(tgtId);
      const inset = 0.7;
      const srcRadius = (srcSprite ? srcSprite.scale.x / 2 : 11) - inset;
      const tgtRadius = (tgtSprite ? tgtSprite.scale.x / 2 : 11) - inset;

      const trimLen = fullLen - srcRadius - tgtRadius;
      if (trimLen < 0.5) {
        group.visible = false;
        return true;
      }
      group.visible = true;

      const ux = dx / fullLen;
      const uy = dy / fullLen;
      const uz = dz / fullLen;

      const sx = start.x + ux * srcRadius;
      const sy = start.y + uy * srcRadius;
      const sz = start.z + uz * srcRadius;
      const ex = end.x - ux * tgtRadius;
      const ey = end.y - uy * tgtRadius;
      const ez = end.z - uz * tgtRadius;

      // Keep group at origin so child world-coords match the values we set.
      group.position.set(0, 0, 0);
      group.quaternion.identity();
      group.scale.set(1, 1, 1);

      // Cylinder — midpoint, oriented along the link, scaled in Y to trim length
      cyl.position.set((sx + ex) / 2, (sy + ey) / 2, (sz + ez) / 2);
      cyl.scale.set(1, trimLen, 1);
      cyl.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(ux, uy, uz)
      );

      // Spheres — fixed radius, sit exactly at the trimmed endpoints
      sphereStart.position.set(sx, sy, sz);
      sphereEnd.position.set(ex, ey, ez);
      return true;
    },
    []
  );

  // Update link material opacity/color when selection changes (cyl + 2 spheres share one material)
  useEffect(() => {
    linkObjectCache.current.forEach((group, key) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mat = (group as THREE.Group).userData.mat as THREE.MeshBasicMaterial;
      if (!mat) return;
      const [src, tgt] = key.split("|");
      const sel = selectedNode?.id;
      mat.color.setHex(0xffffff);
      if (!sel) {
        mat.opacity = 0.35;                                  // default — clearly visible
      } else if (src === sel || tgt === sel) {
        mat.opacity = 0.8;                                   // selected connections — bright but softened
      } else {
        mat.opacity = 0.05;                                  // unrelated — faded
      }
      mat.needsUpdate = true;
    });
  }, [selectedNode]);

  // Update sprite opacity + scale + draw-order when selection changes.
  // Selected sphere also disables depthTest so it can never be occluded by
  // another sphere that happens to be closer to the camera.
  useEffect(() => {
    spriteCache.current.forEach((sprite, id) => {
      const mat = sprite.material as THREE.SpriteMaterial;
      const base: number = (sprite.userData.baseScale as number) ?? sprite.scale.x;

      let opacity = 1;
      let scaleMult = 1;
      let isSelected = false;
      if (selectedNode) {
        if (id === selectedNode.id) {
          opacity = 1;
          scaleMult = 1.4;
          isSelected = true;
        } else if (connectedIdsRef.current.has(id)) {
          opacity = 0.9;
          scaleMult = 0.95;
        } else {
          opacity = 0.25;
          scaleMult = 0.8;
        }
      }
      mat.opacity = opacity;
      // Selected sphere wins over everything else, always on top.
      mat.depthTest = !isSelected;
      mat.needsUpdate = true;
      sprite.renderOrder = isSelected ? 100 : 2;
      sprite.scale.set(base * scaleMult, base * scaleMult, 1);
    });
  }, [selectedNode]);

  // First click selects (shows info). Second click on the SAME node navigates.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeClick = useCallback((rawNode: any) => {
    const node = rawNode as GNode;
    if (isTransitioning) return;

    if (selectedIdRef.current === node.id) {
      // Second click — navigate to detail with smooth camera zoom
      setIsTransitioning(true);
      const fg = fgRef.current;
      if (!fg) {
        router.push(`/c/${node.id}`);
        return;
      }
      const distance = 60;
      const dist = Math.hypot(node.x ?? 0, node.y ?? 0, node.z ?? 0) || 1;
      const ratio = 1 + distance / dist;
      fg.cameraPosition(
        { x: (node.x ?? 0) * ratio, y: (node.y ?? 0) * ratio, z: (node.z ?? 0) * ratio },
        { x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 },
        1100
      );
      window.setTimeout(() => router.push(`/c/${node.id}`), 1050);
      return;
    }

    // First click — select this node, compute its connection set
    selectedIdRef.current = node.id;
    const connected = new Set<string>();
    graphData.links.forEach((l) => {
      const src = typeof l.source === "object" ? l.source.id : l.source;
      const tgt = typeof l.target === "object" ? l.target.id : l.target;
      if (src === node.id) connected.add(tgt);
      else if (tgt === node.id) connected.add(src);
    });
    connectedIdsRef.current = connected;
    setSelectedNode(node);

    // Move the camera close to the selected node AND aim it left of the node
    // (in screen space) so the node lands on the RIGHT half of the viewport,
    // clear of the info panel.
    //
    // The "left in screen space" direction is the negative of the camera's
    // world-right vector, which we extract straight from the camera's matrix
    // to avoid orientation surprises.
    const fg = fgRef.current;
    const controls = fg?.controls?.();
    const cam = fg?.camera?.();
    if (
      fg?.cameraPosition && cam && controls &&
      node.x !== undefined && node.y !== undefined && node.z !== undefined
    ) {
      const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
      const camDistance = isMobile ? 65 : 85;
      // Shift the look-at point so the node lands UPPER-RIGHT of center,
      // leaving room for the info panel on the left and the horizontal
      // connection scroll along the bottom.
      const lookOffsetX = isMobile ? 10 : 8;   // node moves right
      const lookOffsetY = isMobile ? 14 : 9;   // node moves up

      cam.updateMatrixWorld();
      const camRight = new THREE.Vector3();
      const camUp = new THREE.Vector3();
      const camBack = new THREE.Vector3();
      cam.matrixWorld.extractBasis(camRight, camUp, camBack);
      camRight.normalize();
      camUp.normalize();

      // Preserve the user's current viewing direction; just slide the camera
      // along it until it's `camDistance` outside the node.
      const currentDir = new THREE.Vector3()
        .subVectors(cam.position, controls.target)
        .normalize();
      const nodeVec = new THREE.Vector3(node.x, node.y, node.z);
      const newCamPos = nodeVec.clone().add(currentDir.clone().multiplyScalar(camDistance));

      // Pull look-at LEFT and DOWN in screen space → node ends up upper-right.
      const newTarget = nodeVec.clone()
        .sub(camRight.multiplyScalar(lookOffsetX))
        .sub(camUp.multiplyScalar(lookOffsetY));

      fg.cameraPosition(
        { x: newCamPos.x, y: newCamPos.y, z: newCamPos.z },
        { x: newTarget.x, y: newTarget.y, z: newTarget.z },
        900
      );
    }
  }, [graphData.links, router, isTransitioning]);

  // Click on empty space clears selection AND zooms back further than the entry
  // view so the whole graph gets some breathing room.
  const handleBackgroundClick = useCallback(() => {
    if (isTransitioning) return;
    selectedIdRef.current = null;
    connectedIdsRef.current = new Set();
    setSelectedNode(null);

    const fg = fgRef.current;
    const init = initialCameraRef.current;
    if (fg?.cameraPosition && init) {
      // Push the camera ~1.6x its initial distance from the target so the
      // graph reads as a whole again rather than the close entry view.
      const ZOOM_OUT_FACTOR = 3;
      const dirFromTarget = init.pos.clone().sub(init.target).normalize();
      const initDist = init.pos.distanceTo(init.target);
      const newPos = init.target.clone().add(
        dirFromTarget.multiplyScalar(initDist * ZOOM_OUT_FACTOR)
      );
      fg.cameraPosition(
        { x: newPos.x, y: newPos.y, z: newPos.z },
        { x: init.target.x, y: init.target.y, z: init.target.z },
        900
      );
    }
  }, [isTransitioning]);

  // Connection list for selected node
  const connections = useMemo(() => {
    if (!selectedNode) return [];
    const nodeById = new Map(graphData.nodes.map((n) => [n.id, n]));
    return graphData.links
      .filter((l) => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        return s === selectedNode.id || t === selectedNode.id;
      })
      .map((l) => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        const otherId = s === selectedNode.id ? t : s;
        const other = nodeById.get(otherId);
        return { other, shared: l.tags };
      })
      .filter((c) => c.other)
      .sort((a, b) => b.shared.length - a.shared.length);
  }, [selectedNode, graphData.nodes, graphData.links]);

  return (
    <main className="relative w-full h-[100svh] overflow-hidden bg-bg">
      {/* Top nav */}
      <header className="absolute top-0 left-0 right-0 px-5 md:px-10 pt-5 md:pt-6 z-30 pointer-events-none">
        <div className="flex flex-col items-center text-center md:items-start md:text-left md:flex-row md:justify-between gap-5 md:gap-0">
          <div className="pointer-events-auto">
            <div className="font-light text-accent/90 tracking-tight leading-none text-[36px] md:text-[39px]">
              Spatial Synapse
            </div>
            <p className="mt-3 text-[10px] md:text-[11px] text-muted/60 leading-snug max-w-[290px] md:max-w-md break-keep mx-auto md:mx-0">
              AI로 정리하는 내 머릿속 공간 아이디어 아카이브
            </p>
          </div>
          <ModeTabs />
        </div>
      </header>

      {/* Bottom-right counter — desktop only so it doesn't collide on mobile */}
      <div className="hidden md:block absolute bottom-10 right-10 z-20 pointer-events-none text-xs uppercase tracking-[0.3em] text-muted/70 tabular">
        {graphData.nodes.length} concepts · {graphData.links.length} edges
      </div>

      {/* Centred footer: hint + email/instagram + visit counter */}
      <SiteFooter hint="Drag · Pinch · Tap" />

      {/* Selection info — left/top-ish card with an explicit Open button */}
      {selectedNode && (
        <div
          className="absolute top-[30%] md:top-[38%] -translate-y-1/2 left-6 md:left-10 z-20 max-w-[280px] md:max-w-[340px] transition-opacity duration-300"
          style={{ opacity: isTransitioning ? 0 : 1, pointerEvents: isTransitioning ? "none" : "auto" }}
        >
          <p className="text-2xl md:text-3xl font-light text-accent leading-tight mb-3 break-keep">
            {selectedNode.title}
          </p>
          <div className="text-[10px] md:text-[11px] uppercase tracking-[0.2em] text-muted tabular mb-4">
            {selectedNode.tags.join("  ·  ")}
          </div>
          <button
            type="button"
            // Selecting again with the same id triggers the navigate branch in handleNodeClick.
            onClick={() => handleNodeClick(selectedNode)}
            className="inline-flex items-center gap-2 border border-accent/30 hover:bg-accent hover:text-bg hover:border-accent rounded-full py-2.5 px-5 text-[10px] md:text-[11px] uppercase tracking-[0.25em] text-accent/90 tabular transition-colors"
          >
            Open this concept
            <span aria-hidden>→</span>
          </button>
        </div>
      )}

      {/* Connections — horizontal scroll above the footer */}
      {selectedNode && connections.length > 0 && (
        <div
          className="absolute bottom-28 md:bottom-32 left-0 right-0 z-20 transition-opacity duration-300"
          style={{ opacity: isTransitioning ? 0 : 1, pointerEvents: isTransitioning ? "none" : "auto" }}
        >
          <p className="text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-muted/70 tabular mb-3 text-center">
            Connections · {connections.length}
          </p>
          <div
            className="overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none" }}
          >
            {/* w-max + mx-auto centers when contents fit; allows horizontal scroll when they don't */}
            <div className="flex w-max mx-auto gap-5 md:gap-6 px-6">
              {connections.map(({ other }) => (
                <button
                  key={other!.id}
                  type="button"
                  onClick={() => handleNodeClick(other)}
                  className="group flex-shrink-0 flex flex-col items-center gap-2 w-[78px] md:w-[90px]"
                >
                  <div className="w-14 h-14 md:w-16 md:h-16 rounded-full overflow-hidden border border-white/10 group-hover:border-white/40 transition-colors">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={other!.image}
                      alt={other!.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <span className="text-[10px] md:text-[11px] text-accent/80 group-hover:text-accent transition-colors leading-tight text-center break-keep line-clamp-2">
                    {other!.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Graph canvas */}
      <div className="absolute inset-0 z-10">
        {size.w > 0 && (
          <ForceGraph3D
            ref={fgRef}
            width={size.w}
            height={size.h}
            graphData={graphData}
            backgroundColor="#0a0a0a"
            showNavInfo={false}
            nodeThreeObject={nodeThreeObject}
            nodeThreeObjectExtend={false}
            linkThreeObject={linkThreeObject}
            linkThreeObjectExtend={false}
            linkPositionUpdate={linkPositionUpdate}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            enableNodeDrag={false}
            cooldownTicks={80}
            warmupTicks={50}
          />
        )}
      </div>

      {/* Click-transition vignette overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-25 bg-bg transition-opacity duration-700"
        style={{ opacity: isTransitioning ? 1 : 0 }}
      />
    </main>
  );
}
