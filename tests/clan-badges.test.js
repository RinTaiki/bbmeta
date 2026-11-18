import { test } from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { clanBadgePath } from "../js/clan-badges.js";
test("API badge ids, names and filenames resolve to the supplied three-digit artwork", async () => {
  for (let id = 0; id < 24; id++) {
    const path = "assets/badges/" + String(id).padStart(3, "0") + ".png";
    assert.equal(clanBadgePath({ id }), path);
    assert.equal(clanBadgePath({ file: id + ".png" }), path);
    assert.equal(
      clanBadgePath({ name: "clan_icon_" + String(id).padStart(3, "0") }),
      path,
    );
    await access(new URL("../" + path, import.meta.url));
  }
  assert.equal(clanBadgePath({ file: "010.png" }), "assets/badges/010.png");
  for (const badge of [
    null,
    { id: 31 },
    { file: "../010.png" },
    { id: -1 },
    { id: true },
    { file: "https://example.com/010.png" },
  ])
    assert.equal(clanBadgePath(badge), null);
});
