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

  // Position camera farther out so the node cluster sits in the centre band
  // of the screen — clear of the title at the top and the footer at the
  // bottom. Then gentle orbit until the user interacts.
  useEffect(() => {
    let stopped = false;
    let raf = 0;
    const distance = 320;

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

        // Soft alpha fade on the very outer ring so the sphere's edge melts
        // into the background instead of cutting off as a hard circle. Link
        // occlusion is handled by the invisible mesh occluder + stencil, so
        // we no longer need a hard alpha-1 perimeter stroke here.
        const alphaFade = ctx.createRadialGradient(
          size / 2, size / 2, size * 0.46,
          size / 2, size / 2, size / 2 - 1
        );
        alphaFade.addColorStop(0, "rgba(0,0,0,0)");
        alphaFade.addColorStop(0.6, "rgba(0,0,0,0.4)");
        alphaFade.addColorStop(1, "rgba(0,0,0,1)");
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = alphaFade;
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = "source-over";

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        circularTextureCache.current.set(url, tex);

        // Swap texture into the visible sprite (occluder is invisible and
        // doesn't need a texture)
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

  // Build a Group containing two sprites per node:
  //   (1) occluder — invisible, writes stencil to mark on-screen sphere area
  //   (2) visible  — the textured circular sphere
  // Links use stencil != 1 to skip any pixel that falls inside ANY sphere on
  // screen, which is the only way to guarantee "links never show through a
  // sphere regardless of depth order".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeThreeObject = useCallback((rawNode: any) => {
    const node = rawNode as GNode;
    const cached = spriteCache.current.get(node.id);
    if (cached) {
      // We cache the visible sprite; return its parent group.
      return cached.parent ?? cached;
    }

    const texture = circularTextureCache.current.get(node.image);
    const baseSize = 18;
    const sizeVal = baseSize + (node.tags?.length ?? 0) * 0.8;

    // Visible sprite (the picture you actually see)
    const visibleMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      alphaTest: 0.05,
      depthWrite: true,
      depthTest: true,
    });
    const sprite = new THREE.Sprite(visibleMat);
    sprite.scale.set(sizeVal, sizeVal, 1);
    sprite.renderOrder = 2;

    // Invisible occluder — a REAL 3D sphere mesh (not a sprite). Sprite
    // materials seem to drop stencil writes in this renderer; a regular
    // MeshBasicMaterial sphere writes stencil reliably. The sphere's
    // on-screen silhouette is the disc we want to mask.
    const occluderRadius = sizeVal / 2;
    const occluderGeo = new THREE.SphereGeometry(occluderRadius, 20, 14);
    const occluderMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      // CRITICAL: must NOT write to depth — otherwise the sphere's front face
      // z lands in the depth buffer and hides the visible sprite (whose z is
      // the sphere CENTER, slightly farther). Stencil-only is all we need.
      depthWrite: false,
      depthTest: false,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
      stencilZFail: THREE.ReplaceStencilOp,
      stencilFail: THREE.ReplaceStencilOp,
    });
    const occluder = new THREE.Mesh(occluderGeo, occluderMat);
    occluder.renderOrder = -1; // opaque pass, drawn before transparent links

    const group = new THREE.Group();
    group.add(occluder);
    group.add(sprite);
    group.userData = { sprite, occluder, baseScale: sizeVal };
    sprite.userData.baseScale = sizeVal;

    spriteCache.current.set(node.id, sprite);
    return group;
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
      const radius = 0.10; // thinner edges
      const mat = new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.10,
        depthWrite: false,
        depthTest: true,
        // Stencil != 1 → skip every pixel that falls inside any sphere on
        // screen, regardless of depth. This is what guarantees links never
        // poke through a sphere even when they're closer to the camera.
        stencilWrite: false,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilRef: 1,
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
        mat.opacity = 0.22;                                  // default — visible but thin
      } else if (src === sel || tgt === sel) {
        mat.opacity = 0.55;                                  // selected connections — softened
      } else {
        mat.opacity = 0.015;                                 // unrelated — nearly invisible
      }
      mat.needsUpdate = true;
    });
  }, [selectedNode]);

  // Update sprite opacity + scale + draw-order when selection changes.
  // Selected sphere also disables depthTest so it can never be occluded by
  // another sphere that happens to be closer to the camera. The occluder sprite
  // (sibling under the same group) is resized in lockstep so the stencil mask
  // matches the visible sphere.
  useEffect(() => {
    spriteCache.current.forEach((sprite, id) => {
      const mat = sprite.material as THREE.SpriteMaterial;
      const base: number = (sprite.userData.baseScale as number) ?? sprite.scale.x;

      let opacity = 1;
      // Selected node is ~0.93x its natural size (2/3 of the previous 1.4x),
      // landing in the middle of the screen for clean composition.
      let scaleMult = 1;
      let isSelected = false;
      if (selectedNode) {
        if (id === selectedNode.id) {
          opacity = 1;
          scaleMult = 0.93;
          isSelected = true;
        } else if (connectedIdsRef.current.has(id)) {
          opacity = 0.75;       // visible enough to read the label underneath
          scaleMult = 0.75;
        } else {
          opacity = 0.06;
          scaleMult = 0.55;
        }
      }
      mat.opacity = opacity;
      mat.depthTest = !isSelected;
      mat.needsUpdate = true;
      sprite.renderOrder = isSelected ? 100 : 2;
      const newSize = base * scaleMult;
      sprite.scale.set(newSize, newSize, 1);

      // Keep the invisible mesh occluder in sync so the stencil mask matches.
      const parent = sprite.parent as THREE.Group | null;
      const occluder = parent?.userData?.occluder as THREE.Mesh | undefined;
      if (occluder) occluder.scale.set(scaleMult, scaleMult, scaleMult);
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
      const camDistance = isMobile ? 80 : 95;
      // Push the look-at point ABOVE the node (in screen-up direction) so the
      // sphere settles in the lower half of the screen — fully visible below
      // the title + tags + "Open this synapse" button.
      const lookOffsetUp = isMobile ? 14 : 9;

      cam.updateMatrixWorld();
      const camUp = new THREE.Vector3();
      cam.matrixWorld.extractBasis(new THREE.Vector3(), camUp, new THREE.Vector3());
      camUp.normalize();

      const currentDir = new THREE.Vector3()
        .subVectors(cam.position, controls.target)
        .normalize();
      const nodeVec = new THREE.Vector3(node.x, node.y, node.z);
      const newCamPos = nodeVec.clone().add(currentDir.clone().multiplyScalar(camDistance));

      const newTarget = nodeVec.clone().add(camUp.multiplyScalar(lookOffsetUp));

      fg.cameraPosition(
        { x: newCamPos.x, y: newCamPos.y, z: newCamPos.z },
        { x: newTarget.x, y: newTarget.y, z: newTarget.z },
        900
      );
    }
  }, [graphData.links, router, isTransitioning]);

  // Reset selection + camera to the initial wide view (same as the very first
  // entry). Used by the "Spatial Synapse" header button.
  const handleHomeReset = useCallback(() => {
    if (isTransitioning) return;
    selectedIdRef.current = null;
    connectedIdsRef.current = new Set();
    setSelectedNode(null);

    const fg = fgRef.current;
    const init = initialCameraRef.current;
    if (fg?.cameraPosition && init) {
      fg.cameraPosition(
        { x: init.pos.x, y: init.pos.y, z: init.pos.z },
        { x: init.target.x, y: init.target.y, z: init.target.z },
        900
      );
    }
  }, [isTransitioning]);

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

  // Connected node objects for floating labels (rendered above the 3D scene
  // and positioned each frame to follow their sphere on screen).
  const connectedNodes = useMemo(() => {
    if (!selectedNode) return [];
    return graphData.nodes.filter((n) => connectedIdsRef.current.has(n.id));
  }, [selectedNode, graphData.nodes]);

  const labelElsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  // Per-frame: project each connected sphere's world position to screen pixels
  // and transform its label DOM node accordingly. Stops when no selection.
  useEffect(() => {
    if (!selectedNode) return;
    let raf = 0;
    const fg = fgRef.current;
    const tmp = new THREE.Vector3();
    const tick = () => {
      const cam = fg?.camera?.();
      if (cam && size.w > 0 && size.h > 0) {
        connectedNodes.forEach((n) => {
          const sprite = spriteCache.current.get(n.id);
          const el = labelElsRef.current.get(n.id);
          if (!sprite || !el) return;
          sprite.getWorldPosition(tmp);
          // Forward distance — for behind-camera nodes
          const dot = new THREE.Vector3().subVectors(tmp, cam.position).dot(
            cam.getWorldDirection(new THREE.Vector3())
          );
          tmp.project(cam);
          const onScreen = dot > 0 && Math.abs(tmp.x) <= 1.2 && Math.abs(tmp.y) <= 1.2;
          const x = (tmp.x + 1) * size.w / 2;
          const y = (1 - tmp.y) * size.h / 2;
          // sphere radius in pixels (approx) — push label below the sphere
          const radius = sprite.scale.x * size.h / (2 * Math.tan((cam.fov * Math.PI) / 360) * Math.max(dot, 1)) * 0.5;
          el.style.transform = `translate3d(${x}px, ${y + radius + 8}px, 0) translate(-50%, 0)`;
          el.style.opacity = onScreen ? "1" : "0";
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selectedNode, connectedNodes, size]);

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
      {/* Top nav. The wrapper gets a dim backdrop ONLY when a node is selected,
          so the title/tabs stay readable over the big sphere image behind them. */}
      <header className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
        <div
          className="px-5 md:px-10 pt-5 md:pt-6 pb-3 md:pb-4 transition-colors duration-300"
          style={{
            backgroundColor: selectedNode ? "rgba(10,10,10,0.78)" : "transparent",
            backdropFilter: selectedNode ? "blur(14px)" : "none",
            WebkitBackdropFilter: selectedNode ? "blur(14px)" : "none",
          }}
        >
          <div className="flex flex-col items-center text-center md:items-start md:text-left md:flex-row md:justify-between gap-5 md:gap-0">
            <div className="pointer-events-auto">
              <button
                type="button"
                onClick={handleHomeReset}
                className="font-thin text-accent/85 hover:text-accent transition-colors leading-none text-[36px] md:text-[39px] block"
                style={{ letterSpacing: "0.02em" }}
              >
                Spatial Synapse
              </button>
              <p className="mt-3 text-[10px] md:text-[11px] text-muted/60 leading-snug max-w-[290px] md:max-w-md break-keep mx-auto md:mx-0">
                AI로 정리하는 내 머릿속 공간 아이디어 아카이브
              </p>
            </div>
            {/* Mobile-only — tabs sit under the title in the header flow */}
            <div className="md:hidden w-full">
              <ModeTabs />
            </div>
          </div>
        </div>
      </header>

      {/* Desktop-only — large centered top-of-screen tabs */}
      <div className="hidden md:flex absolute top-7 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
        <ModeTabs />
      </div>

      {/* Bottom-right counter — desktop only so it doesn't collide on mobile */}
      <div className="hidden md:block absolute bottom-10 right-10 z-20 pointer-events-none text-xs uppercase tracking-[0.3em] text-muted/70 tabular">
        {graphData.nodes.length} concepts · {graphData.links.length} edges
      </div>

      {/* Footer — always mounted so the visit counter stays visible. The
          hint + email/instagram row inside fades out when a node is selected. */}
      <SiteFooter hint="Drag · Pinch · Tap" dimmed={!!selectedNode} />

      {/* Selection info — 3 lines centered above the (now lowered) main sphere.
          Inner container has its own dim backdrop so the title stays legible
          even when the bright sphere image is right behind it. */}
      {selectedNode && (
        <div
          className="absolute top-[26%] md:top-[30%] left-0 right-0 z-20 px-4 md:px-6 flex justify-center transition-opacity duration-300"
          style={{ opacity: isTransitioning ? 0 : 1, pointerEvents: isTransitioning ? "none" : "auto" }}
        >
          <div
            className="flex flex-col items-center text-center gap-3 md:gap-4 rounded-2xl px-5 md:px-7 py-4 md:py-5 max-w-[88vw] md:max-w-[640px]"
            style={{
              backgroundColor: "rgba(10,10,10,0.78)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
            }}
          >
            <p className="text-2xl md:text-3xl font-thin text-accent leading-tight break-keep">
              {selectedNode.title}
            </p>
            <div className="text-[10px] md:text-[11px] uppercase tracking-[0.2em] text-muted tabular">
              {selectedNode.tags.join("  ·  ")}
            </div>
            <button
              type="button"
              // Selecting again with the same id triggers the navigate branch in handleNodeClick.
              onClick={() => handleNodeClick(selectedNode)}
              className="inline-flex items-center gap-2 border border-accent/40 hover:bg-accent hover:text-bg hover:border-accent rounded-full py-2.5 px-5 text-[10px] md:text-[11px] uppercase tracking-[0.25em] text-accent/90 tabular transition-colors"
            >
              Open this synapse
              <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      )}

      {/* "Connections · N" pill — dim backdrop so it reads cleanly over the
          graph behind it, matching the header / selection panel treatment. */}
      {selectedNode && connections.length > 0 && (
        <div
          className="absolute bottom-14 md:bottom-20 left-0 right-0 z-20 flex justify-center transition-opacity duration-300 pointer-events-none"
          style={{ opacity: isTransitioning ? 0 : 1 }}
        >
          <span
            className="inline-block px-4 py-1.5 rounded-full text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-muted/80 tabular"
            style={{
              backgroundColor: "rgba(10,10,10,0.78)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
            }}
          >
            Connections · {connections.length}
          </span>
        </div>
      )}

      {/* Floating title under every connected sphere — repositioned each frame */}
      {selectedNode && connectedNodes.map((n) => (
        <div
          key={n.id}
          ref={(el) => {
            if (el) labelElsRef.current.set(n.id, el);
            else labelElsRef.current.delete(n.id);
          }}
          className="absolute top-0 left-0 z-15 pointer-events-none text-[10px] md:text-[11px] text-accent/80 text-center break-keep leading-tight w-[110px] transition-opacity duration-300"
          style={{ transform: "translate3d(-9999px,-9999px,0)", opacity: 0, willChange: "transform" }}
        >
          {n.title}
        </div>
      ))}

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
