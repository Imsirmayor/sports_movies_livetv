import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function backendBase(): string {
  return (process.env.API_BASE_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
}

function apiToken(): string | undefined {
  return process.env.API_TOKEN;
}

async function proxy(req: NextRequest, pathParts: string[]): Promise<NextResponse> {
  const token = apiToken();
  if (!token) {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "API_TOKEN is not configured on the web server" } },
      { status: 500 }
    );
  }

  const subPath = pathParts.map(encodeURIComponent).join("/");
  const url = new URL(req.url);
  const target = `${backendBase()}/api/${subPath}${url.search}`;

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  const accept = req.headers.get("accept");
  if (accept) headers.set("Accept", accept);
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  const method = req.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
  };

  if (method !== "GET" && method !== "HEAD") {
    const body = await req.arrayBuffer();
    if (body.byteLength > 0) {
      init.body = body;
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "NETWORK",
          message: "Unable to reach the media API. Is it running on API_BASE_URL?",
        },
      },
      { status: 502 }
    );
  }

  const outHeaders = new Headers();
  const passThrough = ["content-type", "cache-control"];
  for (const key of passThrough) {
    const value = upstream.headers.get(key);
    if (value) outHeaders.set(key, value);
  }

  // Stream binary HLS segments without buffering entire body into JSON
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
