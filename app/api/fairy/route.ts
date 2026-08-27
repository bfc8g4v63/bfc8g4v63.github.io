import { json, preflight } from "../cors";

export function OPTIONS(request: Request) {
  return preflight(request);
}

export function POST(request: Request) {
  return json(request, { error: "仙女補給站已結束服務。" }, 410);
}
