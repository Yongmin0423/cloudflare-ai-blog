import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

export const citationLabel = /^\[\d+\]$/;

type Passage = {
  from: number;
  to: number;
  text: string;
  selected?: true;
};

function plainPassage(document: ProseMirrorNode, from: number, to: number) {
  if (from >= to) return null;

  let plainText = true;
  document.nodesBetween(from, to, (node) => {
    if (node.isInline && (!node.isText || node.marks.length)) plainText = false;
  });

  const text = document.textBetween(from, to);
  if (!plainText || !text.trim() || text.length > 2500) return null;
  return { from, to, text };
}

function paragraphPassage(
  document: ProseMirrorNode,
  node: ProseMirrorNode,
  from: number,
) {
  let end = node.content.size;
  // Keep trailing citations and their separating spaces outside the replacement.
  for (let index = node.childCount - 1; index >= 0; index--) {
    const child = node.child(index);
    if (
      !child.isText ||
      (child.text?.trim() &&
        (!citationLabel.test(child.text.trim()) ||
          !child.marks.some((mark) => mark.type.name === "link")))
    )
      break;

    end -= child.nodeSize;
  }
  const text = node.textBetween(0, end);
  return plainPassage(
    document,
    from,
    from + end - (text.length - text.trimEnd().length),
  );
}

export function revisionPassages({
  doc,
  selection,
}: Pick<EditorState, "doc" | "selection">) {
  const passages: Passage[] = [];
  doc.descendants((node, position) => {
    if (node.type.name !== "paragraph") return;
    const paragraph = paragraphPassage(doc, node, position + 1);
    if (paragraph) passages.push(paragraph);
    return false;
  });

  const { $from, $to } = selection;
  const paragraphStart =
    $from.parent.type.name === "paragraph" ? $from.start() : selection.from;
  const current = passages.findIndex(({ from }) => from >= paragraphStart);
  const initialIndex = current < 0 ? Math.max(0, passages.length - 1) : current;

  if (
    !selection.empty &&
    $from.sameParent($to) &&
    $from.parent.type.name === "paragraph"
  ) {
    const paragraph = passages.find(({ from }) => from === paragraphStart);
    const end = paragraph ? Math.min(selection.to, paragraph.to) : selection.to;
    const selected = plainPassage(doc, selection.from, end);
    if (
      selected &&
      (!paragraph ||
        selected.from !== paragraph.from ||
        selected.to !== paragraph.to)
    )
      return {
        document: doc,
        passages: [{ ...selected, selected: true as const }, ...passages],
        initialIndex: 0,
      };
  }

  return { document: doc, passages, initialIndex };
}
