import { Agent, getAgentByName } from "agents";
import {
  createPost,
  getSettings,
  ManagementError,
} from "@cloudflare-ai-blog/database";
import {
  agentDraftRequestSchema,
  type AiDraftRequest,
} from "@cloudflare-ai-blog/shared";
import { generateDraft } from "./generate-draft";

type Draft = { id: string; title: string };
type DraftResult = { draft: Draft } | { error: string; status: number };

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

  async createDraft(request: AiDraftRequest): Promise<DraftResult> {
    const id = request.requestId.toLowerCase();
    const pending = this.inFlight.get(id);
    if (pending) return pending;
    const operation = this.writeDraft({ ...request, requestId: id });
    this.inFlight.set(id, operation);
    try {
      return await operation;
    } finally {
      this.inFlight.delete(id);
    }
  }

  private async writeDraft(request: AiDraftRequest): Promise<DraftResult> {
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

      const { settings } = await retryDatabase(() => getSettings(DB, blogId));
      const draft = await generateDraft(
        this.env,
        request,
        settings,
        category?.name ?? null,
      );
      const saved = await retryDatabase(async () => {
        // A save can succeed before its final read fails. Look up the same ID before retrying.
        const existing = await findSavedDraft();
        if (existing) return existing;
        return createPost(DB, blogId, draft, {
          id: request.requestId,
          origin: "ai",
        });
      });
      return { draft: { id: saved.id, title: saved.title } };
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

export default {
  async fetch(request: Request, env: AgentServiceEnv) {
    if (
      request.method !== "POST" ||
      new URL(request.url).pathname !== "/drafts"
    )
      return new Response(null, { status: 404 });
    if (
      request.headers.has("origin") ||
      request.headers.get("content-type") !== "application/json"
    )
      return new Response(null, { status: 403 });

    const input = agentDraftRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!input.success)
      return Response.json(
        { error: "올바른 글 생성 요청이 아니에요." },
        { status: 400 },
      );

    const { blogId, ...draftRequest } = input.data;
    try {
      const agent = await getAgentByName(env.MAIN_AGENT, blogId);
      const result = await agent.createDraft(draftRequest);
      return "draft" in result
        ? Response.json(result.draft)
        : Response.json({ error: result.error }, { status: result.status });
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
