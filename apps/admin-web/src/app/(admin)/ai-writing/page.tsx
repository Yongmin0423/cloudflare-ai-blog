import { AiWriting } from "@/features/ai-writing/ai-writing";
export default async function AiWritingPage({
  searchParams,
}: {
  searchParams: Promise<{ chatgpt?: string }>;
}) {
  const local = process.env.NODE_ENV === "development";
  const status = local ? (await searchParams).chatgpt : undefined;
  return <AiWriting localChatGpt={local} chatGptSignInStatus={status} />;
}
