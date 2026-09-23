export type DropRest = { x: number; y: number; z: number };

export type MeshPart = {
  kind: "ellipsoid" | "capsule" | "box" | "cone";
  at: [number, number, number];
  size: [number, number, number];
  rot: [number, number, number];
  color: string;
};

export type MeshSpec = {
  metalness: number;
  roughness: number;
  depth: number;
  parts: MeshPart[];
};

export type DropItem = {
  id: string;
  cid: string;
  prompt: string;
  enhanced: string;
  createdAt: number;
  dropAt: number;
  scale: number;
  image: string;
  github: string | null;
  ipfs: string | null;
  pinned: boolean;
  rest: DropRest | null;
  mesh?: MeshSpec | null;
  stage?: "token" | "solid" | "painted";
};

export type Catalog = {
  items: DropItem[];
  spentToday: number;
  budget: number;
  day: string;
};
