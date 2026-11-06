import { getSettings, saveSettings } from "@cloudflare-ai-blog/database";
import { updateSettingsSchema } from "@cloudflare-ai-blog/shared";
import { apiError, body, guard, json } from "@/lib/local-admin";
export const dynamic="force-dynamic";
export async function GET(request: Request) { try { const {db,blogId}=await guard(request); return json(await getSettings(db,blogId)); } catch(error) { return apiError(error); } }
export async function PUT(request: Request) { try { const {db,blogId}=await guard(request); const input=await body(request,updateSettingsSchema); return json(await saveSettings(db,blogId,input.settings,input.expectedUpdatedAt)); } catch(error) { return apiError(error); } }
