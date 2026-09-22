export type DropRest = { x: number; y: number; z: number };

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
};

export type Catalog = {
  items: DropItem[];
  spentToday: number;
  budget: number;
  day: string;
};
