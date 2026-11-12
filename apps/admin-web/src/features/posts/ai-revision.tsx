"use client";

import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  aiRevisionResponseSchema,
  chatGptStatusSchema,
} from "@cloudflare-ai-blog/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useApiResource } from "@/features/management/use-api-resource";

type SelectedPassage = {
  document: ProseMirrorNode;
  from: number;
  to: number;
  text: string;
};

function selectedPassage(editor: Editor): SelectedPassage | null {
  const { doc, selection } = editor.state;
  const { from, to, $from, $to } = selection;
  if (
    selection.empty ||
    !$from.sameParent($to) ||
    $from.parent.type.name !== "paragraph"
  )
    return null;

  let plainText = true;
  $from.parent.nodesBetween($from.parentOffset, $to.parentOffset, (node) => {
    if (!node.isText || node.marks.length) plainText = false;
  });

  const text = doc.textBetween(from, to);
  if (!plainText || !text.trim() || text.length > 2500) return null;
  return { document: doc, from, to, text };
}

export function AiRevision({
  editor,
  title,
  disabled,
  onApplied,
}: {
  editor: Editor | null;
  title: string;
  disabled: boolean;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [passage, setPassage] = useState<SelectedPassage | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setPassage(editor ? selectedPassage(editor) : null);
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!editor || disabled}
          onMouseDown={(event) => event.preventDefault()}
        >
          AI로 다듬기
        </Button>
      </DialogTrigger>
      <DialogContent className="management-dialog max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI로 본문 다듬기</DialogTitle>
          <DialogDescription>
            현재 초안의 내용으로 선택한 문장을 다듬어요. 수정안을 확인하고
            편집기에 반영할 수 있어요.
          </DialogDescription>
        </DialogHeader>
        {open &&
          (editor && passage ? (
            <RevisionForm
              editor={editor}
              title={title}
              passage={passage}
              onApplied={() => {
                setOpen(false);
                onApplied();
              }}
            />
          ) : (
            <p>
              본문의 한 문단에서 서식이나 인용 링크가 없는 문장을 최대
              2,500자까지 선택해 주세요.
            </p>
          ))}
      </DialogContent>
    </Dialog>
  );
}

function RevisionForm({
  editor,
  title,
  passage,
  onApplied,
}: {
  editor: Editor;
  title: string;
  passage: SelectedPassage;
  onApplied: () => void;
}) {
  const status = useApiResource("/api/admin/chatgpt", chatGptStatusSchema);
  const [model, setModel] = useState("");
  const [instructions, setInstructions] = useState("");
  const [proposal, setProposal] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  const models = status.data?.models ?? [];
  const selectedModel = models.some(({ slug }) => slug === model)
    ? model
    : (models[0]?.slug ?? "");

  useEffect(() => () => request.current?.abort(), []);

  async function revise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedModel || !instructions.trim() || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError("");
    setProposal("");

    try {
      const response = await fetch("/api/admin/chatgpt/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: selectedModel,
          title,
          selection: passage.text,
          context: passage.document
            .textBetween(
              Math.max(0, passage.from - 4500),
              Math.min(passage.document.content.size, passage.to + 4500),
              "\n\n",
            )
            .slice(0, 12_000),
          instructions,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          result &&
            typeof result === "object" &&
            "error" in result &&
            typeof result.error === "string"
            ? result.error
            : "AI 수정안을 받지 못했어요.",
        );
      setProposal(aiRevisionResponseSchema.parse(result).revisedText);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error ? error.message : "AI 수정안을 받지 못했어요.",
        );
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  function apply() {
    if (
      !proposal ||
      !editor.isEditable ||
      !editor.state.doc.eq(passage.document)
    ) {
      setError("본문이 바뀌었어요. 다시 선택해서 수정안을 요청해 주세요.");
      return;
    }

    const whitespaceBefore = passage.text.match(/^\s+/u)?.[0] ?? "";
    const whitespaceAfter = passage.text.match(/\s+$/u)?.[0] ?? "";
    const text = editor.schema.text(
      whitespaceBefore + proposal + whitespaceAfter,
    );
    editor.view.dispatch(
      editor.state.tr.replaceWith(passage.from, passage.to, text),
    );
    onApplied();
  }

  return (
    <form className="management-form" onSubmit={revise}>
      <div>
        <strong>선택한 원문</strong>
        <p className="mt-2 whitespace-pre-wrap">{passage.text}</p>
      </div>
      {status.error && (
        <p className="editor-errors" role="alert">
          {status.error}
        </p>
      )}
      {status.data && !models.length && (
        <p>AI 글쓰기 화면에서 ChatGPT를 연결해 주세요.</p>
      )}
      {models.length > 0 && (
        <label>
          ChatGPT 모델
          <select
            value={selectedModel}
            disabled={pending}
            onChange={(event) => {
              setModel(event.target.value);
              setProposal("");
            }}
          >
            {models.map(({ slug, name }) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        수정 지시
        <textarea
          required
          rows={3}
          maxLength={1000}
          value={instructions}
          disabled={pending}
          placeholder="예: 초안에 나온 배우 이름과 배역을 함께 적고, 자료가 없다는 문장은 빼 줘."
          onChange={(event) => {
            setInstructions(event.target.value);
            setProposal("");
          }}
        />
      </label>
      {error && (
        <p className="editor-errors" role="alert">
          {error}
        </p>
      )}
      {proposal && (
        <div>
          <strong>AI 수정안</strong>
          <p className="mt-2 whitespace-pre-wrap">{proposal}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="outline"
          disabled={!selectedModel || !instructions.trim() || pending}
        >
          {pending ? "수정안 작성 중…" : "수정안 받기"}
        </Button>
        {proposal && (
          <Button type="button" onClick={apply}>
            선택 영역에 반영
          </Button>
        )}
      </div>
    </form>
  );
}
