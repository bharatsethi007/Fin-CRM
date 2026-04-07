// Supabase Edge Function: generate-embeddings — OpenAI embeddings stored in document_embeddings

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

  try {
    const { content, metadata, source_type, source_id, client_id, application_id, firm_id } =
      await req.json();

    if (!content || !firm_id || !source_type) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Chunk long content into ~500 token segments
    const chunks = chunkText(content, 2000);
    const results: string[] = [];

    for (const chunk of chunks) {
      // Generate embedding via OpenAI
      const embResponse = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: chunk,
        }),
      });

      const embData = await embResponse.json();
      const embedding = embData.data?.[0]?.embedding;
      if (!embedding) throw new Error("Failed to generate embedding");

      // Store in database
      const { data, error } = await supabase.from("document_embeddings").insert({
        firm_id,
        content: chunk,
        metadata: metadata || {},
        embedding,
        source_type,
        source_id: source_id || null,
        client_id: client_id || null,
        application_id: application_id || null,
      }).select("id").single();

      if (error) throw new Error(error.message);
      results.push(data.id);
    }

    return new Response(
      JSON.stringify({ success: true, embedded_chunks: results.length, ids: results }),
      {
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

/** Splits text into chunks of at most maxChars, preferring paragraph boundaries. */
function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = "";
  for (const p of paragraphs) {
    if (current.length + p.length > maxChars) {
      if (current) chunks.push(current.trim());
      current = p;
    } else {
      current += "\n\n" + p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
