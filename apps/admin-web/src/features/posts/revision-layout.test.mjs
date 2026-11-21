import test from "node:test";
import assert from "node:assert/strict";
import {
  subscriptionRevisionResultSchema,
  validRevisionLayout,
} from "../../../../../packages/shared/src/ai-draft.ts";

test("source photo before the intro, rewritten paragraph and generated illustration after it", () => {
  const plan = subscriptionRevisionResultSchema.parse({
    layout: [
      {
        kind: "source",
        pageUrl: "https://example.org/news",
        imageUrl: "https://example.org/product.jpg",
        alt: "제품 사진",
      },
      { kind: "keep", index: 2 },
      { kind: "paragraph", text: "새 설명" },
      { kind: "generate", prompt: "Technical illustration", alt: "기술 도식" },
      { kind: "keep", index: 0 },
    ],
    removed: [1],
  });
  assert.equal(validRevisionLayout(3, plan), true);
  for (const removed of [[], [1, 1], [2], [4]])
    assert.equal(validRevisionLayout(3, { ...plan, removed }), false);
  assert.equal(
    validRevisionLayout(3, {
      ...plan,
      layout: [...plan.layout, plan.layout[0], plan.layout[0]],
    }),
    false,
  );
});
