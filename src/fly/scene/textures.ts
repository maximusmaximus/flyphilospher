import * as THREE from "three";

function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d");
  return { c, g };
}

function tex(c: HTMLCanvasElement, repeat = 1, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.repeat.set(repeat, repeat);
  t.needsUpdate = true;
  return t;
}

export function makeEyeAlbedo() {
  const { c, g } = canvas(512);
  g.fillStyle = "#2a0808";
  g.fillRect(0, 0, 512, 512);
  const r = 11;
  for (let y = -r; y < 512 + r; y += r * 1.55) {
    const odd = Math.floor(y / (r * 1.55)) % 2;
    for (let x = -r; x < 512 + r; x += r * 1.8) {
      const cx = x + (odd ? r * 0.9 : 0);
      const cy = y;
      const grd = g.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, r);
      grd.addColorStop(0, "#7a2218");
      grd.addColorStop(0.45, "#4e100c");
      grd.addColorStop(0.82, "#2a0707");
      grd.addColorStop(1, "#140303");
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(cx, cy, r * 0.92, r * 0.8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,190,140,0.16)";
      g.beginPath();
      g.ellipse(cx - 3, cy - 3, r * 0.22, r * 0.16, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  return tex(c, 3, 8);
}

export function makeAbdomen() {
  const { c, g } = canvas(256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#6a4a32");
  grd.addColorStop(1, "#3a2418");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    const y = 18 + i * 30;
    g.fillStyle = i % 2 === 0 ? "rgba(22,12,8,0.55)" : "rgba(90,58,36,0.25)";
    g.fillRect(0, y, 256, 14 + (i % 3));
  }
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(20,10,6,${Math.random() * 0.18})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1, 2);
  }
  return tex(c, 1, 4);
}

export function makeThorax() {
  const { c, g } = canvas(256);
  g.fillStyle = "#4a3426";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    g.fillStyle = `rgba(${40 + Math.random() * 40},${24 + Math.random() * 20},${12},0.35)`;
    g.beginPath();
    g.arc(x, y, Math.random() * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c, 2, 4);
}

export function makeStone() {
  const { c, g } = canvas(512);
  g.fillStyle = "#d2c4b6";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(${170 + Math.random() * 50},${155 + Math.random() * 40},${140 + Math.random() * 30},${0.08 + Math.random() * 0.15})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 6, 1 + Math.random() * 3);
  }
  g.strokeStyle = "rgba(120,100,90,0.18)";
  g.lineWidth = 1.2;
  for (let i = 0; i < 18; i++) {
    g.beginPath();
    g.moveTo(Math.random() * 512, Math.random() * 512);
    g.bezierCurveTo(
      Math.random() * 512,
      Math.random() * 512,
      Math.random() * 512,
      Math.random() * 512,
      Math.random() * 512,
      Math.random() * 512,
    );
    g.stroke();
  }
  return tex(c, 2, 8);
}

export function makeWingAlpha() {
  const { c, g } = canvas(512);
  g.clearRect(0, 0, 512, 512);
  const grd = g.createLinearGradient(0, 0, 512, 0);
  grd.addColorStop(0, "rgba(220,230,225,0.08)");
  grd.addColorStop(0.2, "rgba(210,225,220,0.42)");
  grd.addColorStop(0.75, "rgba(200,220,215,0.28)");
  grd.addColorStop(1, "rgba(200,220,215,0.05)");
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(8, 256);
  g.bezierCurveTo(80, 120, 280, 70, 500, 210);
  g.bezierCurveTo(510, 256, 490, 340, 380, 390);
  g.bezierCurveTo(220, 450, 70, 360, 8, 256);
  g.fill();
  g.strokeStyle = "rgba(70,60,50,0.35)";
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(20, 256);
  g.lineTo(480, 230);
  g.moveTo(40, 250);
  g.quadraticCurveTo(200, 160, 420, 210);
  g.moveTo(40, 262);
  g.quadraticCurveTo(220, 360, 400, 330);
  g.moveTo(90, 248);
  g.quadraticCurveTo(180, 210, 240, 248);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
