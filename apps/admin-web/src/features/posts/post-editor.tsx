"use client";

import {
  EditorContent,
  useEditor,
  useEditorState,
  type JSONContent,
} from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { NodeSelection } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  internalPostHref,
  managedImageId,
  sourceImageCredit,
} from "@cloudflare-ai-blog/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AiRevision } from "./ai-revision";
import { SeoSuggestion } from "./seo-suggestion";
import { citationLabel } from "./ai-revision-passage";
import { createEditorExtensions } from "./editor-extensions";
import {
  draftKey,
  emptyContent,
  emptyFields,
  isWebUrl,
  makeSlug,
  parseLocalDraft,
  validateContent,
  validateFields,
  type DraftFields,
  type LocalDraft,
} from "./editor-model";
import {
  categoriesResponseSchema,
  postResponseSchema,
  postInputSchema,
  postPublicationResponseSchema,
  postQaResponseSchema,
  validationMessages,
  type PostDetail,
  type PostPublication,
} from "@cloudflare-ai-blog/shared";
import { uploadBlogImage } from "@/lib/upload-blog-image";
import { useApiResource } from "../management/use-api-resource";
import { statusLabels } from "./post-status";

function collectEditorSources(document: JSONContent | undefined) {
  const sources = new Map<string, { label: string; href: string }>();

  function visit(node: JSONContent) {
    const label = node.text?.trim();
    const href = node.marks?.find(({ type }) => type === "link")?.attrs?.href;
    if (
      label &&
      citationLabel.test(label) &&
      typeof href === "string" &&
      isWebUrl(href)
    )
      sources.set(label + href, { label, href });
    node.content?.forEach(visit);
  }

  if (document) visit(document);
  return [...sources.values()].sort(
    (a, b) => Number(a.label.slice(1, -1)) - Number(b.label.slice(1, -1)),
  );
}

function coverImageSource(fields: DraftFields) {
  if (fields.coverMediaId)
    return "/api/admin/media/" + encodeURIComponent(fields.coverMediaId);
  return isWebUrl(fields.coverUrl) ? fields.coverUrl : "";
}

function CoverImage({ fields }: { fields: DraftFields }) {
  const src = coverImageSource(fields);
  if (!src) return null;
  // The browser must send its session cookie to preview a private R2 image.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="cover-preview"
      src={src}
      alt={fields.coverAlt}
      referrerPolicy="no-referrer"
    />
  );
}

function Preview({
  fields,
  content,
  blogUrl,
}: {
  fields: DraftFields;
  content: JSONContent;
  blogUrl?: string;
}) {
  const viewer = useEditor({
    extensions: createEditorExtensions(),
    content,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      handleClick: (_view, _pos, event) => {
        if (!(event.target instanceof Element) || event.button !== 0)
          return false;
        const href = internalPostHref(
          event.target.closest("a")?.getAttribute("href"),
        );
        if (!href) return false;
        event.preventDefault();
        if (blogUrl && isWebUrl(blogUrl))
          window.open(
            new URL(href, blogUrl).href,
            "_blank",
            "noopener,noreferrer",
          );
        return true;
      },
    },
  });
  return (
    <article className="draft-preview">
      <p className="eyebrow">{fields.category} · 관리자 미리보기</p>
      <h1>{fields.title || "제목 없는 초안"}</h1>
      <CoverImage fields={fields} />
      <EditorContent editor={viewer} />
    </article>
  );
}

