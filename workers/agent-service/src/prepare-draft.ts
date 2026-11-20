import { generateDraft } from "./generate-draft";
import { suggestPostSeo } from "./suggest-post-seo";

export async function prepareDraft(
  ...[env, request, settings, category, onSources, record]: Parameters<
    typeof generateDraft
  >
) {
  const draft = await generateDraft(
    env,
    request,
    settings,
    category,
    onSources,
    record,
  );
  await record?.({ stage: "save", message: "SEO 제목·설명 제안 생성" });
  const seo = await suggestPostSeo(env, draft);
  return { ...draft, ...seo };
}
