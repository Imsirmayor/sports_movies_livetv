import { realpathSync, existsSync } from "node:fs";
import { isAbsolute, normalize, resolve, sep } from "node:path";

/**
 * Resolve a candidate path and ensure it stays inside `rootDir`.
 * Rejects absolute escapes, `..` traversal, and symlink escapes outside the root.
 */
export function resolveInsideRoot(rootDir: string, candidateRelativeOrAbsolute: string): string {
  if (!rootDir || !existsSync(rootDir)) {
    throw new Error("Media root is not configured or does not exist");
  }

  const rootReal = realpathSync(rootDir);
  const normalizedCandidate = normalize(candidateRelativeOrAbsolute);

  if (normalizedCandidate.includes("\0")) {
    throw new Error("Invalid path");
  }

  const absolute = isAbsolute(normalizedCandidate)
    ? normalizedCandidate
    : resolve(rootReal, normalizedCandidate);

  let resolved: string;
  try {
    resolved = existsSync(absolute) ? realpathSync(absolute) : normalize(absolute);
  } catch {
    throw new Error("Unable to resolve path");
  }

  const rootPrefix = rootReal.endsWith(sep) ? rootReal : rootReal + sep;
  if (resolved !== rootReal && !resolved.startsWith(rootPrefix)) {
    throw new Error("Path escapes configured media root");
  }

  return resolved;
}

export function assertFileInsideRoot(rootDir: string, absoluteFilePath: string): string {
  const resolved = resolveInsideRoot(rootDir, absoluteFilePath);
  if (!existsSync(resolved)) {
    throw new Error("File does not exist inside media root");
  }
  return resolved;
}
