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
  g.fillStyle = "#3a0c08";
  g.fillRect(0, 0, 512, 512);
  const r = 9;
  const row = r * 1.62;
  const col = r * 1.78;
  for (let y = -r; y < 512 + r; y += row) {
    const odd = Math.floor((y + r) / row) % 2;
    for (let x = -r; x < 512 + r; x += col) {
      const cx = x + (odd ? col * 0.5 : 0);
      const cy = y;
      const grd = g.createRadialGradient(cx - 1.6, cy - 1.8, 0.6, cx, cy, r);
      grd.addColorStop(0, "#c44a28");
      grd.addColorStop(0.22, "#9a2818");
      grd.addColorStop(0.55, "#6a1410");
      grd.addColorStop(0.82, "#3a0808");
      grd.addColorStop(1, "#140202");
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(cx, cy, r * 0.9, r * 0.78, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,210,160,0.22)";
      g.beginPath();
      g.ellipse(cx - 2.4, cy - 2.6, r * 0.2, r * 0.14, -0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  return tex(c, 2.4, 8);
}

export function makeAbdomen() {
  const { c, g } = canvas(256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#5a4030");
  grd.addColorStop(0.5, "#3a281c");
  grd.addColorStop(1, "#1c120c");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7; i++) {
    const y = 10 + i * 34;
    g.fillStyle = i % 2 === 0 ? "rgba(12,8,6,0.72)" : "rgba(90,62,40,0.28)";
    g.fillRect(0, y, 256, i % 2 === 0 ? 16 : 10);
    g.fillStyle = "rgba(180,140,90,0.08)";
    g.fillRect(0, y + 1, 256, 2);
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(16,8,4,${Math.random() * 0.22})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1, 2);
  }
  return tex(c, 1, 4);
}

export function makeThorax() {
  const { c, g } = canvas(256);
  g.fillStyle = "#2e241c";
  g.fillRect(0, 0, 256, 256);
  const stripe = g.createLinearGradient(0, 0, 256, 0);
  stripe.addColorStop(0, "rgba(0,0,0,0)");
  stripe.addColorStop(0.46, "rgba(18,12,8,0.55)");
  stripe.addColorStop(0.5, "rgba(10,6,4,0.8)");
  stripe.addColorStop(0.54, "rgba(18,12,8,0.55)");
  stripe.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = stripe;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    g.fillStyle = `rgba(${30 + Math.random() * 36},${22 + Math.random() * 18},${12},0.4)`;
    g.beginPath();
    g.arc(x, y, Math.random() * 1.8, 0, Math.PI * 2);
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
  g.fillStyle = "rgba(226,236,230,0.55)";
  g.fillRect(0, 0, 512, 512);
  const fill = g.createLinearGradient(0, 0, 512, 512);
  fill.addColorStop(0, "rgba(236,242,236,0.2)");
  fill.addColorStop(0.45, "rgba(210,228,220,0.12)");
  fill.addColorStop(1, "rgba(190,210,200,0.08)");
  g.fillStyle = fill;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "rgba(42,34,28,0.38)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(16, 256);
  g.bezierCurveTo(180, 200, 340, 175, 500, 220);
  g.moveTo(24, 250);
  g.bezierCurveTo(170, 130, 330, 110, 490, 170);
  g.moveTo(24, 262);
  g.bezierCurveTo(180, 340, 330, 370, 490, 310);
  g.moveTo(80, 248);
  g.quadraticCurveTo(180, 220, 280, 248);
  g.moveTo(90, 258);
  g.quadraticCurveTo(210, 310, 330, 328);
  g.moveTo(200, 188);
  g.lineTo(220, 256);
  g.moveTo(290, 168);
  g.lineTo(310, 258);
  g.moveTo(380, 162);
  g.lineTo(392, 252);
  g.stroke();
  g.fillStyle = "rgba(70,50,40,0.16)";
  g.beginPath();
  g.ellipse(440, 178, 18, 10, -0.3, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export function makeWingGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.12, 0.16, 0.55, 0.28, 1.28, 0.16);
  s.bezierCurveTo(1.52, 0.1, 1.62, 0.02, 1.58, -0.06);
  s.bezierCurveTo(1.48, -0.2, 1.05, -0.28, 0.55, -0.22);
  s.bezierCurveTo(0.22, -0.16, 0.05, -0.06, 0, 0);
  const g = new THREE.ShapeGeometry(s, 20);
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
