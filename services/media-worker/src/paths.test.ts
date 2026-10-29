import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveInsideRoot, assertFileInsideRoot } from "./paths.js";

describe("path containment", () => {
  it("allows files inside the media root", async () => {
    const root = await mkdtemp(join(tmpdir(), "mw-root-"));
    try {
      const file = join(root, "a.mp4");
      await writeFile(file, "x");
      const expected = realpathSync(file);
      assert.equal(assertFileInsideRoot(root, file), expected);
      assert.equal(resolveInsideRoot(root, "a.mp4"), expected);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects path traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "mw-root-"));
    try {
      await writeFile(join(root, "a.mp4"), "x");
      assert.throws(() => resolveInsideRoot(root, "../outside.mp4"));
      assert.throws(() => resolveInsideRoot(root, join(root, "..", "outside.mp4")));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects symlink escape when target is outside root", async () => {
    const root = await mkdtemp(join(tmpdir(), "mw-root-"));
    const outside = await mkdtemp(join(tmpdir(), "mw-out-"));
    try {
      const outsideFile = join(outside, "secret.mp4");
      await writeFile(outsideFile, "secret");
      const link = join(root, "linked.mp4");
      await symlink(outsideFile, link);
      assert.throws(() => assertFileInsideRoot(root, link));
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
