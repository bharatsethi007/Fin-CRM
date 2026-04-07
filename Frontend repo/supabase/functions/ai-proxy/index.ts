// OpenAI calls only happen here — OPENAI_API_KEY is server-side (Supabase secret), never VITE_.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const openaiPayload = body.openaiPayload as Record<string, unknown> | undefined;
  if (!openaiPayload || typeof openaiPayload !== "object") {
    return new Response(JSON.stringify({ error: "openaiPayload required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(openaiPayload),
  });

  const data = await response.json();
  return new Response(JSON.stringify(data), {
    status: response.ok ? 200 : response.status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
