import test from "node:test";
import assert from "node:assert/strict";
import { readPage } from "./content.ts";
import { safeHref, safeImage } from "./content-safety.ts";

test("pagination accepts only positive safe integers and one query value", () => {
  assert.equal(readPage(undefined), 1);
  assert.equal(readPage("2"), 2);
  for (const input of [
    "0",
    "-1",
    "1.5",
    "NaN",
    "1e2",
    "9007199254740992",
    ["1", "2"],
  ])
    assert.equal(readPage(input), null);
});
test("content links block executable schemes, protocol-relative URLs and credentials", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,x",
    "//evil.example",
    "/\\evil.example",
    "https://user:pass@example.com",
    " https://example.com",
    null,
  ])
    assert.equal(safeHref(value), null);
  assert.equal(safeHref("/posts/small-records"), "/posts/small-records");
  assert.equal(safeHref("https://example.com"), "https://example.com/");
});
test("image URLs accept editor web URLs and local assets, but reject unsafe paths", () => {
  assert.equal(safeImage("/images/writing.svg"), "/images/writing.svg");
  assert.equal(
    safeImage("https://example.com/a.jpg"),
    "https://example.com/a.jpg",
  );
  for (const value of [
    "data:image/svg+xml,x",
    "/api/private",
    "/images/../secret.svg",
    "/images/%2e%2e/secret.svg",
    "javascript:x",
  ])
    assert.equal(safeImage(value), null);
});
