import { createPost, listPosts } from "@cloudflare-ai-blog/database";
import { postInputSchema, postListQuerySchema } from "@cloudflare-ai-blog/shared";
import { getDatabase } from "@/lib/database";
import { apiError,body,guard,json,LOCAL_BLOG_ID } from "@/lib/local-admin";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{
  guard(request);const query=postListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return json(await listPosts(await getDatabase(),LOCAL_BLOG_ID,query));
}catch(error){return apiError(error);}}
export async function POST(request:Request){try{
  guard(request);const input=await body(request,postInputSchema,220_000);
  return json({post:await createPost(await getDatabase(),LOCAL_BLOG_ID,input)},201);
}catch(error){return apiError(error);}}
