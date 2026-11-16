import { Agent, getAgentByName } from "agents";
import {
  createPost,
  getPost,
  savePostQaReview,
  getSettings,
  ManagementError,
} from "@cloudflare-ai-blog/database";
import {
  agentDraftRequestSchema,
  agentPostQaRequestSchema,
  agentPostSeoRequestSchema,
  managedImageSrc,
  type AgentDraftRequest,
  type AiDraftSubjectSuggestion,
} from "@cloudflare-ai-blog/shared";
import { suggestDraftSubject } from "./generate-draft";
import { prepareDraft } from "./prepare-draft";
import { generatePostImages } from "./generate-cover";
import { reviewPost } from "./review-post";
import { suggestPostSeo } from "./suggest-post-seo";

type Draft = { id: string; title: string };
type DraftResult =
  | { draft: Draft }
  | { subjectToConfirm: AiDraftSubjectSuggestion }
  | { error: string; status: number };

async function retryDatabase<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const temporary =
        error instanceof Error &&
        /SQLITE_BUSY|Failed to get session commit token/i.test(error.message);
      if (!temporary || attempt === 2) throw error;
      await new Promise<void>((resolve) =>
        setTimeout(resolve, 50 * (attempt + 1)),
      );
    }
  }
}

export class MainAgent extends Agent<AgentServiceEnv> {
  private inFlight = new Map<string, Promise<DraftResult>>();

  async createDraft(request: AgentDraftRequest): Promise<DraftResult> {
    const id = request.requestId.toLowerCase();
    const operationKey = request.subject ? id : `${id}:subject`;
    const pending = this.inFlight.get(operationKey);
    if (pending) return pending;
    const operation = this.writeDraft({ ...request, requestId: id });
    this.inFlight.set(operationKey, operation);
    try {
      return await operation;
    } finally {
      this.inFlight.delete(operationKey);
    }
  }

  private async writeDraft(request: AgentDraftRequest): Promise<DraftResult> {
    const { DB } = this.env;
    const blogId = this.name;
    const findSavedDraft = () =>
      DB.prepare(
        "SELECT id,title FROM posts WHERE id=? AND blog_id=? AND origin='ai'",
      )
        .bind(request.requestId, blogId)
        .first<Draft>();
    try {
      const existing = await retryDatabase(findSavedDraft);
      if (existing) return { draft: existing };

      const category = request.categoryId
        ? await retryDatabase(() =>
            DB.prepare("SELECT name FROM categories WHERE id=? AND blog_id=?")
              .bind(request.categoryId, blogId)
              .first<{ name: string }>(),
          )
        : null;
      if (request.categoryId && !category)
        throw new ManagementError(
          400,
          "카테고리가 변경됐어요. 목록을 다시 불러와 주세요.",
        );

      const { subject } = request;
      if (!subject)
        return {
          subjectToConfirm: await suggestDraftSubject(this.env, request),
        };

      const { settings } = await retryDatabase(() => getSettings(DB, blogId));
      const draft = await prepareDraft(
        this.env,
        { ...request, subject },
        settings,
        category?.name ?? null,
      );
      const images = await generatePostImages(this.env, draft);
      const withMedia = <T extends { bytes: Uint8Array; alt: string }>(
        image: T,
      ) => {
        const id = crypto.randomUUID();
        return {
          ...image,
          id,
          key: `covers/${blogId}/${id}.jpg`,
          sizeBytes: image.bytes.byteLength,
        };
      };
      const cover = withMedia(images.cover);
      const inline = images.inline.map(withMedia);
      const media = [cover, ...inline];
      const inlineByHeading = new Map(
        inline.map((image) => [image.headingIndex, image]),
      );
      const content = {
        ...draft.content,
        content: draft.content.content.flatMap((node, index) => {
          const image = inlineByHeading.get(index);
          return image
            ? [
                node,
                {
                  type: "image",
                  attrs: { src: managedImageSrc(image.id), alt: image.alt },
                },
              ]
            : [node];
        }),
      };
      const bucket = this.env.BLOG_MEDIA;
      let committed = false;
      try {
        try {
          for (const image of media)
            await bucket.put(image.key, image.bytes, {
              httpMetadata: { contentType: "image/jpeg" },
            });
        } catch {
          throw new ManagementError(
            503,
            "게시글 이미지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
          );
        }

        const saved = await retryDatabase(async () => {
          // Reuse committed work when the final read fails or the request is replayed.
          const existing = await findSavedDraft();
          if (existing) return existing;
          const post = await createPost(
            DB,
            blogId,
            { ...draft, content, coverMediaId: cover.id, coverAlt: cover.alt },
            { id: request.requestId, origin: "ai", newMedia: media },
          );
          committed = true;
          return post;
        });
        return { draft: { id: saved.id, title: saved.title } };
      } finally {
        if (!committed) {
          try {
            // Media rows are inserted in one D1 batch, including the cover.
            const registered = await retryDatabase(() =>
              DB.prepare("SELECT 1 FROM media WHERE id=? AND blog_id=?")
                .bind(cover.id, blogId)
                .first(),
            );
            if (!registered) await bucket.delete(media.map(({ key }) => key));
          } catch {
            console.warn("AI image cleanup could not be verified", {
              requestId: request.requestId,
            });
          }
        }
      }
    } catch (error) {
      if (error instanceof ManagementError)
        return { error: error.message, status: error.status };
      console.error("AI draft generation failed", {
        requestId: request.requestId,
        error,
      });
      return {
        error: "초안을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
        status: 500,
      };
    }
  }
}

