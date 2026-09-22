import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DIM } from "./topology";

const row = z.object({
  id: z.string().min(2).max(80),
  label: z.string().min(1).max(80),
  emb: z.array(z.number()).length(DIM),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  valence: z.number(),
});

export const syncMemory = createServerFn({ method: "POST" })
  .validator(
    z.object({
      rows: z.array(row).max(24),
      query: z.array(z.number()).length(DIM),
    }),
  )
  .handler(async ({ data }) => {
    const { syncFlyMemory } = await import("./store.server");
    return syncFlyMemory(data);
  });
