import { json, preflight } from "../cors";

export function OPTIONS(request: Request) { return preflight(request); }
export function POST(request: Request) { return json(request, { error: "此功能已更新，請從新版入口登入。" }, 410); }
