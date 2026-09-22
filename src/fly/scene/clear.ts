import { PEDESTAL_R } from "../sim";

type Body = {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  r: number;
  vx?: number;
  vy: number;
  vz?: number;
  rest: boolean;
};

type Fly = { x: number; y: number; z: number; vx: number; vz: number };

export type Nudge = { hop: boolean; force: number; name: string };

export function clearFly(f: Fly, bodies: Body[], flyR: number): Nudge | null {
  let nudge: Nudge | null = null;
  const maxR = PEDESTAL_R * 0.78;
  for (const b of bodies) {
    const dx = f.x - b.x;
    const dz = f.z - b.z;
    const horiz = Math.hypot(dx, dz) || 1e-4;
    const min = flyR + b.r * 0.72;
    const stacked = Math.abs(f.y - b.y) < b.r * 0.9 + flyR * 0.8;
    if (!stacked || horiz >= min) continue;
    let nx = dx / horiz;
    let nz = dz / horiz;
    if (Math.abs(nx) + Math.abs(nz) < 0.2) {
      nx = 1;
      nz = 0;
    }
    const need = min - horiz;
    const falling = !b.rest && b.vy < -0.04;
    if (falling) {
      f.x += nx * need * 0.74;
      f.z += nz * need * 0.74;
      b.x -= nx * need * 0.26;
      b.z -= nz * need * 0.26;
      const force = Math.min(1, Math.abs(b.vy) * 0.5 + 0.15);
      f.vx += nx * (0.18 + force * 0.5);
      f.vz += nz * (0.18 + force * 0.5);
      if (b.vx !== undefined) b.vx -= nx * 0.12;
      if (b.vz !== undefined) b.vz -= nz * 0.12;
      b.vy *= 0.45;
      nudge = { hop: force > 0.32, force, name: b.name };
    } else {
      f.x += nx * need;
      f.z += nz * need;
    }
    const radial = Math.hypot(f.x, f.z);
    if (radial > maxR) {
      const k = maxR / radial;
      f.x *= k;
      f.z *= k;
      b.x -= nx * need * 0.35;
      b.z -= nz * need * 0.35;
    }
  }
  return nudge;
}
