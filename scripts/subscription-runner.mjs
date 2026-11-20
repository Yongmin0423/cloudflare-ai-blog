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
    const { job } = await api({ action: "next", provider });
    if (job) {
      const cwd = await mkdtemp(join(tmpdir(), "blog-draft-"));
      await writeFile(
        join(directory, job.id + ".json"),
        JSON.stringify({ origin, claim: job.claim, cwd, provider }),
      );
      const prompt = [
        "다음 블로그 요청에 맞는 기사 한 편을 작성하세요. 웹에서 실제로 읽은 원문만 sources에 HTTPS 주소로 넣고 최신 사실은 출처를 확인하세요. 확인할 수 없는 사실은 단정하지 마세요.",
        '형식: {"title":"제목","introduction":"도입 문단","sections":[{"heading":"소제목","paragraphs":["본문 문단"]}],"sources":["https://..."]}. 최소 한 섹션을 작성하세요.',
        claude
          ? "현재 폴더의 article.json에 결과를 저장하세요. 사용자가 검토하고 세션을 종료하면 업로드합니다."
          : "최종 메시지는 JSON 객체만 출력하세요.",
        JSON.stringify(job.input),
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
