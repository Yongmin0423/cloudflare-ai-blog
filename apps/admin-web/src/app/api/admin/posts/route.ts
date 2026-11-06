import { createPost, listPosts } from "@cloudflare-ai-blog/database";
import { postInputSchema, postListQuerySchema } from "@cloudflare-ai-blog/shared";
import { apiError,body,guard,json } from "@/lib/local-admin";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{
  const {db,blogId}=await guard(request);const query=postListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return json(await listPosts(db,blogId,query));
}catch(error){return apiError(error);}}
export async function POST(request:Request){try{
  const {db,blogId}=await guard(request);const input=await body(request,postInputSchema,220_000);
  return json({post:await createPost(db,blogId,input)},201);
}catch(error){return apiError(error);}}
