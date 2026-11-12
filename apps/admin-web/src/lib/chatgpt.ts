import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ManagementError } from "@cloudflare-ai-blog/database";
import { aiDraftSubjectSchema } from "@cloudflare-ai-blog/shared";
import { z } from "zod";
import { createRemoteJWKSet, jwtVerify } from "jose";

const issuer = "https://auth.openai.com";
const resource = "https://api.openai.com/v1";
const callbackUri = "http://127.0.0.1:3001/api/admin/chatgpt/callback";
const adminOrigins = ["http://localhost:3001", "http://127.0.0.1:3001"];
const scope =
  "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const jwks = createRemoteJWKSet(new URL("/.well-known/jwks.json", issuer));
const localStore = resolve(".wrangler", "chatgpt");
const exchangeSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  id_token: z.string().min(1).optional(),
  expires_in: z.number().positive(),
  token_type: z.string().regex(/^bearer$/i),
  scope: z.string(),
});

type Admin = { userId: string; secret: string };
const sessionSchema = z.object({
  clientId: z.string().min(1),
  subject: z.string().min(1),
  email: z.string().nullable(),
  idToken: z.string().min(1),
  tokens: exchangeSchema,
  expiresAt: z.number(),
});
type Session = z.infer<typeof sessionSchema>;
type Pending = {
  admin: Admin;
  origin: string;
  nonce: string;
  verifier: string;
  previous: Session | null;
  expiresAt: number;
};
type Ticket = {
  admin: Admin;
  model: string;
  uses: number;
  searchUsed?: boolean;
  expiresAt: number;
};

const globals = globalThis as typeof globalThis & {
  localBlogChatGpt?: {
    pending: Map<string, Pending>;
    tickets: Map<string, Ticket>;
    refreshing: Map<string, Promise<Session>>;
  };
};
const runtime = (globals.localBlogChatGpt ??= {
  pending: new Map(),
  tickets: new Map(),
  refreshing: new Map(),
});

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function remember<T extends { expiresAt: number }>(
  map: Map<string, T>,
  key: string,
  value: T,
) {
  for (const [id, entry] of map) {
    if (entry.expiresAt <= Date.now()) map.delete(id);
  }
  map.set(key, value);
}

export function isLocalChatGptRequest(request: Request) {
  return (
    process.env.NODE_ENV === "development" &&
    adminOrigins.includes(new URL(request.url).origin)
  );
}

export function isChatGptLoopback(request: Request) {
  return (
    isLocalChatGptRequest(request) &&
    request.headers.get("host") === "127.0.0.1:3001"
  );
}

function sessionPath(admin: Admin) {
  const id = createHash("sha256").update(admin.userId).digest("hex");
  return join(localStore, id + ".json");
}

function sessionKey(admin: Admin) {
  return createHash("sha256")
    .update("cloudflare-ai-blog/chatgpt/v1\0")
    .update(admin.secret)
    .digest();
}

async function readSession(admin: Admin): Promise<Session | null> {
  const target = sessionPath(admin);
  let bytes: Buffer;
  try {
    bytes = await readFile(target);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    console.warn("ChatGPT local connection could not be read", { code });
    throw new ManagementError(
      503,
      "ChatGPT 연결 저장소에 접근할 수 없어요. 관리자 개발 서버의 로컬 파일 접근 권한을 확인해 주세요.",
    );
  }

  // 인증 비밀키가 바뀌었거나 파일이 손상되면 새 연결을 허용한다.
  // 새 OAuth 승인이 완료될 때만 기존 파일을 교체한다.
  if (bytes.length < 29) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      sessionKey(admin),
      bytes.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(admin.userId));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const value: unknown = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString(),
    );
    return sessionSchema.safeParse(value).data ?? null;
  } catch {
    return null;
  }
}

