import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listDrops = createServerFn({ method: "GET" }).handler(async () => {
  const { readPublicCatalog } = await import("./persist.server");
  return readPublicCatalog();
});

export const submitDrop = createServerFn({ method: "POST" })
  .validator(
    z.object({
      prompt: z.string().min(2).max(240),
      quality: z.enum(["high", "low"]),
    }),
  )
  .handler(async ({ data }) => {
    const { generateDrop } = await import("./persist.server");
    return generateDrop(data.prompt, data.quality);
  });

export const settleDrop = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().min(4).max(80),
      x: z.number(),
      y: z.number(),
      z: z.number(),
    }),
  )
  .handler(async ({ data }) => {
    const { saveRest } = await import("./persist.server");
    return saveRest(data.id, { x: data.x, y: data.y, z: data.z });
  });
