import assert from "node:assert/strict";
import test from "node:test";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { revisionPassages } from "./ai-revision-passage.ts";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
  },
  marks: {
    link: { attrs: { href: {} } },
    bold: {},
  },
});

function citedDraft() {
  const firstText = "레이니 75의 가격과 구매 옵션을 확인해 보세요.";
  const secondText = "구성에 따라 배터리 용량이 달라져요.";
  const link = schema.marks.link.create({
    href: "https://example.com/rainy75",
  });
  const paragraph = schema.node("paragraph", null, [
    schema.text(firstText + " "),
    schema.text("[1]", [link]),
    schema.text(" "),
    schema.text("[2]", [link]),
  ]);
  const next = schema.node("paragraph", null, schema.text(secondText));
  return {
    doc: schema.node("doc", null, [paragraph, next]),
    firstText,
    secondText,
    paragraph,
  };
}

test("offers editable paragraphs and defaults to the paragraph under the cursor", () => {
  const { doc, firstText, secondText, paragraph } = citedDraft();
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, paragraph.nodeSize + 3),
  });
  const { passages, initialIndex } = revisionPassages(state);
  assert.deepEqual(
    passages.map(({ text }) => text),
    [firstText, secondText],
  );
  assert.equal(passages[initialIndex].text, secondText);
});

test("a selection extending through citations keeps links when the paragraph is replaced", () => {
  const { doc, firstText, paragraph } = citedDraft();
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, 1, paragraph.nodeSize - 1),
  });
  const { passages, initialIndex } = revisionPassages(state);
  const passage = passages[initialIndex];
  assert.equal(passage.text, firstText);
  const revised = state.tr.replaceWith(
    passage.from,
    passage.to,
    schema.text("다듬은 문장입니다."),
  );
  const first = revised.doc.firstChild;
  assert.equal(first.textContent, "다듬은 문장입니다. [1] [2]");
  assert.equal(
    first.child(1).marks[0].attrs.href,
    "https://example.com/rainy75",
  );
  assert.equal(
    first.child(3).marks[0].attrs.href,
    "https://example.com/rainy75",
  );
});

test("a plain selection inside a formatted paragraph remains available", () => {
  const prefix = "다듬을 문장";
  const paragraph = schema.node("paragraph", null, [
    schema.text(prefix),
    schema.text(" 강조된 부분", [schema.marks.bold.create()]),
  ]);
  const doc = schema.node("doc", null, [paragraph]);
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, 1, 1 + prefix.length),
  });
  const { passages } = revisionPassages(state);
  assert.deepEqual(passages, [
    { from: 1, to: 1 + prefix.length, text: prefix, selected: true },
  ]);
});
