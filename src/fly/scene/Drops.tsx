import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { settleDrop } from "../drops/fns";
import { sculptFromImage, emojiMedallion } from "../drops/sculpt";
import { emojiGlyph } from "../drops/prompt";
import type { DropItem } from "../drops/types";
import { clearFly } from "./clear";
import { topologyFromImage, topologyFromParts } from "../memory/topology";
import { FLY_SIZE, MIRROR_CLEAR, PEDESTAL_H, PEDESTAL_R, sim } from "../sim";

type Body = {
  id: string;
  name: string;
  r: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  wx: number;
  wy: number;
  wz: number;
  ex: number;
  ey: number;
  ez: number;
  rest: boolean;
  saved: boolean;
  calm: number;
  emb?: number[];
};

const UP_M = new THREE.Matrix4();
const UP_Q = new THREE.Quaternion();
const UP_E = new THREE.Euler();

function formed(item: DropItem) {
  if (item.stage === "token") return false;
  const parts = item.mesh?.parts.length ?? 0;
  if (item.stage === "solid" || item.stage === "painted") return parts >= 3;
  return parts >= 3 || !!item.image;
}

function clearance(b: Body) {
  const ex = b.ex || b.r;
  const ey = b.ey || b.r;
  const ez = b.ez || b.r;
  UP_Q.setFromEuler(UP_E.set(b.rx, b.ry, b.rz));
  UP_M.makeRotationFromQuaternion(UP_Q);
  const e = UP_M.elements;
  return Math.abs(e[1]!) * ex + Math.abs(e[5]!) * ey + Math.abs(e[9]!) * ez;
}

const bodies = new Map<string, Body>();
let lastNudge = 0;

