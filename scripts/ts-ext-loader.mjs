import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !path.extname(specifier)) {
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const base = path.resolve(path.dirname(parent), specifier);
    if (existsSync(`${base}.ts`)) return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
