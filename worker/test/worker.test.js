import test from "node:test";
import assert from "node:assert/strict";

test("publishing scope list stays least-privilege", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/worker.js", import.meta.url), "utf8"));
  for (const scope of ["pages_manage_posts","pages_show_list","instagram_content_publish"]) assert.match(source,new RegExp(scope));
  for (const excluded of ["pages_manage_engagement","instagram_manage_messages","ads_management"]) assert.doesNotMatch(source,new RegExp(`"${excluded}"`));
});

test("temporary media is authenticated, short-lived, and size limited", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/worker.js", import.meta.url), "utf8"));
  assert.match(source,/authorization/);
  assert.match(source,/expirationTtl:60 \* 60/);
  assert.match(source,/24 \* 1024 \* 1024/);
  assert.match(source,/getWithMetadata/);
});

test("public privacy and data-deletion pages are available", async () => {
  const worker = (await import("../src/worker.js")).default;
  for (const path of ["privacy", "data-deletion"]) {
    const result = await worker.fetch(new Request(`https://qu-meta-auth.example/${path}`), {});
    assert.equal(result.status, 200);
    assert.match(result.headers.get("content-type"), /text\/html/);
    assert.match(await result.text(), /Qu for Meta/);
  }
});
