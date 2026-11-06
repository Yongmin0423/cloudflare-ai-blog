import { createCategory, listCategories } from "@cloudflare-ai-blog/database";
import { categoryInputSchema } from "@cloudflare-ai-blog/shared";
import { apiError, body, guard, json } from "@/lib/local-admin";
export const dynamic="force-dynamic";
export async function GET(request: Request) { try { const {db,blogId}=await guard(request); return json({categories:await listCategories(db,blogId)}); } catch(error) { return apiError(error); } }
export async function POST(request: Request) { try { const {db,blogId}=await guard(request); const input=await body(request,categoryInputSchema); return json({categories:await createCategory(db,blogId,input)},201); } catch(error) { return apiError(error); } }
