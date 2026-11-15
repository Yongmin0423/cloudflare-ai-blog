"use client";

import type { Editor } from "@tiptap/react";
import { revisionPassages } from "./ai-revision-passage";
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

type RevisionTargets = ReturnType<typeof revisionPassages>;

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
  const [targets, setTargets] = useState<RevisionTargets | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen)
          setTargets(editor ? revisionPassages(editor.state) : null);
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
            현재 초안에서 다듬을 문단을 고르고 수정안을 확인해요.
          </DialogDescription>
        </DialogHeader>
        {open &&
          (editor && targets?.passages.length ? (
            <RevisionForm
              editor={editor}
              title={title}
              targets={targets}
              onApplied={() => {
                setOpen(false);
                onApplied();
              }}
            />
          ) : (
            <p>
              다듬을 수 있는 문단이 없어요. 본문에서 일반 텍스트를 최대
              2,500자까지 선택한 뒤 다시 열어 주세요.
            </p>
          ))}
      </DialogContent>
    </Dialog>
  );
}

function RevisionForm({
  editor,
  title,
  targets,
  onApplied,
}: {
  editor: Editor;
  title: string;
  targets: RevisionTargets;
  onApplied: () => void;
}) {
  const [passageIndex, setPassageIndex] = useState(targets.initialIndex);
  const passage = targets.passages[passageIndex];
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
          context: targets.document
            .textBetween(
              Math.max(0, passage.from - 4500),
              Math.min(targets.document.content.size, passage.to + 4500),
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
      !editor.state.doc.eq(targets.document)
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
      <label>
        수정할 부분
        <select
          value={passageIndex}
          disabled={pending}
          onChange={(event) => {
            setPassageIndex(Number(event.target.value));
            setProposal("");
            setError("");
          }}
        >
          {targets.passages.map(({ from, to, text, selected }, index) => (
            <option key={`${from}-${to}`} value={index}>
              {selected ? "선택한 문장 · " : ""}
              {text.trim().slice(0, 58)}
              {text.trim().length > 58 ? "…" : ""}
            </option>
          ))}
        </select>
      </label>
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
