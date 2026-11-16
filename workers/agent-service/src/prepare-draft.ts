import { generateDraft } from "./generate-draft";
import { suggestPostSeo } from "./suggest-post-seo";

export async function prepareDraft(...args: Parameters<typeof generateDraft>) {
  const draft = await generateDraft(...args);
  const [env] = args;
  const seo = await suggestPostSeo(env, draft);
  return { ...draft, ...seo };
}
