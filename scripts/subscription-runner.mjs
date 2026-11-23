import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";

process.umask(0o077);
const directory = join(homedir(), ".cloudflare-ai-blog");
const configFile = join(directory, "runner.json");
const command = process.argv[2];
const env = { ...process.env };
for (const name of Object.keys(env))
  if (
    /^(OPENAI_|ANTHROPIC_|AZURE_OPENAI_|CLAUDE_CODE_USE_|CLAUDE_CODE_OAUTH_TOKEN|CODEX_API_KEY)/.test(
      name,
    )
  )
    delete env[name];

async function pair() {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, done) {
      if (!muted) process.stdout.write(chunk, encoding);
      done();
    },
  });
  const rl = createInterface({
    input: process.stdin,
    output,
    terminal: !!process.stdin.isTTY,
  });
  try {
    const url = new URL((await rl.question("관리자 주소: ")).trim());
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      throw Error("HTTPS 또는 로컬 관리자 주소가 필요해요.");
    process.stdout.write("실행기 연결 키: ");
    muted = true;
    const key = (await rl.question("")).trim();
    muted = false;
    console.log();
    if (!/^[\w-]{43}$/.test(key)) throw Error("연결 키 형식을 확인하세요.");
    await mkdir(directory, { recursive: true });
    await writeFile(configFile, JSON.stringify({ origin: url.origin, key }), {
      mode: 0o600,
    });
  } finally {
    rl.close();
  }
}
async function run() {
  if (command === "pair") return pair();
  if (!["watch", "claude", "send"].includes(command))
    throw Error(
      "사용법: pnpm subscription:runner pair | watch | claude | send <작업 ID>",
    );
  const { origin, key } = JSON.parse(
    await readFile(configFile, "utf8").catch(() => {
      throw Error("먼저 pnpm subscription:runner pair로 연결하세요.");
    }),
  );
  async function api(data) {
    const response = await fetch(
      new URL("/api/admin/subscription-drafts/runner", origin),
      {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      },
    );
    const result = await response.json();
    if (!response.ok) throw Error(result.error ?? "관리자 요청 실패");
    return result;
  }
  async function send(id) {
    if (!/^[a-f0-9-]{36}$/i.test(id ?? ""))
      throw Error("작업 ID를 확인하세요.");
    const receipt = JSON.parse(
      await readFile(join(directory, id + ".json"), "utf8"),
    );
    if (receipt.origin !== origin) throw Error("작업 관리자 주소가 달라요.");
    const article = JSON.parse(
      await readFile(join(receipt.cwd, "article.json"), "utf8"),
    );
    if (receipt.kind === "revision") {
      await api({
        action: "finishRevision",
        id,
        claim: receipt.claim,
        result: article,
      });
      console.log(
        "수정안 확인:",
        origin + "/posts/" + receipt.postId + "/edit",
      );
      return;
    }
    await api({
      action: "finish",
      id,
      claim: receipt.claim,
      article: { ...article, provider: receipt.provider },
    });
    console.log("초안 저장:", origin + "/posts/" + id + "/edit");
  }
  if (command === "send") return send(process.argv[3]);
  const claude = command === "claude";
  const provider = claude ? "claude" : "chatgpt";
  const binary = claude ? "claude" : "codex";
  function checkLogin() {
    const auth = spawnSync(
      binary,
      claude ? ["auth", "status"] : ["login", "status"],
      { env, encoding: "utf8" },
    );
    if (auth.error?.code === "ENOENT")
      throw Error(binary + " CLI를 설치하세요.");
    const loggedIn =
      auth.status === 0 &&
      (claude
        ? JSON.parse(auth.stdout).authMethod === "claude.ai"
        : /Logged in using ChatGPT/i.test(auth.stdout + auth.stderr));
    if (!loggedIn) throw Error(binary + "의 구독 계정으로 로그인하세요.");
  }
  checkLogin();
  do {
    const { job } = await api({ action: "next", provider, revisions: true });
    if (job) {
      const cwd = await mkdtemp(join(tmpdir(), "blog-draft-"));
      await writeFile(
        join(directory, job.id + ".json"),
        JSON.stringify({
          origin,
          claim: job.claim,
          cwd,
          provider,
          kind: job.input.kind,
          postId: job.input.postId,
        }),
      );
      const revision =
        job.input.kind === "revision" ? job.input.revision : null;
      const prompt = [
        ...(revision
          ? [
              "초안 편집자로서 instructions에 따라 글의 구성과 내용을 수정하세요. blocks는 순서대로 번호가 0부터 시작하는 원문 데이터입니다. 요청과 무관한 문단, 링크, 이미지, 서식은 keep으로 보존하세요.",
              'JSON 형식: {"layout":[{"kind":"source","pageUrl":"https://...","alt":"원하는 사진 설명"},{"kind":"keep","index":0}],"removed":[]}. layout 순서가 실제 배치 순서입니다. keep으로 기존 블록 이동, paragraph 또는 heading과 text로 새 문단 또는 소제목 작성, 교체하거나 삭제한 원문 번호는 removed에 넣으세요. 모든 원문 번호는 정확히 한 번만 사용하세요.',
              '이미지를 가져오라는 지시에는 지정된 사이트에서 실제 확인한 공개 원문 페이지 URL을 source에 넣으세요. 요청한 사진의 실제 이미지 주소까지 확인하면 imageUrl에 넣으세요. 이미지 생성을 요청하면 {"kind":"generate","prompt":"구체적인 영어 이미지 생성 지시","alt":"한국어 이미지 설명"}을 사용하세요. 최대 3장입니다. 출처 주소나 사실을 지어내지 마세요.',
            ]
          : [
              "다음 블로그 요청에 맞는 기사 한 편을 작성하세요. 웹에서 실제로 읽은 원문만 sources에 HTTPS 주소로 넣고 최신 사실은 출처를 확인하세요. 확인할 수 없는 사실은 단정하지 마세요.",
              '형식: {"title":"제목","introduction":"도입 문단","sections":[{"heading":"소제목","paragraphs":["본문 문단"]}],"sources":["https://..."]}. 최소 한 섹션을 작성하세요.',
            ]),
        claude
          ? "현재 폴더의 article.json에 결과를 저장하세요. 사용자가 검토하고 세션을 종료하면 업로드합니다."
          : "최종 메시지는 JSON 객체만 출력하세요.",
        JSON.stringify(
          revision
            ? {
                title: revision.title,
                instructions: revision.instructions,
                blocks: revision.blocks.map((block, index) => ({
                  index,
                  ...block,
                })),
              }
            : job.input,
        ),
      ].join("\n");
      console.log("작성 폴더:", cwd);
      try {
        checkLogin();
        const model =
          job.input.model ?? (claude ? undefined : process.env.BLOG_GPT_MODEL);
        const modelArgs = model ? ["--model", model] : [];
        const proc = claude
          ? spawnSync(binary, [...modelArgs, prompt], {
              cwd,
              env,
              stdio: "inherit",
            })
          : spawnSync(
              binary,
              [
                "exec",
                "--ignore-user-config",
                "-c",
                'forced_login_method="chatgpt"',
                "-c",
                'model_provider="openai"',
                "-c",
                'web_search="live"',
                ...modelArgs,
                "--ephemeral",
                "--sandbox",
                "read-only",
                "--skip-git-repo-check",
                "-o",
                "article.json",
                "-",
              ],
              {
                cwd,
                env,
                input: prompt,
                stdio: ["pipe", "inherit", "inherit"],
              },
            );
        if (proc.error || proc.status !== 0)
          throw Error(binary + " 작성이 완료되지 않았어요.");
      } catch (error) {
        await api({
          action: "fail",
          id: job.id,
          claim: job.claim,
          error: "로컬 구독 세션에서 작성을 완료하지 못했어요.",
        });
        throw error;
      }
      try {
        await send(job.id);
      } catch (error) {
        console.error(
          "작성 파일을 보존했어요. 확인 후 다시 전송: pnpm subscription:runner send " +
            job.id,
        );
        throw error;
      }
    } else if (claude) console.log("대기 중인 Claude 작업이 없어요.");
    if (!claude) await sleep(12000);
  } while (!claude);
}
run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
