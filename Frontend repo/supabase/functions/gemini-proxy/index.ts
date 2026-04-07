// Gemini API key only on server — set GEMINI_API_KEY in Supabase secrets.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorised" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorised" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (!GEMINI_KEY) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured on server" }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const model = body.model as string | undefined;
  const contents = body.contents;
  const generationConfig = body.generationConfig;
  const tools = body.tools;
  const toolConfig = body.toolConfig;

  if (!model || !contents) {
    return new Response(JSON.stringify({ error: "model and contents required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const payload: Record<string, unknown> = { contents };
  if (generationConfig && typeof generationConfig === "object") payload.generationConfig = generationConfig;
  if (tools) payload.tools = tools;
  if (toolConfig) payload.toolConfig = toolConfig;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_KEY,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.ok ? 200 : res.status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