export function PostEditor({
  postId,
  blogUrl,
}: {
  postId?: string;
  blogUrl?: string;
}) {
  return postId ? (
    <ExistingPostEditor postId={postId} blogUrl={blogUrl} />
  ) : (
    <EditorForm />
  );
}
function ExistingPostEditor({
  postId,
  blogUrl,
}: {
  postId: string;
  blogUrl?: string;
}) {
  const resource = useApiResource(
    "/api/admin/posts/" + encodeURIComponent(postId),
    postResponseSchema,
  );
  if (!resource.ready) return <p role="status">게시글을 불러오는 중이에요.</p>;
  if (resource.error)
    return (
      <div role="alert" className="editor-errors">
        <p>{resource.error}</p>
        <Button onClick={resource.reload}>다시 불러오기</Button>
        <Link href="/posts">목록으로</Link>
      </div>
    );
  if (!resource.data) return null;
  return (
    <EditorForm key={postId} post={resource.data.post} blogUrl={blogUrl} />
  );
}
function EditorForm({
  post,
  blogUrl,
}: {
  post?: PostDetail;
  blogUrl?: string;
}) {
  const router = useRouter();
  const categories = useApiResource(
    "/api/admin/categories",
    categoriesResponseSchema,
  );
  const [revision, setRevision] = useState(post?.revision ?? 0);
  const [reviewing, setReviewing] = useState(false);
  const [qaError, setQaError] = useState("");
  const qaUrl = post?.origin === "ai" ? `/api/admin/posts/${post.id}/qa` : "";
  const qa = useApiResource(qaUrl, postQaResponseSchema);
  const savedReview = qa.data?.review;
  const currentReview = savedReview?.revision === revision ? savedReview : null;
  const qaPassed = currentReview?.issues.length === 0;
  const [postStatus, setPostStatus] = useState(post?.status ?? "draft");
  const [publishedAt, setPublishedAt] = useState(post?.publishedAt ?? null);
  const [fields, setFields] = useState<DraftFields>({
    ...emptyFields,
    title: post?.title ?? "",
    slug: post?.slug ?? "",
    category: post?.categoryId ?? "미분류",
    coverUrl: post?.coverUrl ?? "",
    coverMediaId: post?.coverMediaId ?? "",
    coverAlt: post?.coverAlt ?? "",
    seoTitle: post?.seoTitle ?? "",
    seoDescription: post?.seoDescription ?? "",
  });
  const [dirty, setDirty] = useState(false);
  const [bodyLength, setBodyLength] = useState(0);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [changingPublication, setChangingPublication] = useState(false);
  const [deletingDraft, setDeletingDraft] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverError, setCoverError] = useState("");
  const [availableDraft, setAvailableDraft] = useState<LocalDraft | null>(null);
  const [previewContent, setPreviewContent] = useState<JSONContent | null>(
    null,
  );
  const [insertMode, setInsertMode] = useState<
    "link" | "image" | "editImage" | null
  >(null);
  const [showSourceImages, setShowSourceImages] = useState(false);
  const [imageToEdit, setImageToEdit] = useState<{
    position: number;
    doc: ProseMirrorNode;
  } | null>(null);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [insertError, setInsertError] = useState("");
  const [confirmation, setConfirmation] = useState<
    { kind: "restore" } | { kind: "leave"; href: string } | null
  >(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const actionStatus = useRef<HTMLParagraphElement>(null);
  const restoreButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const allowLeave = useRef(false);
  const savingRef = useRef(false);
  const uploadingCoverRef = useRef(false);
  const storageKey = draftKey(post?.id ?? "new");
  const isPublished = postStatus === "published";
  const slugLocked = publishedAt !== null;
  const canDeleteDraft = !!post && postStatus === "draft" && !slugLocked;
  const publicationTarget = isPublished ? "private" : "published";
  const publicationLabel = isPublished
    ? "비공개 전환"
    : postStatus === "private"
      ? "다시 발행"
      : "발행";
  const publicationDisabled =
    !post ||
    dirty ||
    saving ||
    changingPublication ||
    deletingDraft ||
    uploadingCover ||
    reviewing ||
    (!isPublished && post.origin === "ai" && !qaPassed);
  const editor = useEditor({
    extensions: createEditorExtensions(),
    immediatelyRender: false,
    editable: !isPublished,
    content: post?.content ?? emptyContent,
    editorProps: {
      handleClick: (_view, _position, event) => {
        if (
          post?.origin !== "ai" ||
          event.button !== 0 ||
          !(event.target instanceof Element)
        )
          return false;
        const link = event.target.closest("a");
        if (
          !link ||
          !citationLabel.test(link.textContent.trim()) ||
          !isWebUrl(link.href)
        )
          return false;
        event.preventDefault();
        window.open(link.href, "_blank", "noopener,noreferrer");
        return true;
      },
      attributes: {
        role: "textbox",
        "aria-label": "본문",
        "aria-multiline": "true",
        class: "post-body",
      },
    },
    onUpdate: ({ editor: current }) => {
      setBodyLength(current.getText().length);
      setDirty(true);
      setMessage("");
    },
    onCreate: ({ editor: current }) => {
      setBodyLength(current.getText().length);
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) setAvailableDraft(parseLocalDraft(stored));
      } catch {
        setErrors([
          "브라우저 초안을 읽을 수 없어요. 저장소 접근 권한 또는 초안 손상 여부를 확인해 주세요. 기존 데이터는 유지됩니다.",
        ]);
      }
    },
  });
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold"),
      italic: current?.isActive("italic"),
      strike: current?.isActive("strike"),
      h2: current?.isActive("heading", { level: 2 }),
      h3: current?.isActive("heading", { level: 3 }),
      bullet: current?.isActive("bulletList"),
      ordered: current?.isActive("orderedList"),
      quote: current?.isActive("blockquote"),
      link: current?.isActive("link"),
      undo: current?.can().undo(),
      redo: current?.can().redo(),
      sources:
        post?.origin === "ai" ? collectEditorSources(current?.getJSON()) : [],
    }),
  });

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!allowLeave.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const onClick = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0 ||
        (anchor.hash && anchor.pathname === location.pathname)
      )
        return;
      if (
        anchor.href !== location.href &&
        ["http:", "https:"].includes(anchor.protocol)
      ) {
        event.preventDefault();
        event.stopPropagation();
        returnFocus.current = anchor;
        setConfirmation({ kind: "leave", href: anchor.href });
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  function update(key: keyof DraftFields, value: string) {
    setFields((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    setMessage("");
  }
  async function uploadCover(file: File) {
    if (isPublished || uploadingCoverRef.current || savingRef.current) return;
    setCoverError("");
    uploadingCoverRef.current = true;
    setUploadingCover(true);
    try {
      const { mediaId } = await uploadBlogImage(file);
      setFields((previous) => ({
        ...previous,
        coverUrl: "",
        coverMediaId: mediaId,
        coverAlt:
          previous.coverUrl || previous.coverMediaId ? "" : previous.coverAlt,
      }));
      setDirty(true);
      setMessage(
        "대표 이미지를 업로드했어요. 대체 텍스트를 확인한 뒤 초안을 저장해 주세요.",
      );
    } catch (error) {
      setCoverError(
        error instanceof Error
          ? error.message
          : "이미지를 업로드하지 못했어요.",
      );
    } finally {
      uploadingCoverRef.current = false;
      setUploadingCover(false);
    }
  }
  async function requestQa() {
    if (
      !qaUrl ||
      dirty ||
      reviewing ||
      saving ||
      changingPublication ||
      deletingDraft
    )
      return;
    setReviewing(true);
    setQaError("");
    try {
      await qa.mutate("POST", qaUrl, { expectedRevision: revision });
    } catch (error) {
      setQaError(
        error instanceof Error ? error.message : "검토를 요청하지 못했어요.",
      );
      qa.reload();
    } finally {
      setReviewing(false);
    }
  }

  async function saveDraft() {
    if (
      !editor ||
      isPublished ||
      savingRef.current ||
      uploadingCoverRef.current ||
      !categories.ready ||
      categories.error
    )
      return;
    const issues = [
      ...validateFields(fields),
      ...validateContent(editor.getJSON()),
    ];
    setErrors(issues);
    if (issues.length) return;
    savingRef.current = true;
    setSaving(true);
    try {
      editor.setEditable(false, false);
      const payload = postInputSchema.safeParse({
        title: fields.title,
        slug: fields.slug,
        categoryId: fields.category === "미분류" ? null : fields.category,
        content: editor.getJSON(),
        coverUrl: fields.coverUrl,
        coverMediaId: fields.coverMediaId || null,
        coverAlt: fields.coverAlt,
        seoTitle: fields.seoTitle,
        seoDescription: fields.seoDescription,
      });
      if (!payload.success) {
        setErrors(validationMessages(payload.error));
        return;
      }
      const response = await fetch(
        post ? "/api/admin/posts/" + post.id : "/api/admin/posts",
        {
          method: post ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            post
              ? { post: payload.data, expectedRevision: revision }
              : payload.data,
          ),
        },
      );
      const value = await response.json();
      if (!response.ok)
        throw new Error(
          value &&
            typeof value === "object" &&
            "error" in value &&
            typeof value.error === "string"
            ? value.error
            : "초안을 저장하지 못했어요.",
        );
      const saved = postResponseSchema.parse(value).post;
      setRevision(saved.revision);
      setFields((previous) => ({
        ...previous,
        title: saved.title,
        slug: saved.slug,
      }));
      setDirty(false);
      setMessage(
        postStatus === "private"
          ? "비공개 글을 저장했어요."
          : "로컬 D1에 초안을 저장했어요.",
      );
      if (!post) {
        allowLeave.current = true;
        router.replace("/posts/" + saved.id + "/edit");
      }
    } catch (error) {
      setErrors([
        error instanceof Error
          ? error.message
          : "저장하지 못했어요. 입력 내용은 유지됩니다.",
      ]);
    } finally {
      savingRef.current = false;
      setSaving(false);
      editor.setEditable(true, false);
    }
  }
  async function changePublication(status: PostPublication["status"]) {
    if (
      !post ||
      publicationDisabled ||
      savingRef.current ||
      uploadingCoverRef.current
    )
      return;

    savingRef.current = true;
    setChangingPublication(true);
    setErrors([]);
    setMessage("");
    editor?.setEditable(false, false);
    let editableAfterRequest = !isPublished;
    try {
      const response = await fetch(
        "/api/admin/posts/" + encodeURIComponent(post.id),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            expectedRevision: revision,
          } satisfies PostPublication),
        },
      );
      const value = await response.json();
      if (!response.ok) {
        const errorMessage =
          value && typeof value === "object" && "error" in value
            ? value.error
            : null;
        throw new Error(
          typeof errorMessage === "string"
            ? errorMessage
            : "발행 상태를 바꾸지 못했어요.",
        );
      }
      const publication = postPublicationResponseSchema.parse(value);
      setRevision(publication.revision);
      setPostStatus(publication.status);
      setPublishedAt(publication.publishedAt);
      setInsertMode(null);
      editableAfterRequest = publication.status !== "published";
      setMessage(
        editableAfterRequest
          ? "비공개 상태로 전환했어요."
          : "공개 블로그에 발행했어요.",
      );
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : "발행 상태를 바꾸지 못했어요.",
      ]);
    } finally {
      savingRef.current = false;
      setChangingPublication(false);
      editor?.setEditable(editableAfterRequest, false);
    }
  }
  async function removeDraft() {
    if (
      !post ||
      !canDeleteDraft ||
      savingRef.current ||
      uploadingCoverRef.current
    )
      return;

    savingRef.current = true;
    setDeletingDraft(true);
    setErrors([]);
    setMessage("");
    editor?.setEditable(false, false);
    try {
      const response = await fetch(
        "/api/admin/posts/" + encodeURIComponent(post.id),
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedRevision: revision }),
        },
      );
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        throw new Error(
          result &&
            typeof result === "object" &&
            "error" in result &&
            typeof result.error === "string"
            ? result.error
            : "초안을 삭제하지 못했어요.",
        );
      }
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : "초안을 삭제하지 못했어요.",
      ]);
      savingRef.current = false;
      setDeletingDraft(false);
      editor?.setEditable(true, false);
      return;
    }

    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Browser storage access can fail after the server has deleted the draft.
    }
    allowLeave.current = true;
    router.replace("/posts");
  }
  function restore() {
    if (
      !editor ||
      !availableDraft ||
      isPublished ||
      savingRef.current ||
      uploadingCoverRef.current
    )
      return;
    try {
      let category = availableDraft.fields.category;
      if (category !== "미분류") {
        const match = categories.data?.categories.find(
          (c) => c.id === category || c.name === category,
        );
        if (!match)
          throw new Error(
            "저장본의 카테고리가 없어 복원할 수 없어요. 카테고리를 먼저 확인해 주세요.",
          );
        category = match.id;
      }
      editor.commands.setContent(availableDraft.content, {
        emitUpdate: false,
        errorOnInvalidContent: true,
      });
      setBodyLength(editor.getText().length);
      setFields({
        ...availableDraft.fields,
        category,
        ...(slugLocked ? { slug: fields.slug } : {}),
      });
      setDirty(true);
      setErrors([]);
      setMessage(
        "브라우저 저장본을 불러왔어요. D1에 초안 저장을 눌러 반영하세요.",
      );
    } catch (error) {
      setErrors([
        error instanceof Error
          ? error.message
          : "본문 형식을 확인해 주세요. 저장본은 유지됩니다.",
      ]);
    }
  }
  function updateImage(remove: boolean) {
    if (!editor) return;
    const target = imageToEdit;
    if (!target || editor.state.doc !== target.doc) {
      setInsertError("본문이 변경됐어요. 이미지를 다시 선택해 주세요.");
      return;
    }
    const { position } = target;
    const image = target.doc.nodeAt(position);
    if (!image) return;
    const transaction = editor.state.tr;
    if (remove) transaction.delete(position, position + image.nodeSize);
    else
      transaction.setNodeMarkup(position, undefined, {
        ...image.attrs,
        src: url.trim(),
        alt: alt.trim(),
      });
    editor.view.dispatch(transaction);
    setInsertMode(null);
    setInsertError("");
    editor.commands.focus();
  }
  function insert() {
    if (!editor) return;
    const managed = insertMode === "editImage" && !!managedImageId(url.trim());
    const internal =
      insertMode === "link" ? internalPostHref(url.trim()) : null;
    if (!managed && !internal && !isWebUrl(url.trim())) {
      setInsertError(
        insertMode === "link"
          ? "http 또는 https 주소나 /posts/로 시작하는 게시글 주소를 입력해 주세요."
          : "올바른 http 또는 https 주소를 입력해 주세요.",
      );
      return;
    }
    if (insertMode !== "link" && !alt.trim()) {
      setInsertError("이미지를 설명하는 대체 텍스트를 입력해 주세요.");
      return;
    }
    if (managed && alt.trim().length > 500) {
      setInsertError("대체 텍스트를 500자 이내로 입력해 주세요.");
      return;
    }
    if (insertMode === "editImage") {
      updateImage(false);
      return;
    }
    if (insertMode === "image")
      editor
        .chain()
        .focus()
        .setImage({ src: url.trim(), alt: alt.trim() })
        .run();
    else if (editor.state.selection.empty && !editor.isActive("link")) {
      setInsertError("링크를 걸 본문 텍스트를 먼저 선택해 주세요.");
      return;
    } else
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: internal ?? url.trim() })
        .run();
    setInsertMode(null);
    setInsertError("");
  }
  function showPreview() {
    if (!editor) return;
    const issues = [
      ...validateContent(editor.getJSON()),
      ...(fields.coverUrl && !isWebUrl(fields.coverUrl)
        ? ["대표 이미지 URL을 확인해 주세요."]
        : []),
    ];
    setErrors(issues);
    if (issues.length) return;
    setPreviewContent(editor.getJSON());
  }
  const tool = (
    label: string,
    run: () => void,
    active = false,
    disabled = false,
  ) => (
    <button
      key={label}
      type="button"
      aria-pressed={active}
      disabled={!editor || disabled}
      onClick={run}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="posts-heading">
        <div className="page-heading">
          <p className="eyebrow">WRITE YOUR STORY</p>
          <h1>
            {isPublished ? "발행 글 관리" : post ? "게시글 수정" : "새 글 작성"}
          </h1>
          <p>
            {isPublished
              ? "저장한 글을 확인하고 비공개로 전환할 수 있어요."
              : post
                ? "저장한 글을 수정하고 로컬 D1에 반영하세요."
                : "생각을 글로 옮기고, 발행 전 모습을 확인하세요."}
          </p>
        </div>
        <div className="dashboard-actions">
          {post?.origin === "ai" && (
            <Link
              className="outline-button"
              href={`/ai-writing/logs?requestId=${post.id}`}
            >
              생성 로그
            </Link>
          )}
          <Link className="outline-button" href="/posts">
            목록으로
          </Link>
        </div>
      </div>
      <div className="demo-notice">
        <p>
          <strong>현재 상태 {statusLabels[postStatus]}</strong> · 발행한 글은
          공개 블로그에 표시돼요.
        </p>
      </div>
      {categories.error && (
        <div role="alert" className="editor-errors">
          <p>{categories.error}</p>
          <Button onClick={categories.reload}>카테고리 다시 불러오기</Button>
        </div>
      )}
      {availableDraft && !isPublished && (
        <div className="restore-banner">
          <span>
            이 글의 브라우저 저장본이 있어요.{" "}
            <time dateTime={availableDraft.savedAt}>
              {new Intl.DateTimeFormat("ko-KR", {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: "Asia/Seoul",
              }).format(new Date(availableDraft.savedAt))}
            </time>
          </span>
          <button
            ref={restoreButton}
            disabled={
              !categories.ready ||
              !!categories.error ||
              saving ||
              changingPublication ||
              deletingDraft ||
              uploadingCover
            }
            className="outline-button"
            type="button"
            onClick={() => {
              if (dirty) {
                returnFocus.current = restoreButton.current;
                setConfirmation({ kind: "restore" });
              } else restore();
            }}
          >
            저장본 불러오기
          </button>
        </div>
      )}
      {errors.length > 0 && (
        <div className="editor-errors" role="alert">
          <strong>입력 내용을 확인해 주세요.</strong>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      <fieldset
        disabled={saving || changingPublication || deletingDraft || isPublished}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <div className="editor-grid">
          <section className="editor-main" aria-label="글 작성">
            <label className="field-label" htmlFor="post-title">
              제목 <span>필수</span>
            </label>
            <input
              id="post-title"
              className="title-input"
              value={fields.title}
              maxLength={200}
              placeholder="제목을 입력하세요"
              onChange={(e) => update("title", e.target.value)}
            />
            <div className="body-label">
              <h2>본문</h2>
              <span>{bodyLength}자</span>
            </div>
            {!!post?.sourceImages.length && (
              <details
                className="mb-4 rounded-md border p-3"
                onToggle={(event) =>
                  setShowSourceImages(event.currentTarget.open)
                }
              >
                <summary className="cursor-pointer font-semibold">
                  참고 출처 이미지 ({post.sourceImages.length}장)
                </summary>
                <p className="mt-2 text-sm">
                  원문에서 찾은 이미지예요. 재사용 조건을 확인한 뒤 본문에
                  추가할 수 있어요.
                </p>
                {showSourceImages && (
                  <ul className="mt-3 grid max-h-96 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                    {post.sourceImages.map((image) => (
                      <li
                        key={image.url}
                        className="space-y-2 rounded-md border p-3 text-sm"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.url}
                          alt={image.alt || image.caption || "참고 출처 이미지"}
                          width={256}
                          height={144}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="aspect-video w-full rounded bg-muted object-contain"
                        />
                        <p>
                          {image.caption ||
                            image.alt ||
                            image.title ||
                            new URL(image.pageUrl).hostname}
                        </p>
                        <p>{image.license ?? "재사용 조건 확인 필요"}</p>
                        <div className="empty-actions">
                          <a
                            href={image.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            이미지 열기
                          </a>
                          <a
                            href={image.pageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            원문 보기
                          </a>
                          {!isPublished && (
                            <button
                              type="button"
                              className="outline-button"
                              disabled={
                                !editor ||
                                saving ||
                                deletingDraft ||
                                changingPublication
                              }
                              onClick={() => {
                                if (!editor) return;
                                const applied = editor
                                  .chain()
                                  .focus()
                                  .insertContent([
                                    {
                                      type: "image",
                                      attrs: {
                                        src: image.url,
                                        alt:
                                          image.alt ||
                                          image.caption ||
                                          "참고 출처 이미지",
                                      },
                                    },
                                    sourceImageCredit(image),
                                  ])
                                  .run();
                                if (applied)
                                  setMessage(
                                    "본문에 이미지를 추가했어요. 대체 텍스트와 위치를 확인한 뒤 저장해 주세요.",
                                  );
                              }}
                            >
                              본문에 추가
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            )}
            <div className="editor-toolbar" role="group" aria-label="본문 서식">
              {tool("문단", () => editor?.chain().focus().setParagraph().run())}
              {tool(
                "H2",
                () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
                state?.h2,
              )}
              {tool(
                "H3",
                () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
                state?.h3,
              )}
              {tool(
                "굵게",
                () => editor?.chain().focus().toggleBold().run(),
                state?.bold,
              )}
              {tool(
                "기울임",
                () => editor?.chain().focus().toggleItalic().run(),
                state?.italic,
              )}
              {tool(
                "취소선",
                () => editor?.chain().focus().toggleStrike().run(),
                state?.strike,
              )}
              {tool(
                "글머리 목록",
                () => editor?.chain().focus().toggleBulletList().run(),
                state?.bullet,
              )}
              {tool(
                "번호 목록",
                () => editor?.chain().focus().toggleOrderedList().run(),
                state?.ordered,
              )}
              {tool(
                "인용",
                () => editor?.chain().focus().toggleBlockquote().run(),
                state?.quote,
              )}
              {tool("구분선", () =>
                editor?.chain().focus().setHorizontalRule().run(),
              )}
              {tool(
                "링크",
                () => {
                  setInsertMode("link");
                  setUrl(editor?.getAttributes("link").href ?? "");
                  setInsertError("");
                },
                state?.link,
              )}
              {tool(
                "링크 해제",
                () =>
                  editor
                    ?.chain()
                    .focus()
                    .extendMarkRange("link")
                    .unsetLink()
                    .run(),
                false,
                !state?.link,
              )}
              {tool("이미지", () => {
                if (!editor) return;
                const { selection, doc } = editor.state;
                if (
                  selection instanceof NodeSelection &&
                  selection.node.type.name === "image"
                ) {
                  setImageToEdit({ position: selection.from, doc });
                  setInsertMode("editImage");
                  setUrl(selection.node.attrs.src ?? "");
                  setAlt(selection.node.attrs.alt ?? "");
                } else {
                  setImageToEdit(null);
                  setInsertMode("image");
                  setUrl("");
                  setAlt("");
                }
                setInsertError("");
              })}
              {tool(
                "실행 취소",
                () => editor?.chain().focus().undo().run(),
                false,
                !state?.undo,
              )}
              {tool(
                "다시 실행",
                () => editor?.chain().focus().redo().run(),
                false,
                !state?.redo,
              )}
              {post && (
                <AiRevision
                  postId={post.id}
                  editor={editor}
                  title={fields.title}
                  disabled={
                    isPublished ||
                    saving ||
                    changingPublication ||
                    deletingDraft
                  }
                  onApplied={() =>
                    setMessage(
                      "AI 수정안을 반영했어요. 내용을 확인한 뒤 저장해 주세요.",
                    )
                  }
                />
              )}
            </div>
            {insertMode && (
              <div className="insert-panel">
                <label>
                  {insertMode === "link" ? "링크 URL" : "본문 이미지 URL"}
                  <input
                    type={insertMode === "image" ? "url" : "text"}
                    value={url}
                    placeholder="https://"
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </label>
                {insertMode !== "link" && (
                  <label>
                    본문 이미지 대체 텍스트
                    <input
                      value={alt}
                      onChange={(e) => setAlt(e.target.value)}
                    />
                  </label>
                )}
                {insertError && <p role="alert">{insertError}</p>}
                <div className="empty-actions">
                  <button
                    className="outline-button"
                    type="button"
                    onClick={insert}
                  >
                    적용
                  </button>
                  <button
                    className="outline-button"
                    type="button"
                    onClick={() => setInsertMode(null)}
                  >
                    취소
                  </button>
                  {insertMode === "editImage" && (
                    <button
                      className="outline-button"
                      type="button"
                      onClick={() => updateImage(true)}
                    >
                      이미지 삭제
                    </button>
                  )}
                </div>
              </div>
            )}
            {!editor && <p role="status">편집기를 불러오는 중이에요.</p>}
            <EditorContent editor={editor} />
            {!!state?.sources.length && (
              <section
                aria-label="초안 참고 출처"
                className="mt-5 border-t pt-4"
              >
                <h2 className="mb-2 text-sm font-semibold">참고 출처</h2>
                <ul className="space-y-2 text-sm">
                  {state.sources.map(({ label, href }) => (
                    <li key={label + href}>
                      <a
                        className="break-all underline"
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {label} {href}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </section>
          <aside className="editor-settings" aria-label="글 설정">
            <section>
              <h2>글 설정</h2>
              <label>
                슬러그
                <input
                  value={fields.slug}
                  disabled={slugLocked}
                  maxLength={120}
                  onChange={(e) => update("slug", e.target.value)}
                />
              </label>
              {slugLocked ? (
                <p className="field-help">
                  처음 발행한 뒤에는 URL 유지를 위해 슬러그를 잠가요.
                </p>
              ) : (
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => update("slug", makeSlug(fields.title))}
                >
                  제목으로 슬러그 만들기
                </button>
              )}
              <p className="field-help">
                저장할 때 블로그 내 슬러그 중복을 검사해요.
              </p>
              <label>
                카테고리
                <select
                  value={fields.category}
                  onChange={(e) => update("category", e.target.value)}
                >
                  <option value="미분류">미분류</option>
                  {categories.data?.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </section>
            <section>
              <h2>대표 이미지</h2>
              <label>
                대표 이미지 파일
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadingCover}
                  aria-describedby="cover-formats"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file) void uploadCover(file);
                  }}
                />
              </label>
              <p className="field-help" id="cover-formats">
                JPG, PNG, WebP · 최대 5MB
              </p>
              {uploadingCover && <p role="status">대표 이미지 업로드 중…</p>}
              {coverError && (
                <p role="alert" className="editor-errors">
                  {coverError}
                </p>
              )}
              {fields.coverMediaId ? (
                <button
                  type="button"
                  className="outline-button"
                  disabled={uploadingCover}
                  onClick={() => {
                    update("coverMediaId", "");
                    update("coverAlt", "");
                    setCoverError("");
                  }}
                >
                  업로드 이미지 해제
                </button>
              ) : (
                <label>
                  또는 대표 이미지 URL
                  <input
                    type="url"
                    value={fields.coverUrl}
                    placeholder="https://"
                    disabled={uploadingCover}
                    onChange={(event) => update("coverUrl", event.target.value)}
                  />
                </label>
              )}
              <label>
                대표 이미지 대체 텍스트
                <input
                  value={fields.coverAlt}
                  maxLength={500}
                  disabled={uploadingCover}
                  onChange={(event) => update("coverAlt", event.target.value)}
                />
              </label>
              {fields.coverMediaId && <CoverImage fields={fields} />}
            </section>
            <section>
              <h2>검색엔진 설정</h2>
              <label>
                SEO 제목
                <input
                  value={fields.seoTitle}
                  maxLength={100}
                  placeholder="비워두면 글 제목 사용"
                  onChange={(e) => update("seoTitle", e.target.value)}
                />
              </label>
              <label>
                SEO 설명
                <textarea
                  value={fields.seoDescription}
                  maxLength={300}
                  rows={4}
                  onChange={(e) => update("seoDescription", e.target.value)}
                />
              </label>
              <p className="field-help">
                {fields.seoDescription.length}/300자 · 발행한 글의 메타데이터에
                사용돼요.
              </p>
              {post && !isPublished && (
                <SeoSuggestion
                  key={revision}
                  postId={post.id}
                  revision={revision}
                  dirty={dirty}
                  disabled={
                    saving ||
                    changingPublication ||
                    deletingDraft ||
                    uploadingCover ||
                    reviewing
                  }
                  onApply={(suggestion) => {
                    setFields((previous) => ({ ...previous, ...suggestion }));
                    setDirty(true);
                    setMessage(
                      "SEO 제안을 적용했어요. 내용을 확인한 뒤 저장해 주세요.",
                    );
                  }}
                />
              )}
            </section>
          </aside>
        </div>
      </fieldset>
      <div className="editor-actionbar">
        <p ref={actionStatus} role="status" tabIndex={-1}>
          {deletingDraft
            ? "초안을 삭제하고 있어요."
            : changingPublication
              ? "발행 상태를 변경하고 있어요."
              : message || (dirty ? "저장하지 않은 변경 사항이 있어요." : "")}
        </p>
        <div>
          <button
            ref={previewButton}
            type="button"
            className="outline-button"
            disabled={
              !editor || uploadingCover || changingPublication || deletingDraft
            }
            onClick={showPreview}
          >
            미리보기
          </button>
          {!isPublished && (
            <button
              type="button"
              className="primary-link"
              disabled={
                !editor ||
                saving ||
                changingPublication ||
                deletingDraft ||
                uploadingCover ||
                !categories.ready ||
                !!categories.error
              }
              onClick={saveDraft}
            >
              {saving
                ? "저장 중…"
                : postStatus === "private"
                  ? "비공개 글 저장"
                  : "D1에 초안 저장"}
            </button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="outline-button"
                disabled={publicationDisabled}
                aria-describedby="publish-note"
              >
                {publicationLabel}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent
              className="management-dialog"
              onCloseAutoFocus={(event) => {
                if (savingRef.current) {
                  event.preventDefault();
                  actionStatus.current?.focus();
                }
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {isPublished
                    ? "비공개로 전환할까요?"
                    : "저장한 글을 발행할까요?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {isPublished
                    ? "공개 블로그에서 글을 내리고 다시 편집할 수 있어요."
                    : "현재 저장된 버전을 공개 블로그에 올려요. 처음 발행하면 글 주소가 잠겨요."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void changePublication(publicationTarget)}
                >
                  {publicationLabel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {canDeleteDraft && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="outline-button"
                  disabled={
                    saving ||
                    changingPublication ||
                    uploadingCover ||
                    deletingDraft
                  }
                >
                  초안 삭제
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent
                className="management-dialog"
                onCloseAutoFocus={(event) => {
                  if (savingRef.current) {
                    event.preventDefault();
                    actionStatus.current?.focus();
                  }
                }}
              >
                <AlertDialogHeader>
                  <AlertDialogTitle>이 초안을 삭제할까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    삭제한 초안은 복구할 수 없어요.
                    {dirty && " 저장하지 않은 수정 내용도 사라져요."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction
                    className={buttonVariants({ variant: "destructive" })}
                    onClick={() => void removeDraft()}
                  >
                    초안 삭제
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        {qaUrl && !isPublished && (
          <section
            className="sample-result w-full min-w-0"
            aria-label="발행 전 QA"
          >
            <h3>발행 전 QA</h3>
            <p role="status">
              {dirty
                ? "글을 저장한 뒤 검토를 요청해 주세요."
                : reviewing
                  ? "저장된 본문과 인용 원문을 대조하고 있어요."
                  : qa.loading
                    ? "저장된 검토 결과를 불러오고 있어요."
                    : currentReview
                      ? currentReview.issues.length
                        ? "수정 필요"
                        : "통과"
                      : "검토 대기"}
            </p>
            {(qaError || qa.error) && (
              <p className="editor-errors" role="alert">
                {qaError || qa.error}
              </p>
            )}
            {!dirty && currentReview && currentReview.issues.length > 0 && (
              <ul>
                {currentReview.issues.map(
                  ({ excerpt, reason, sources }, index) => (
                    <li key={index}>
                      <strong>{excerpt}</strong>
                      <p>{reason}</p>
                      {sources.filter(isWebUrl).map((href) => (
                        <p key={href}>
                          <a
                            className="text-primary underline"
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {new URL(href).hostname}
                          </a>
                        </p>
                      ))}
                    </li>
                  ),
                )}
              </ul>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={
                  dirty ||
                  reviewing ||
                  saving ||
                  changingPublication ||
                  deletingDraft ||
                  uploadingCover
                }
                onClick={() => void requestQa()}
              >
                {currentReview ? "다시 검토" : "QA 검토 요청"}
              </Button>
            </div>
          </section>
        )}
        <small id="publish-note">
          {!post || dirty
            ? "먼저 글을 저장해 주세요."
            : isPublished
              ? "글을 수정하려면 비공개로 전환해 주세요."
              : post.origin === "ai" && !qaPassed
                ? "최신 저장본이 발행 전 QA를 통과하면 발행할 수 있어요."
                : "현재 저장된 버전을 발행할 수 있어요."}
        </small>
      </div>
      <Dialog
        open={previewContent !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewContent(null);
        }}
      >
        <DialogContent
          className="management-dialog editor-preview-modal"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            previewButton.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>본문 미리보기</DialogTitle>
            <DialogDescription>
              본문 표현 확인용입니다. 공개 블로그 레이아웃은 별도로 구현합니다.
            </DialogDescription>
          </DialogHeader>
          {previewContent && (
            <Preview
              fields={{
                ...fields,
                category:
                  categories.data?.categories.find(
                    (c) => c.id === fields.category,
                  )?.name ?? "미분류",
              }}
              content={previewContent}
              blogUrl={blogUrl}
            />
          )}
          <Button variant="outline" onClick={() => setPreviewContent(null)}>
            미리보기 닫기
          </Button>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <AlertDialogContent
          className="management-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation?.kind === "restore"
                ? "저장한 초안으로 바꿀까요?"
                : "저장하지 않고 이동할까요?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.kind === "restore"
                ? "현재 편집 중인 내용은 브라우저에 저장한 초안으로 대체됩니다."
                : "저장하지 않은 변경 사항이 있어요. 이동하면 마지막 저장 이후의 변경 내용은 사라집니다."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmation?.kind === "restore") restore();
                else if (confirmation?.kind === "leave") {
                  const destination = new URL(confirmation.href);
                  if (destination.origin === location.origin) {
                    setDirty(false);
                    router.push(
                      destination.pathname +
                        destination.search +
                        destination.hash,
                    );
                  } else {
                    allowLeave.current = true;
                    location.assign(destination.href);
                  }
                }
              }}
            >
              {confirmation?.kind === "restore"
                ? "저장본 불러오기"
                : "저장하지 않고 이동"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
