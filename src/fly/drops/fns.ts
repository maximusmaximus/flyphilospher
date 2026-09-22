import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listDrops = createServerFn({ method: "GET" }).handler(async () => {
  const { readPublicCatalog } = await import("./persist.server");
  return readPublicCatalog();
});

export const designDrop = createServerFn({ method: "POST" })
  .validator(z.object({ prompt: z.string().min(2).max(240) }))
  .handler(async ({ data }) => {
    const { designDrop: design } = await import("./persist.server");
    return design(data.prompt);
  });

export const submitDrop = createServerFn({ method: "POST" })
  .validator(
    z.object({
      prompt: z.string().min(2).max(240),
      quality: z.enum(["high", "low"]),
      enhanced: z.string().max(1500).optional(),
      mesh: z.unknown().optional(),
      id: z.string().min(4).max(80).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { generateDrop } = await import("./persist.server");
    const designed =
      data.enhanced && data.mesh
        ? { enhanced: data.enhanced, mesh: data.mesh as import("./types").MeshSpec }
        : undefined;
    return generateDrop(data.prompt, data.quality, designed, data.id);
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
