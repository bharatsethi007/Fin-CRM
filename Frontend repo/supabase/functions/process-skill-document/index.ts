// Supabase Edge Function: process-skill-document
// Extracts writing style, structure, and patterns from uploaded reference docs

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function arrayBufferToBase64(buf: ArrayBuffer): string {
  return base64Encode(new Uint8Array(buf));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { skill_document_id } = await req.json();

  const { data: doc } = await supabase
    .from("ai_skill_documents")
    .select("*, ai_skill_library(skill_type, skill_name, firm_id)")
    .eq("id", skill_document_id)
    .single();

  if (!doc) return new Response("Document not found", { status: 404, headers: cors });

  await supabase.from("ai_skill_documents")
    .update({ processing_status: "processing" })
    .eq("id", skill_document_id);

  await supabase.from("ai_skill_library")
    .update({ is_processing: true })
    .eq("id", doc.skill_id);

  try {
    const fileRes = await fetch(doc.file_url);
    const fileBuffer = await fileRes.arrayBuffer();
    const base64 = arrayBufferToBase64(fileBuffer);
    const isImage = doc.file_type?.includes("image");
    const isPdf = doc.file_url.toLowerCase().includes(".pdf") || doc.file_type?.includes("pdf");

    const skillType = doc.ai_skill_library?.skill_type || "custom";
    const extractionPrompt = buildExtractionPrompt(skillType, doc.document_role);

    const messages: unknown[] = [
      { role: "system", content: extractionPrompt },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyse this ${doc.document_role} document for the skill type: ${skillType}. Extract all relevant style, structure, and content patterns.`,
          },
          isPdf || isImage
            ? {
              type: "image_url",
              image_url: { url: `data:${isPdf ? "application/pdf" : "image/png"};base64,${base64}` },
            }
            : {
              type: "text",
              text: doc.extracted_text || "Document text not available",
            },
        ],
      },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    const aiData = await response.json();
    const extracted = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");
    const tokens = aiData.usage?.total_tokens || 0;

    await supabase.from("ai_skill_documents").update({
      ai_summary: extracted.summary || "",
      key_patterns: extracted.patterns || {},
      processing_status: "completed",
      processed_at: new Date().toISOString(),
      tokens_used: tokens,
    }).eq("id", skill_document_id);

    const { data: allDocs } = await supabase
      .from("ai_skill_documents")
      .select("ai_summary, key_patterns")
      .eq("skill_id", doc.skill_id)
      .eq("processing_status", "completed");

    const consolidatedInstructions = buildConsolidatedInstructions(allDocs || [], skillType);

    await supabase.from("ai_skill_library").update({
      extracted_content: consolidatedInstructions.content,
      key_phrases: consolidatedInstructions.key_phrases,
      sections_to_include: consolidatedInstructions.sections,
      is_processing: false,
      last_processed_at: new Date().toISOString(),
    }).eq("id", doc.skill_id);

    return new Response(JSON.stringify({
      success: true,
      summary: extracted.summary,
      tokens_used: tokens,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase.from("ai_skill_documents").update({
      processing_status: "failed",
    }).eq("id", skill_document_id);
    await supabase.from("ai_skill_library").update({ is_processing: false }).eq("id", doc.skill_id);

    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

function buildExtractionPrompt(skillType: string, documentRole: string): string {
  const base = `You are analysing a ${documentRole} document to extract writing style and structure patterns for a NZ mortgage broker AI assistant.

Respond ONLY with valid JSON in this exact structure:
{
  "summary": "One paragraph describing what this document teaches the AI",
  "patterns": {
    "document_structure": ["Section 1", "Section 2", ...],
    "tone_characteristics": ["formal", "uses client first name", ...],
    "key_phrases": ["phrase 1", "phrase 2", ...],
    "things_to_always_include": ["item 1", ...],
    "things_to_avoid": ["item 1", ...],
    "formatting_notes": "description of formatting style"
  }
}`;

  const typeSpecific: Record<string, string> = {
    soa_style: "Focus on: section headings, recommendation structure, how risks are disclosed, how alternatives are presented, sign-off language.",
    disclosure_template: "Focus on: exact section headings, required disclosure fields, formatting, legal language used.",
    needs_objectives_style: "Focus on: how client goals are documented, level of detail, specific questions answered.",
    client_email_tone: "Focus on: greeting style, paragraph structure, sign-off, level of formality, use of broker's name.",
    lender_knowledge: "Focus on: specific lender policies mentioned, criteria, approval conditions, rate information.",
    cover_letter_style: "Focus on: opening structure, how borrower is introduced, how risks are addressed, closing.",
    compliance_notes: "Focus on: specific compliance requirements, mandatory disclosures, prohibited statements.",
  };

  return base + "\n\n" + (typeSpecific[skillType] || "Extract all relevant style and content patterns.");
}

function buildConsolidatedInstructions(docs: any[], _skillType: string): {
  content: string; key_phrases: string[]; sections: string[];
} {
  const allPhrases: string[] = [];
  const allSections: string[] = [];
  const summaries: string[] = [];

  for (const doc of docs) {
    if (doc.ai_summary) summaries.push(doc.ai_summary);
    if (doc.key_patterns?.key_phrases) allPhrases.push(...doc.key_patterns.key_phrases);
    if (doc.key_patterns?.document_structure) allSections.push(...doc.key_patterns.document_structure);
  }

  const content = summaries.length > 0
    ? "Based on the firm's reference documents:\n\n" + summaries.join("\n\n")
    : "";

  return {
    content,
    key_phrases: [...new Set(allPhrases)].slice(0, 20),
    sections: [...new Set(allSections)].slice(0, 15),
  };
}
