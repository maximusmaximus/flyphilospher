import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { acceptablePrompt } from "./prompt";

const promptField = z.string().max(240).refine(acceptablePrompt, "say what should fall");

export const listDrops = createServerFn({ method: "GET" }).handler(async () => {
  const { readPublicCatalog } = await import("./persist.server");
  return readPublicCatalog();
});

export const issueCaptcha = createServerFn({ method: "GET" }).handler(async () => {
  const { issueCaptcha: issue } = await import("./captcha.server");
  return issue();
});

export const placeDrop = createServerFn({ method: "POST" })
  .validator(
    z.object({
      prompt: promptField,
      id: z.string().min(4).max(80),
      mesh: z.unknown(),
      captchaId: z.string().min(16).max(80),
      answer: z.string().min(4).max(12),
      nonce: z.string().regex(/^\d{1,8}$/),
      trap: z.string().max(120).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { verifyCaptcha, openGrant } = await import("./captcha.server");
    const { placeDrop: place } = await import("./persist.server");
    verifyCaptcha({ id: data.captchaId, answer: data.answer, nonce: data.nonce, trap: data.trap });
    const placed = await place(data.prompt, data.id, data.mesh);
    return { ...placed, grant: openGrant(placed.item.id) };
  });

export const designDrop = createServerFn({ method: "POST" })
  .validator(
    z.object({
      prompt: promptField,
      id: z.string().min(4).max(80),
      grant: z.string().min(16).max(80),
    }),
  )
  .handler(async ({ data }) => {
    const { useGrant } = await import("./captcha.server");
    const { designDrop: design } = await import("./persist.server");
    useGrant(data.grant, data.id);
    return design(data.prompt, data.id);
  });

export const submitDrop = createServerFn({ method: "POST" })
  .validator(
    z.object({
      prompt: promptField,
      quality: z.enum(["high", "low"]),
      enhanced: z.string().max(1500).optional(),
      mesh: z.unknown().optional(),
      id: z.string().min(4).max(80),
      grant: z.string().min(16).max(80),
    }),
  )
  .handler(async ({ data }) => {
    const { useGrant } = await import("./captcha.server");
    const { generateDrop } = await import("./persist.server");
    useGrant(data.grant, data.id);
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
