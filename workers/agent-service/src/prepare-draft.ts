import { generateDraft } from "./generate-draft";
import { suggestPostSeo } from "./suggest-post-seo";

export async function prepareDraft(
  ...[env, request, settings, category]: Parameters<typeof generateDraft>
) {
  const draft = await generateDraft(env, request, settings, category);
  const seo = await suggestPostSeo(env, draft);
  return { ...draft, ...seo };
}
