import { getPost,updatePost } from "@cloudflare-ai-blog/database";
import { updatePostSchema } from "@cloudflare-ai-blog/shared";
import { getDatabase } from "@/lib/database";
import { apiError,body,guard,json,LOCAL_BLOG_ID } from "@/lib/local-admin";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{
  guard(request);const {id}=await context.params;
  return json({post:await getPost(await getDatabase(),LOCAL_BLOG_ID,id)});
}catch(error){return apiError(error);}}
export async function PUT(request:Request,context:Context){try{
  guard(request);const {id}=await context.params;const input=await body(request,updatePostSchema,220_000);
  return json({post:await updatePost(await getDatabase(),LOCAL_BLOG_ID,id,input.post,input.expectedRevision)});
}catch(error){return apiError(error);}}