async function saveSession(admin: Admin, session: Session) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionKey(admin), iv);
  cipher.setAAD(Buffer.from(admin.userId));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session)),
    cipher.final(),
  ]);
  const target = sessionPath(admin);
  const temporary = target + "." + randomUUID() + ".tmp";
  await mkdir(localStore, { recursive: true, mode: 0o700 });
  try {
    await writeFile(
      temporary,
      Buffer.concat([iv, cipher.getAuthTag(), encrypted]),
      { mode: 0o600, flag: "wx" },
    );
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function hostId() {
  const path = join(localStore, "host-id");
  await mkdir(localStore, { recursive: true, mode: 0o700 });
  try {
    await writeFile(path, "urn:uuid:" + randomUUID(), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return readFile(path, "utf8");
}

export async function beginChatGptSignIn(admin: Admin, origin: string) {
  const [previous, host] = await Promise.all([readSession(admin), hostId()]);
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken();
  remember(runtime.pending, state, {
    admin,
    origin,
    nonce,
    verifier,
    previous,
    expiresAt: Date.now() + 10 * 60_000,
  });
  const authorization = new URL("/api/accounts/authorize", issuer);
  authorization.search = new URLSearchParams({
    client_id: previous?.clientId ?? "dynamic_agent_client",
    ...(previous
      ? previous.email
        ? { login_hint: previous.email }
        : {}
      : { agent_name_hint: "Cloudflare AI Blog" }),
    ext_agent_host_id: host,
    response_type: "code",
    redirect_uri: callbackUri,
    scope,
    resource,
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  }).toString();
  return authorization.href;
}

async function exchange(params: Record<string, string>) {
  const response = await fetch(issuer + "/api/accounts/oauth/token", {
    method: "POST",
    body: new URLSearchParams({ ...params, resource }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const error = z
      .object({ error: z.string() })
      .safeParse(await response.json().catch(() => null));
    if (error.data?.error === "invalid_grant")
      throw new ManagementError(401, "ChatGPT를 다시 연결해 주세요.");
    throw new ManagementError(502, "ChatGPT 연결을 갱신하지 못했어요.");
  }
  const tokens = exchangeSchema.parse(await response.json());
  if (!tokens.scope.split(/\s+/).includes("chatgpt.tokens.use.direct"))
    throw new ManagementError(403, "ChatGPT 구독 사용 권한을 승인해 주세요.");
  return tokens;
}

export async function finishChatGptSignIn(request: Request) {
  const query = new URL(request.url).searchParams;
  const state = query.get("state") ?? "";
  const pending = runtime.pending.get(state);
  runtime.pending.delete(state);
  if (!pending || pending.expiresAt <= Date.now())
    return new Response(
      "ChatGPT 연결 요청이 만료됐어요. 관리자 화면에서 다시 연결해 주세요.",
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );

  const destination = new URL("/ai-writing", pending.origin);
  try {
    const code = query.get("code");
    const returnedClient = query.get("client_id");
    const clientId = pending.previous?.clientId ?? returnedClient;
    if (
      query.has("error") ||
      !code ||
      !clientId ||
      clientId === "dynamic_agent_client" ||
      (returnedClient && clientId !== returnedClient)
    )
      throw new Error("Incomplete authorization");
    const tokens = await exchange({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      code_verifier: pending.verifier,
      redirect_uri: callbackUri,
    });
    if (!tokens.id_token) throw new Error("Missing identity token");
    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      algorithms: ["RS256"],
      issuer,
      audience: clientId,
      requiredClaims: ["sub", "exp", "iat"],
      clockTolerance: 5,
    });
    if (
      !payload.sub ||
      payload.nonce !== pending.nonce ||
      (pending.previous && pending.previous.subject !== payload.sub)
    )
      throw new Error("Unexpected ChatGPT identity");
    await saveSession(pending.admin, {
      clientId,
      subject: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      idToken: tokens.id_token,
      tokens,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });
  } catch {
    destination.searchParams.set(
      "chatgpt",
      query.get("error") === "access_denied" ? "denied" : "failed",
    );
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: destination.href,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function activeSession(admin: Admin) {
  const pending = runtime.refreshing.get(admin.userId);
  if (pending) return pending;

  const refresh = async () => {
    const session = await readSession(admin);
    if (!session)
      throw new ManagementError(401, "ChatGPT를 먼저 연결해 주세요.");
    if (session.expiresAt > Date.now() + 30_000) return session;
    const tokens = await exchange({
      grant_type: "refresh_token",
      client_id: session.clientId,
      refresh_token: session.tokens.refresh_token,
    });
    const updated = {
      ...session,
      tokens,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    };
    await saveSession(admin, updated);
    return updated;
  };
  const operation = refresh();
  runtime.refreshing.set(admin.userId, operation);
  try {
    return await operation;
  } finally {
    runtime.refreshing.delete(admin.userId);
  }
}

const catalogSchema = z.object({
  models: z.array(
    z.object({
      visibility: z.string(),
      slug: z.string(),
      display_name: z.string(),
    }),
  ),
});

export async function chatGptStatus(admin: Admin) {
  const session = await readSession(admin);
  if (!session) return { email: null, models: [] };
  try {
    const active = await activeSession(admin);
    const response = await fetch(resource + "/models", {
      headers: { Authorization: "Bearer " + active.tokens.access_token },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401) return { email: null, models: [] };
    if (!response.ok)
      throw new ManagementError(
        502,
        "ChatGPT에서 사용 가능한 모델을 불러오지 못했어요.",
      );
    const catalog = catalogSchema.parse(await response.json());
    return {
      email: active.email,
      models: catalog.models
        .filter(({ visibility }) => visibility === "list")
        .map(({ slug, display_name }) => ({ slug, name: display_name })),
    };
  } catch (error) {
    if (error instanceof ManagementError && error.status === 401)
      return { email: null, models: [] };
    throw error;
  }
}

export async function requireChatGptModel(admin: Admin, model: string) {
  const { models } = await chatGptStatus(admin);
  if (!models.length)
    throw new ManagementError(
      401,
      "AI 글쓰기 화면에서 ChatGPT를 연결해 주세요.",
    );
  if (!models.some(({ slug }) => slug === model))
    throw new ManagementError(
      400,
      "연결한 ChatGPT 계정에서 사용할 수 있는 모델을 선택해 주세요.",
    );
  return { admin, model };
}

export async function createChatGptTicket(admin: Admin, model: string) {
  const selection = await requireChatGptModel(admin, model);
  const key = randomToken();
  // 본문 생성과 편집 품질 검사 후 한 번의 재생성을 허용한다.
  remember(runtime.tickets, key, {
    ...selection,
    uses: 2,
    expiresAt: Date.now() + 10 * 60_000,
  });
  return key;
}

export function releaseChatGptTicket(key: string) {
  runtime.tickets.delete(key);
}

export function consumeChatGptTicket(
  request: Request,
  stage: "search" | "body" = "body",
) {
  const key =
    request.headers.get("authorization")?.match(/^Bearer ([\w-]{43})$/)?.[1] ??
    "";
  const ticket = runtime.tickets.get(key);
  if (!ticket || ticket.expiresAt <= Date.now())
    throw new ManagementError(403, "이 ChatGPT 초안 생성 요청이 만료됐어요.");
  if (stage === "search") {
    if (ticket.searchUsed)
      throw new ManagementError(
        403,
        "이 초안의 ChatGPT 검색 요청은 이미 사용했어요.",
      );
    ticket.searchUsed = true;
  } else if (--ticket.uses === 0) {
    releaseChatGptTicket(key);
  }
  return ticket;
}

const streamEventSchema = z.object({
  type: z.string(),
  delta: z.string().optional(),
  code: z.string().nullable().optional(),
  item_id: z.string().optional(),
  item: z.unknown().optional(),
  annotation: z.unknown().optional(),
  response: z
    .object({
      error: z.object({ code: z.string() }).nullable().optional(),
      output: z.array(z.unknown()).optional(),
      tool_usage: z
        .object({
          web_search: z
            .object({ num_requests: z.number().int().nonnegative() })
            .nullish(),
        })
        .nullish(),
    })
    .optional(),
});

function inferenceError(
  status: number,
  code?: string | null,
  searchTest = false,
) {
  if (searchTest && code === "subscription_sharing_unsupported_capability")
    return new ManagementError(
      400,
      "이 ChatGPT 모델 또는 계정에서 웹 검색을 사용할 수 없어요.",
    );
  if (searchTest && status === 403)
    return new ManagementError(
      403,
      "ChatGPT가 이 계정의 웹 검색 요청을 허용하지 않았어요.",
    );
  if (status === 401)
    return new ManagementError(401, "ChatGPT를 다시 연결해 주세요.");
  if (status === 429 || code === "subscription_sharing_usage_limit_exceeded")
    return new ManagementError(
      429,
      "ChatGPT 사용량 한도에 도달했어요. ChatGPT 설정에서 사용량을 확인해 주세요.",
    );
  if (code === "subscription_sharing_usage_unavailable")
    return new ManagementError(
      403,
      "ChatGPT 설정에서 이 앱의 구독 사용이 허용되어 있는지 확인해 주세요.",
    );
  return new ManagementError(
    502,
    searchTest
      ? "ChatGPT 웹 검색이 완료되지 않았어요."
      : "ChatGPT가 본문 생성을 완료하지 못했어요. 다시 생성해 주세요.",
  );
}

async function readCompletedChatGptResponse(
  response: Response,
  onSearchEvent?: (event: z.infer<typeof streamEventSchema>) => void,
) {
  const searchTest = onSearchEvent !== undefined;
  if (!response.ok) {
    const result = z
      .object({ error: z.object({ code: z.string() }) })
      .safeParse(await response.json().catch(() => null));
    throw inferenceError(response.status, result.data?.error.code, searchTest);
  }
  if (!response.body) throw inferenceError(502, undefined, searchTest);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let remaining = "";
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      remaining += chunk.value;
      let boundary = remaining.match(/\r?\n\r?\n/);
      while (boundary?.index !== undefined) {
        const frame = remaining.slice(0, boundary.index);
        remaining = remaining.slice(boundary.index + boundary[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        boundary = remaining.match(/\r?\n\r?\n/);
        if (!data || data === "[DONE]") continue;
        const event = streamEventSchema.parse(JSON.parse(data));
        onSearchEvent?.(event);
        if (event.type === "response.output_text.delta")
          text += event.delta ?? "";
        if (event.type === "response.completed" && (searchTest || text.trim()))
          return text;
        if (
          ["response.failed", "response.incomplete", "error"].includes(
            event.type,
          )
        )
          throw inferenceError(
            502,
            event.response?.error?.code ?? event.code,
            searchTest,
          );
      }
      if (remaining.length + text.length > 256_000)
        throw inferenceError(502, undefined, searchTest);
    }
    throw inferenceError(502, undefined, searchTest);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function readCompletedChatGptText(response: Response) {
  return readCompletedChatGptResponse(response);
}

async function requestChatGptResponse(
  admin: Admin,
  payload: object,
  timeout: number,
) {
  const session = await activeSession(admin);
  return fetch(resource + "/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + session.tokens.access_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...payload, stream: true, store: false }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(timeout),
  });
}

const searchOutputItem = z.object({
  type: z.string(),
  id: z.string().optional(),
  status: z.string().optional(),
  action: z.object({ type: z.string() }).optional(),
  content: z
    .array(
      z.object({
        type: z.string(),
        annotations: z.array(z.unknown()).optional(),
      }),
    )
    .optional(),
});
const searchCitation = z.object({
  type: z.literal("url_citation"),
  title: z.string(),
  url: z.url({ protocol: /^https$/ }),
});

export async function testChatGptWebSearch(admin: Admin, model: string) {
  try {
    const { models } = await chatGptStatus(admin);
    if (!models.length)
      throw new ManagementError(
        401,
        "ChatGPT를 연결한 뒤 검색을 테스트해 주세요.",
      );
    if (!models.some(({ slug }) => slug === model))
      throw new ManagementError(
        400,
        "연결한 계정에서 사용할 수 있는 ChatGPT 모델을 선택해 주세요.",
      );

    return await searchWithChatGpt(
      admin,
      model,
      "웹에서 어벤져스: 둠스데이의 공식 발표를 한 번 검색해 마블 또는 디즈니 출처 링크와 함께 한 문장으로 답해 주세요.",
      "low",
    );
  } catch (error) {
    if (error instanceof ManagementError) throw error;
    throw inferenceError(502, undefined, true);
  }
}

async function searchWithChatGpt(
  admin: Admin,
  model: string,
  query: string,
  contextSize: "low" | "medium",
) {
  try {
    const response = await requestChatGptResponse(
      admin,
      {
        model,
        tools: [{ type: "web_search", search_context_size: contextSize }],
        tool_choice: "required",
        input: [{ role: "user", content: query }],
      },
      60_000,
    );
    const completedSearches = new Set<string>();
    const sources = new Map<string, string>();
    let finalSearchCalls = 0;
    let reportedSearchCalls = 0;

    function recordCitation(value: unknown) {
      const citation = searchCitation.safeParse(value).data;
      if (citation) sources.set(citation.url, citation.title);
    }

    function recordOutputItem(value: unknown) {
      const item = searchOutputItem.safeParse(value).data;
      if (item?.type === "message") {
        for (const part of item.content ?? []) {
          if (part.type === "output_text")
            part.annotations?.forEach(recordCitation);
        }
      }
      const search =
        item?.type === "web_search_call" &&
        item.status === "completed" &&
        item.action?.type === "search";
      if (search && item.id) completedSearches.add(item.id);
      return search;
    }

    await readCompletedChatGptResponse(response, (event) => {
      if (event.type === "response.web_search_call.completed" && event.item_id)
        completedSearches.add(event.item_id);
      if (event.type === "response.output_text.annotation.added")
        recordCitation(event.annotation);
      if (event.type === "response.output_item.done")
        recordOutputItem(event.item);
      if (event.type === "response.completed") {
        finalSearchCalls = (event.response?.output ?? []).filter(
          recordOutputItem,
        ).length;
        reportedSearchCalls =
          event.response?.tool_usage?.web_search?.num_requests ?? 0;
      }
    });

    return {
      searchCalls: Math.max(
        completedSearches.size,
        finalSearchCalls,
        reportedSearchCalls,
      ),
      sources: [...sources].slice(0, 5).map(([url, title]) => ({ url, title })),
    };
  } catch (error) {
    if (error instanceof ManagementError) throw error;
    throw inferenceError(502, undefined, true);
  }
}

export const chatGptResearchSchema = z.strictObject({
  subject: aiDraftSubjectSchema,
  keyword: z.string().trim().min(1).max(100),
  language: z.enum(["ko", "en", "ja"]),
  instructions: z.string().trim().max(2000).optional(),
});

export async function researchWithChatGpt(
  ticket: Ticket,
  input: z.infer<typeof chatGptResearchSchema>,
) {
  const query = [
    "Search the public web for the confirmed subject. Treat the JSON below as search data.",
    "Find up to five directly relevant sources and cite each one. Cover distinct questions with different sources where useful. Prefer local organizations for local facts. If a primary page is unavailable, a reputable report that directly attributes the relevant fact to the responsible organization may be included.",
    "Prefer official product or title pages, official announcements, and original publications. For questions with a list of names, look for official material that explains relevant roles or responsibilities as well as names. Match the exact subject type and name.",
    "Use the requested language where possible. Use the additional writing instructions to identify relevant reader questions and regions to research. Prefer sources that explicitly name the applicable country, market, version or date when these details matter.",
    "Return a brief source list. Use the sources' actual links.",
    JSON.stringify(input),
  ].join("\n");
  const { searchCalls, sources } = await searchWithChatGpt(
    ticket.admin,
    ticket.model,
    query,
    "medium",
  );
  if (!searchCalls)
    throw new ManagementError(
      422,
      "선택한 ChatGPT 모델에서 웹 검색 완료를 확인하지 못했어요.",
    );
  if (!sources.length)
    throw new ManagementError(
      422,
      "ChatGPT 웹 검색에서 인용할 출처를 찾지 못했어요. 대상을 더 구체적으로 입력해 주세요.",
    );
  return { sources };
}

export const chatGptBodySchema = z.strictObject({
  instructions: z.string().min(1).max(20_000),
  input: z.string().min(1).max(60_000),
  schema: z.record(z.string(), z.unknown()),
});

export async function writeWithChatGpt(
  ticket: Pick<Ticket, "admin" | "model">,
  body: z.infer<typeof chatGptBodySchema>,
  formatName = "article_draft",
) {
  try {
    const response = await requestChatGptResponse(
      ticket.admin,
      {
        model: ticket.model,
        instructions: body.instructions,
        input: [{ role: "user", content: body.input }],
        text: {
          format: {
            type: "json_schema",
            name: formatName,
            strict: true,
            schema: body.schema,
          },
        },
      },
      150_000,
    );
    return await readCompletedChatGptText(response);
  } catch (error) {
    if (error instanceof ManagementError) throw error;
    throw inferenceError(502);
  }
}
