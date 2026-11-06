import { deleteCategory, updateCategory } from "@cloudflare-ai-blog/database";
import { deleteCategorySchema, updateCategorySchema } from "@cloudflare-ai-blog/shared";
import { apiError, body, guard, json } from "@/lib/local-admin";
type Context = { params: Promise<{id:string}> };
export const dynamic="force-dynamic";
export async function PUT(request: Request,context: Context) { try { const {db,blogId}=await guard(request); const {id}=await context.params; const input=await body(request,updateCategorySchema); return json({categories:await updateCategory(db,blogId,id,input.category,input.expectedUpdatedAt)}); } catch(error) { return apiError(error); } }
export async function DELETE(request: Request,context: Context) { try { const {db,blogId}=await guard(request); const {id}=await context.params; const input=await body(request,deleteCategorySchema); return json({categories:await deleteCategory(db,blogId,id,input.expectedUpdatedAt)}); } catch(error) { return apiError(error); } }