function hash(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function ensure(item: DropItem, now: number) {
  const prev = bodies.get(item.id);
  const radius = (FLY_SIZE * item.scale) * 0.5;
  if (prev) {
    prev.name = item.prompt;
    prev.r = radius;
    return prev;
  }
  const h = hash(item.id);
  const ang = ((h % 360) * Math.PI) / 180;
  const rad = 0.08 + (h % 100) / 100 * (PEDESTAL_R * 0.55);
  const landed = item.rest ?? {
    x: Math.cos(ang) * rad,
    y: PEDESTAL_H + radius,
    z: Math.sin(ang) * rad * (h % 2 === 0 ? 1 : -1),
  };
  const tilt = ((h % 1000) / 1000) * Math.PI;
  const fresh = !item.rest && now - item.dropAt < 12_000;
  const body: Body = {
    id: item.id,
    name: item.prompt,
    r: radius,
    x: fresh ? Math.cos(ang) * 0.12 : landed.x,
    y: fresh ? PEDESTAL_H + 3.4 + (h % 7) * 0.12 : landed.y,
    z: fresh ? Math.sin(ang) * 0.16 : landed.z,
    vx: fresh ? Math.cos(ang) * 0.18 : 0,
    vy: fresh ? 0.05 : 0,
    vz: fresh ? Math.sin(ang) * 0.18 : 0,
    rx: fresh ? tilt : tilt * 0.45,
    ry: ((h >> 3) % 628) / 100,
    rz: fresh ? ((h >> 5) % 500) / 80 : ((h >> 5) % 200) / 120,
    wx: fresh ? (((h >> 2) % 9) - 4) * 1.4 : 0,
    wy: fresh ? (((h >> 4) % 9) - 4) * 1.1 : 0,
    wz: fresh ? (((h >> 6) % 9) - 4) * 1.6 : 0,
    ex: 0,
    ey: 0,
    ez: 0,
    rest: !fresh,
    saved: !!item.rest || !fresh,
    calm: 0,
  };
  if (Math.abs(body.z) < MIRROR_CLEAR + radius) body.z = (body.z >= 0 ? 1 : -1) * (MIRROR_CLEAR + radius);
  bodies.set(item.id, body);
  return body;
}

function Piece({ item }: { item: DropItem }) {
  const wrap = useRef<THREE.Group>(null);
  const frame = useRef<THREE.Mesh>(null);
  const mesh = useMemo(() => new THREE.Group(), []);

  useEffect(() => {
    let gone = false;
    const apply = (img: HTMLImageElement | null) => {
      if (gone) return;
      const sculpt = sculptFromImage(img, FLY_SIZE * item.scale, item.mesh);
      const emb = img ? topologyFromImage(img) : item.mesh ? topologyFromParts(item.mesh.parts) : null;
      const body = bodies.get(item.id);
      if (body && emb) body.emb = emb;
      if (!sculpt) return;
      const half = sculpt.userData.half as { x: number; y: number; z: number } | undefined;
      if (body && half) {
        body.ex = half.x;
        body.ey = half.y;
        body.ez = half.z;
      }
      mesh.clear();
      mesh.add(sculpt);
    };
    const glyph = item.stage === "token" ? emojiGlyph(item.prompt) : "";
    if (glyph) {
      const medal = emojiMedallion(glyph, FLY_SIZE * item.scale);
      if (medal) {
        mesh.clear();
        mesh.add(medal);
      }
      return () => {
        gone = true;
      };
    }
    if (item.mesh && item.mesh.parts.length) apply(null);
    if (!item.image) return () => {
      gone = true;
    };
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (gone) return;
      const emb = topologyFromImage(img);
      const body = bodies.get(item.id);
      if (body && emb) body.emb = emb;
    };
    img.src = item.image;
    return () => {
      gone = true;
    };
  }, [item.image, item.mesh, item.scale, item.id, item.stage, item.prompt, mesh]);

  useFrame(() => {
    const body = bodies.get(item.id);
    if (!wrap.current || !body) return;
    wrap.current.position.set(body.x, body.y, body.z);
    wrap.current.rotation.set(body.rx, body.ry, body.rz);
    const on = sim.selected === item.id;
    if (frame.current) frame.current.visible = on;
  });

  const size = FLY_SIZE * item.scale;
  return (
    <group
      ref={wrap}
      onClick={(e) => {
        e.stopPropagation();
        if (sim.pointer.drag > 10) return;
        sim.selected = sim.selected === item.id ? null : item.id;
      }}
    >
      <primitive object={mesh} />
      <mesh ref={frame} visible={false}>
        <boxGeometry args={[size * 1.05, size * 1.05, size * 0.72]} />
        <meshBasicMaterial color="#e8ddd0" wireframe />
      </mesh>
    </group>
  );
}

