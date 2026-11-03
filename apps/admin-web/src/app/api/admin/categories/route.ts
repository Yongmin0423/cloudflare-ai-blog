import { createCategory, listCategories } from "@cloudflare-ai-blog/database";
import { categoryInputSchema } from "@cloudflare-ai-blog/shared";
import { getDatabase } from "@/lib/database";
import { apiError, body, guard, json, LOCAL_BLOG_ID } from "@/lib/local-admin";
export const dynamic="force-dynamic";
export async function GET(request: Request) { try { guard(request); return json({categories:await listCategories(await getDatabase(),LOCAL_BLOG_ID)}); } catch(error) { return apiError(error); } }
export async function POST(request: Request) { try { guard(request); const input=await body(request,categoryInputSchema); return json({categories:await createCategory(await getDatabase(),LOCAL_BLOG_ID,input)},201); } catch(error) { return apiError(error); } }
