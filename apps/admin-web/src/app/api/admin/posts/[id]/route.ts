import {
  getPost,
  setPostPublication,
  updatePost,
} from "@cloudflare-ai-blog/database";
import {
  postPublicationSchema,
  updatePostSchema,
} from "@cloudflare-ai-blog/shared";
import { apiError, body, guard, json } from "@/lib/local-admin";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { db, blogId } = await guard(request);
    const { id } = await context.params;
    return json({ post: await getPost(db, blogId, id) });
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: Request, context: Context) {
  try {
    const { db, blogId } = await guard(request);
    const { id } = await context.params;
    const input = await body(request, updatePostSchema, 220_000);
    return json({
      post: await updatePost(
        db,
        blogId,
        id,
        input.post,
        input.expectedRevision,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { db, blogId } = await guard(request);
    const { id } = await context.params;
    const input = await body(request, postPublicationSchema, 1024);
    return json(await setPostPublication(db, blogId, id, input));
  } catch (error) {
    return apiError(error);
  }
}
