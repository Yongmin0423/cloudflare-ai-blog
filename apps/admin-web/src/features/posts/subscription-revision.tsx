"use client";
import type { Editor, JSONContent } from "@tiptap/react";
import type { Node as DocumentNode } from "@tiptap/pm/model";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  managedImageSrc,
  revisionJobSchema,
  sourceImageCredit,
  sourceImagesSchema,
  subscriptionRevisionInputSchema,
  validRevisionLayout,
  type SourceImage,
} from "@cloudflare-ai-blog/shared";
import { Button } from "@/components/ui/button";
import {
  request,
  useApiResource,
} from "@/features/management/use-api-resource";
import type { revisionPassages } from "./ai-revision-passage";

const errorResponse = z.object({ error: z.string() });
const responseSchema = z.object({ job: revisionJobSchema.nullable() });
async function fingerprint(doc: DocumentNode) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(doc.toJSON())),
  );
  return Array.from(new Uint8Array(hash), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}

type Job = z.infer<typeof revisionJobSchema>;
type Asset =
  | { images: SourceImage[]; selected: number }
  | { blob: Blob; src: string; mediaId?: string };

function Proposal({
  job,
  editor,
  url,
  onApplied,
}: {
  job: Job;
  editor: Editor;
  url: string;
  onApplied: () => void;
}) {
  const [assets, setAssets] = useState<Record<number, Asset>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const urls = previews.current;
    const controller = new AbortController();
    abort.current = controller;
    return () => {
      controller.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);
  const abort = useRef<AbortController | null>(null);
  const plan = job.result;
  if (!plan) return null;
  const needsImages = plan.layout.some(
    (item, index) =>
      (item.kind === "source" || item.kind === "generate") && !assets[index],
  );
  async function prepare(index: number) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url + "/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, index }),
        signal: abort.current?.signal,
      });
      if (!response.ok)
        throw Error(
          errorResponse.safeParse(await response.json()).data?.error ||
            "이미지를 준비하지 못했어요.",
        );
      let asset: Asset;
      const item = job.result?.layout[index];
      if (item?.kind === "source") {
        const { images } = z
          .object({ images: sourceImagesSchema.nonempty() })
          .parse(await response.json());
        const match = images.findIndex((image) => image.url === item.imageUrl);
        asset = { images, selected: Math.max(0, match) };
      } else {
        const blob = await response.blob();
        if (blob.type !== "image/jpeg")
          throw Error("생성 이미지 형식을 확인해 주세요.");
        const src = URL.createObjectURL(blob);
        previews.current.add(src);
        asset = { blob, src };
      }
      setAssets((prev) => ({ ...prev, [index]: asset }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지를 준비하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!plan || busy || needsImages) return;
    setBusy(true);
    setError("");
    try {
      const doc = editor.state.doc;
      function checkEditor() {
        if (
          abort.current?.signal.aborted ||
          editor.isDestroyed ||
          !editor.isEditable ||
          !editor.state.doc.eq(doc)
        )
          throw Error("본문이 바뀌었어요. 현재 초안으로 다시 요청해 주세요.");
      }
      if (
        (await fingerprint(doc)) !== job.input.fingerprint ||
        !validRevisionLayout(doc.childCount, plan)
      )
        throw Error(
          "요청할 때의 본문과 달라요. 현재 초안으로 다시 요청해 주세요.",
        );
      checkEditor();
      const content: JSONContent[] = [];
      for (const [index, item] of plan.layout.entries()) {
        if (item.kind === "keep") {
          content.push(doc.child(item.index).toJSON());
          continue;
        }
        if ("text" in item) {
          content.push({
            type: item.kind,
            ...(item.kind === "heading" ? { attrs: { level: 2 } } : {}),
            content: [{ type: "text", text: item.text }],
          });
          continue;
        }
        const asset = assets[index];
        if ("images" in asset) {
          const image = asset.images[asset.selected];
          content.push(
            {
              type: "image",
              attrs: { src: image.url, alt: image.alt || item.alt },
            },
            sourceImageCredit(image),
          );
        } else {
          let mediaId = asset.mediaId;
          if (!mediaId) {
            checkEditor();
            const response = await fetch("/api/admin/media", {
              method: "POST",
              headers: { "Content-Type": "application/octet-stream" },
              body: asset.blob,
              signal: abort.current?.signal,
            });
            const value = await response.json();
            if (!response.ok)
              throw Error(
                errorResponse.safeParse(value).data?.error ||
                  "생성 이미지를 저장하지 못했어요.",
              );
            mediaId = z.object({ mediaId: z.uuid() }).parse(value).mediaId;
            setAssets((prev) => ({ ...prev, [index]: { ...asset, mediaId } }));
          }
          content.push({
            type: "image",
            attrs: { src: managedImageSrc(mediaId), alt: item.alt },
          });
        }
      }
      checkEditor();
      const next = editor.schema.nodeFromJSON({ type: "doc", content });
      next.check();
      editor.view.dispatch(
        editor.state.tr.replaceWith(0, doc.content.size, next.content),
      );
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "초안에 반영하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3">
      <h3>수정 후 본문 순서</h3>
      {plan.layout.map((item, index) => {
        if (item.kind === "keep")
          return (
            <p key={index}>
              {job.input.blocks[item.index].text ||
                job.input.blocks[item.index].type}
            </p>
          );
        if (item.kind === "heading") return <h4 key={index}>{item.text}</h4>;
        if (item.kind === "paragraph") return <p key={index}>{item.text}</p>;
        if (item.kind !== "source" && item.kind !== "generate") return null;
        const asset = assets[index];
        const image =
          asset && "images" in asset ? asset.images[asset.selected] : null;
        return (
          <figure key={index}>
            <figcaption>{item.alt}</figcaption>
            {item.kind === "source" && (
              <a
                href={image?.pageUrl || item.pageUrl}
                target="_blank"
                rel="noreferrer"
              >
                이미지 원문 보기
              </a>
            )}
            {asset ? (
              <>
                {/* External source images and local blob previews use their original URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="max-h-64 max-w-full object-contain"
                  referrerPolicy="no-referrer"
                  src={"src" in asset ? asset.src : image?.url}
                  alt={image?.alt || item.alt}
                />
                {"images" in asset && (
                  <label>
                    원문 이미지 선택
                    <select
                      value={asset.selected}
                      disabled={busy}
                      onChange={(e) =>
                        setAssets({
                          ...assets,
                          [index]: {
                            ...asset,
                            selected: Number(e.target.value),
                          },
                        })
                      }
                    >
                      {asset.images.map((candidate, i) => (
                        <option key={candidate.url} value={i}>
                          {i + 1}.{" "}
                          {candidate.alt ||
                            candidate.caption ||
                            candidate.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => prepare(index)}
              >
                {item.kind === "source"
                  ? "원문에서 이미지 가져오기"
                  : "이미지 생성하기"}
              </Button>
            )}
          </figure>
        );
      })}
      {plan.removed.length > 0 && (
        <details>
          <summary>삭제·교체되는 원문 {plan.removed.length}개</summary>
          {plan.removed.map((i) => (
            <p key={i}>
              {job.input.blocks[i].text || job.input.blocks[i].type}
            </p>
          ))}
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      <Button type="button" disabled={busy || needsImages} onClick={apply}>
        수정안 초안에 반영
      </Button>
    </section>
  );
}

export function SubscriptionRevision({
  editor,
  title,
  postId,
  targets,
  onApplied,
}: {
  editor: Editor;
  title: string;
  postId: string;
  targets: ReturnType<typeof revisionPassages>;
  onApplied: () => void;
}) {
  const url = `/api/admin/posts/${postId}/revision`;
  const latest = useApiResource(url, responseSchema);
  const job = latest.data?.job;
  const [provider, setProvider] = useState("chatgpt");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const doc = targets.document;
      if (!editor.state.doc.eq(doc))
        throw Error("본문이 바뀌었어요. 창을 다시 열어 주세요.");
      const blocks = Array.from({ length: doc.childCount }, (_, i) => {
        const node = doc.child(i);
        return {
          type: node.type.name,
          text:
            node.type.name === "image"
              ? String(node.attrs.alt || "이미지")
              : node.textBetween(0, node.content.size, "\n"),
        };
      });
      const revision = subscriptionRevisionInputSchema.parse({
        title,
        instructions,
        blocks,
        fingerprint: await fingerprint(doc),
      });
      await request(url, z.object({ id: z.uuid() }), "POST", {
        id: crypto.randomUUID(),
        provider,
        revision,
      });
      latest.reload();
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? "본문 분량이나 수정 지시의 길이를 확인해 주세요."
          : e instanceof Error
            ? e.message
            : "요청에 실패했어요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="management-form" onSubmit={submit}>
      <label>
        작성 서비스
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="chatgpt">ChatGPT 구독</option>
          <option value="claude">Claude 구독</option>
        </select>
      </label>
      <label>
        초안 수정 지시
        <textarea
          required
          rows={4}
          maxLength={1000}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="예: 공식 뉴스룸에서 제품 사진을 찾아 첫 문단 앞에 넣고, 구매 기준을 설명하는 부분을 먼저 보여줘."
        />
      </label>
      <Button type="submit" disabled={busy || !instructions.trim()}>
        수정안 요청
      </Button>
      {(error || latest.error) && <p role="alert">{error || latest.error}</p>}
      {job && (
        <section>
          <strong>최근 수정 요청</strong>
          <p>{job.input.instructions}</p>
          {job.state === "queued" && (
            <p>
              {job.provider === "claude"
                ? "맥에서 pnpm subscription:runner claude를 실행해 주세요."
                : "맥의 구독 실행기(watch)를 기다리고 있어요."}
            </p>
          )}
          {job.state === "writing" && <p>수정안을 작성하고 있어요.</p>}
          {job.state === "failed" && (
            <p role="alert">{job.error || "수정에 실패했어요."}</p>
          )}
          {job.result && (
            <Proposal
              key={job.id}
              job={job}
              editor={editor}
              url={url}
              onApplied={onApplied}
            />
          )}
        </section>
      )}
      {!job?.result && (
        <Button type="button" variant="outline" onClick={latest.reload}>
          수정 상태 새로고침
        </Button>
      )}
    </form>
  );
}