export function Drops() {
  const [shown, setShown] = useState<DropItem[]>([]);
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const next = sim.drops.filter((item) => formed(item) && item.dropAt <= now + 80);
      setShown((prev) => {
        if (prev.length === next.length && prev.every((item, i) => item.id === next[i]?.id && item.image === next[i]?.image && item.stage === next[i]?.stage && (item.mesh?.parts.length ?? 0) === (next[i]?.mesh?.parts.length ?? 0))) {
          return prev;
        }
        return next;
      });
    }, 400);
    return () => window.clearInterval(id);
  }, []);
  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    const now = Date.now();
    const live = sim.drops.filter((item) => formed(item) && item.dropAt <= now);
    const ids = new Set(live.map((item) => item.id));
    for (const id of bodies.keys()) if (!ids.has(id)) bodies.delete(id);
    const list = live.map((item) => ensure(item, now));

    for (const b of list) {
      const floor = PEDESTAL_H + 0.012 + clearance(b);
      if (b.rest && b.vy === 0 && Math.hypot(b.vx, b.vz) < 0.01) {
        if (b.y < floor) b.y = floor;
        continue;
      }
      b.vy -= 4.2 * d;
      b.x += b.vx * d;
      b.y += b.vy * d;
      b.z += b.vz * d;
      b.rx += b.wx * d;
      b.ry += b.wy * d;
      b.rz += b.wz * d;
      b.vx *= 1 - Math.min(1, d * 0.35);
      b.vz *= 1 - Math.min(1, d * 0.35);

      if (b.y < floor) {
        b.y = floor;
        if (b.vy < -0.4) {
          b.vy = -b.vy * 0.34;
          b.wx += b.vz * 3.2;
          b.wz -= b.vx * 3.2;
          b.wx *= 0.72;
          b.wy *= 0.72;
          b.wz *= 0.72;
        } else {
          b.vy = 0;
          b.wx *= 0.8;
          b.wy *= 0.8;
          b.wz *= 0.8;
        }
        b.vx *= 0.82;
        b.vz *= 0.82;
      }

      const radial = Math.hypot(b.x, b.z);
      const maxR = PEDESTAL_R * 0.78 - b.r * 0.2;
      if (radial > maxR) {
        const k = maxR / Math.max(radial, 1e-4);
        b.x *= k;
        b.z *= k;
        b.vx *= -0.25;
        b.vz *= -0.25;
      }

      const limit = MIRROR_CLEAR + b.r * 0.45;
      const halfW = sim.stage.mirrorW * 0.5 + b.r;
      const top = PEDESTAL_H + sim.stage.mirrorH;
      if (Math.abs(b.x) < halfW && b.y < top && Math.abs(b.z) < limit) {
        const side = b.z >= 0 ? 1 : -1;
        b.z = side * limit;
        if (b.vz * side < 0) b.vz *= -0.45;
      }
    }

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dy, dz) || 1e-4;
        const min = (a.r + b.r) * 0.72;
        if (dist >= min) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;
        const push = (min - dist) * 0.5;
        a.x -= nx * push;
        a.y -= ny * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.y += ny * push;
        b.z += nz * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
        if (rel < 0) {
          const imp = rel * 0.55;
          a.vx += nx * imp;
          a.vy += ny * imp;
          a.vz += nz * imp;
          b.vx -= nx * imp;
          b.vy -= ny * imp;
          b.vz -= nz * imp;
          a.rest = false;
          b.rest = false;
        }
      }
    }

    for (const b of list) {
      const floor = PEDESTAL_H + 0.012 + clearance(b);
      if (b.y < floor) b.y = floor;
    }

    const flyR = FLY_SIZE * 0.42;
    const f = sim.fly;
    const nudge = clearFly(f, list, flyR);
    if (nudge && Date.now() - lastNudge > 900) {
      lastNudge = Date.now();
      sim.say(nudge.hop ? `${nudge.name} falls beside it.` : `It steps aside for ${nudge.name}.`);
      sim.impact = { name: nudge.name, force: nudge.force, t: Date.now() };
    }
    if (nudge?.hop && !f.airborne) {
      f.airborne = true;
      f.hop = true;
      f.airTime = 0;
      f.landLock = 0.28;
      f.vy = 0.28 + nudge.force * 0.35;
    }

    for (const b of list) {
      const speed = Math.hypot(b.vx, b.vy, b.vz);
      const spin = Math.hypot(b.wx, b.wy, b.wz);
      if (b.y <= PEDESTAL_H + b.r * 0.45 && speed < 0.08 && spin < 0.6) {
        b.calm += d;
        if (b.calm > 0.7) {
          b.rest = true;
          b.vx = 0;
          b.vy = 0;
          b.vz = 0;
          b.wx = 0;
          b.wy = 0;
          b.wz = 0;
          if (!b.saved) {
            b.saved = true;
            sim.say(`${b.name} meets the stone.`);
            void settleDrop({ data: { id: b.id, x: b.x, y: b.y, z: b.z } }).catch(() => {
              b.saved = false;
            });
          }
        }
      } else {
        b.calm = 0;
        b.rest = false;
      }
    }

    sim.bodies = list.map((b) => ({
      id: b.id,
      name: b.name,
      x: b.x,
      y: b.y,
      z: b.z,
      r: b.r,
      rest: b.rest,
      vy: b.vy,
      emb: b.emb,
    }));
  });

  return (
    <group>
      {shown.map((item) => (
        <Piece key={item.id} item={item} />
      ))}
    </group>
  );
}