async function reviewSavedPost(request: Request, env: AgentServiceEnv) {
  const parsed = agentPostQaRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "올바른 QA 요청이 아니에요." },
      { status: 400 },
    );

  const { blogId, postId, expectedRevision } = parsed.data;
  try {
    const post = await retryDatabase(() => getPost(env.DB, blogId, postId));
    if (
      post.origin !== "ai" ||
      post.status === "published" ||
      post.revision !== expectedRevision
    )
      throw new ManagementError(
        409,
        "검토할 AI 초안의 최신 저장본을 확인해 주세요.",
      );

    const issues = await reviewPost(env, post);
    const review = await retryDatabase(() =>
      savePostQaReview(env.DB, blogId, postId, expectedRevision, issues),
    );
    return Response.json({ review });
  } catch (error) {
    if (error instanceof ManagementError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error("Publication QA failed", { postId, expectedRevision });
    return Response.json(
      { error: "발행 전 QA를 완료하지 못했어요. 다시 시도해 주세요." },
      { status: 503 },
    );
  }
}

async function suggestSavedPostSeo(request: Request, env: AgentServiceEnv) {
  const parsed = agentPostSeoRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "올바른 SEO 요청이 아니에요." },
      { status: 400 },
    );

  const { blogId, postId, expectedRevision } = parsed.data;
  try {
    const post = await retryDatabase(() => getPost(env.DB, blogId, postId));
    if (post.status === "published" || post.revision !== expectedRevision)
      throw new ManagementError(
        409,
        "편집할 글의 최신 저장본을 확인해 주세요.",
      );

    const suggestion = await suggestPostSeo(env, post);
    return Response.json({ revision: post.revision, suggestion });
  } catch (error) {
    if (error instanceof ManagementError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error("Post SEO suggestion failed", { postId, expectedRevision });
    return Response.json(
      { error: "SEO 제안을 생성하지 못했어요. 다시 시도해 주세요." },
      { status: 503 },
    );
  }
}

export default {
  async fetch(request: Request, env: AgentServiceEnv) {
    const { pathname } = new URL(request.url);
    if (
      request.method !== "POST" ||
      !["/drafts", "/post-qa", "/post-seo"].includes(pathname)
    )
      return new Response(null, { status: 404 });
    if (
      request.headers.has("origin") ||
      request.headers.get("content-type") !== "application/json"
    )
      return new Response(null, { status: 403 });

    if (pathname === "/post-qa") return reviewSavedPost(request, env);
    if (pathname === "/post-seo") return suggestSavedPostSeo(request, env);

    const input = agentDraftRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!input.success)
      return Response.json(
        { error: "올바른 글 생성 요청이 아니에요." },
        { status: 400 },
      );

    const { blogId, ...draftRequest } = input.data;
    const local = new URL(request.url).origin === "http://127.0.0.1:8789";
    if (local && draftRequest.subject && !draftRequest.chatGptTicket)
      return Response.json(
        {
          error:
            "로컬 초안을 저장하려면 관리자 화면에서 ChatGPT 본문 작성 모델을 선택해 주세요.",
        },
        { status: 400 },
      );
    if (draftRequest.chatGptTicket && !local)
      return Response.json(
        { error: "ChatGPT 본문 생성은 로컬에서 사용할 수 있어요." },
        { status: 403 },
      );
    try {
      const agent = await getAgentByName(env.MAIN_AGENT, blogId);
      const result = await agent.createDraft(draftRequest);
      if ("error" in result)
        return Response.json(
          { error: result.error },
          { status: result.status },
        );
      return Response.json("draft" in result ? result.draft : result);
    } catch (error) {
      console.error("Main Agent unavailable", {
        requestId: draftRequest.requestId,
        error,
      });
      return Response.json(
        {
          error:
            "AI 글쓰기 서비스를 실행하지 못했어요. 잠시 후 다시 시도해 주세요.",
        },
        { status: 503 },
      );
    }
  },
} satisfies ExportedHandler<AgentServiceEnv>;
