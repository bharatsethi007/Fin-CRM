import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function invokeGenerateEmbeddings(supabase: any, body: Record<string, unknown>) {
  try {
    await supabase.functions.invoke("generate-embeddings", { body });
  } catch (e) {
    console.warn("generate-embeddings invoke failed:", e);
  }
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  parse_queue_id?: string;
  document_id: string;
  /** Optional when document `detected_type` is `id_document` (client onboarding scan). */
  application_id?: string;
  firm_id: string;
};

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function stripJsonFences(s: string): string {
  return s.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
}

function parseJsonFromModelText(text: string): Record<string, unknown> {
  const cleaned = stripJsonFences(text);
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Could not parse model response as JSON");
    return JSON.parse(m[0]) as Record<string, unknown>;
  }
}

function guessMimeFromUrl(url: string): string {
  const u = url.split("?")[0].toLowerCase();
  if (u.endsWith(".pdf")) return "application/pdf";
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image/jpeg";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

/** Filename hints for ID docs — avoid false positives (e.g. "download", "valid"). */
function filenameSuggestsIdDocument(fileName: string): boolean {
  const f = fileName.toLowerCase();
  if (f.includes("passport")) return true;
  if (f.includes("licence") || f.includes("license")) return true;
  if (f.includes("drivers") || /\bdriver[\s_-]*licen/i.test(f)) return true;
  if (f.includes("id_card") || f.includes("identity")) return true;
  if (/(^|[^a-z0-9])id([^a-z0-9]|$)/i.test(f)) return true;
  if (/(^|[^a-z0-9])dl([^a-z0-9]|$)|^dl[._-]|_dl_|[-_]dl\./i.test(f)) return true;
  return false;
}

/** JPG/PNG from Add Client / ID scan flows — treat as identity document when type unknown. */
function isJpegOrPngMime(mime: string, fileUrl: string): boolean {
  const m = mime.toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg" || m.includes("jpeg")) return true;
  if (m === "image/png" || m.includes("png")) return true;
  const u = fileUrl.split("?")[0].toLowerCase();
  return /\.(jpe?g|png)(\?|$)/i.test(u);
}

/** Pull PDF text shown between `(` … `)` string literals (common in text-based PDFs). */
function extractPdfParenthesisStrings(pdfUtf8: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < pdfUtf8.length) {
    if (pdfUtf8[i] !== "(") {
      i++;
      continue;
    }
    i++;
    let depth = 1;
    let chunk = "";
    while (i < pdfUtf8.length && depth > 0) {
      const c = pdfUtf8[i];
      if (c === "\\" && i + 1 < pdfUtf8.length) {
        const n = pdfUtf8[i + 1];
        if (n === "n") {
          chunk += "\n";
          i += 2;
          continue;
        }
        if (n === "r") {
          chunk += "\r";
          i += 2;
          continue;
        }
        if (n === "t") {
          chunk += "\t";
          i += 2;
          continue;
        }
        if (n === "(" || n === ")" || n === "\\") {
          chunk += n;
          i += 2;
          continue;
        }
        chunk += n;
        i += 2;
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") depth--;
      if (depth > 0) chunk += c;
      i++;
    }
    if (chunk.length >= 2 && /[a-zA-Z]{2,}/.test(chunk)) {
      out.push(chunk.trim());
    }
  }
  return out.join("\n");
}

/**
 * Digital/text PDFs: combine extracted string literals + printable UTF-8, then
 * require bank-like keywords + letter ratio. Scanned PDFs usually fail → caller should error.
 */
function tryExtractDigitalPdfText(buf: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buf);
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const fromStrings = extractPdfParenthesisStrings(raw);
  const printable = raw.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
  const collapsedPrint = printable.replace(/\s+/g, " ").trim();
  const merged = fromStrings.length > 80
    ? `${fromStrings}\n${collapsedPrint}`
    : collapsedPrint;
  const collapsed = merged.replace(/\s+/g, " ").trim();

  const lower = collapsed.toLowerCase();
  const keywords = [
    "balance",
    "transaction",
    "account",
    "debit",
    "credit",
    "amount",
    "date",
    "statement",
    "opening",
    "closing",
    "payment",
    "transfer",
    "deposit",
    "withdrawal",
    "nzd",
    "total",
    "anz",
    "asb",
    "westpac",
    "bnz",
    "kiwi",
  ];
  const kwHits = keywords.filter((k) => lower.includes(k)).length;
  const letters = (collapsed.match(/[a-zA-Z]/g) || []).length;
  const ratio = letters / Math.max(collapsed.length, 1);

  if (collapsed.length < 120) return null;
  if (kwHits >= 3 && ratio > 0.12) return collapsed.slice(0, 450_000);
  if (kwHits >= 2 && ratio > 0.18) return collapsed.slice(0, 450_000);
  if (fromStrings.length > 400 && kwHits >= 1 && ratio > 0.08) {
    return collapsed.slice(0, 450_000);
  }
  return null;
}

function systemPromptForType(detectedType: string): string {
  switch (detectedType) {
    case "payslip":
      return `Extract from this payslip: employer_name, employee_name,
pay_period_start, pay_period_end, gross_salary, net_pay,
pay_frequency (weekly/fortnightly/monthly), ytd_gross,
tax_withheld, kiwisaver_deduction.
Return ONLY valid JSON, no markdown.`;
    case "bank_statement":
      return `You are a NZ mortgage broker's assistant analysing a bank statement. Extract:

1. bank_name, account_holder_name, account_number (last 4 digits only)
2. statement_period_start (YYYY-MM-DD), statement_period_end (YYYY-MM-DD)
3. opening_balance, closing_balance, total_credits, total_debits
4. average_monthly_credits (total_credits divided by months in statement)

5. regular_income_credits: array of recurring credits with {description, amount, frequency: weekly|fortnightly|monthly}

6. categorised_monthly_expenses: object with these NZ-specific categories, each a monthly dollar amount:
   - food_groceries (Countdown, Pak'nSave, New World, supermarkets)
   - dining_takeaway (Uber Eats, DoorDash, restaurants, cafes, KFC, McDonald's)
   - alcohol_tobacco (liquor stores, bottle shops, TAB)
   - entertainment (movies, concerts, events)
   - streaming_subscriptions (Netflix, Spotify, Disney+, YouTube, gym memberships billed monthly)
   - clothing_personal (clothing stores, hairdresser, beauty)
   - phone_internet (Spark, Vodafone, 2degrees, One NZ, broadband)
   - utilities (Mercury, Genesis, Contact Energy, power, gas, water council)
   - vehicle_running_costs (BP, Z Energy, Mobil, petrol, parking, WOF, rego)
   - public_transport (AT HOP, Snapper, bus, train, ferry)
   - health_insurance (Southern Cross, nib, Accuro)
   - medical_dental (pharmacy, GP, dentist, optometrist)
   - gym_sports (Les Mills, gym, sports club fees)
   - rent_board (rent, board, accommodation, mortgage if renting)
   - other_discretionary (everything else not categorised above)
   Convert weekly/fortnightly amounts to monthly. Sum transactions per category.

7. anomalies: array of objects {description, amount, category, severity: "warning"|"critical", reason}. Flag:
   - Gambling (TAB, Lotto, Sky City, online betting) — severity: critical
   - Buy Now Pay Later (Afterpay, Laybuy, Zip, Humm, Klarna) — severity: warning
   - Payday loans or high-interest lenders — severity: critical
   - Dishonour/bounce fees — severity: critical
   - Unusual large one-off payments — severity: warning
   - Cryptocurrency purchases — severity: warning
   - Frequent ATM withdrawals over $500/week — severity: warning

8. notes: brief summary of financial health observations

Return ONLY valid JSON, no markdown.`;
    case "tax_return":
    case "ir3":
      return `Extract: tax_year, total_income, tax_paid, net_income,
business_name (if self-employed), profit_before_tax,
depreciation_addback. Return ONLY valid JSON, no markdown.`;
    case "accountant_financials":
      return `Extract: business_name, financial_year, total_revenue,
net_profit, depreciation, interest_addback, directors_salary,
previous_year_net_profit. Return ONLY valid JSON, no markdown.`;
    case "id_document":
      return `Extract from this identity document: full_name, first_name, last_name, date_of_birth (YYYY-MM-DD), id_number, id_type (passport/drivers_licence/national_id), expiry_date (YYYY-MM-DD), issuing_country, address (if visible), gender (if visible). Return ONLY valid JSON, no markdown.`;
    default:
      return `Extract any financial identifiers and amounts you can infer from this document.
Return ONLY valid JSON with sensible snake_case keys, no markdown.`;
  }
}

function annualFromGrossAndFrequency(
  gross: number,
  payFrequency: string,
): number {
  const f = (payFrequency || "").toLowerCase();
  if (f.includes("fortnight")) return gross * 26;
  if (f.includes("week")) return gross * 52;
  if (f.includes("month")) return gross * 12;
  if (f.includes("annual") || f.includes("year")) return gross;
  return gross * 12;
}

function monthsAnalysed(
  start: unknown,
  end: unknown,
): number {
  if (typeof start !== "string" || typeof end !== "string") return 1;
  const d1 = new Date(start);
  const d2 = new Date(end);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 1;
  const months =
    (d2.getFullYear() - d1.getFullYear()) * 12 +
    (d2.getMonth() - d1.getMonth()) +
    1;
  return Math.max(1, months);
}

function flagsInclude(flags: unknown, needle: string): boolean {
  if (!Array.isArray(flags)) return false;
  const n = needle.toLowerCase();
  return flags.some((x) =>
    String(x).toLowerCase().includes(n)
  );
}

/** Derive risk booleans from legacy flags array and/or structured anomalies from the model. */
function bankStatementRiskFromExtracted(extracted: Record<string, unknown>): {
  gambling: boolean;
  bnpl: boolean;
  dishonour: boolean;
} {
  const flags = extracted.flags;
  let gambling = flagsInclude(flags, "gambling");
  let bnpl = flagsInclude(flags, "bnpl");
  let dishonour = flagsInclude(flags, "dishonour") ||
    flagsInclude(flags, "dishonor");
  const anomalies = extracted.anomalies;
  if (Array.isArray(anomalies)) {
    for (const a of anomalies) {
      const o = a as Record<string, unknown>;
      const text = `${(o.category ?? "")} ${(o.reason ?? "")} ${(o.description ?? "")}`
        .toLowerCase();
      if (
        /gambling|\btab\b|lotto|betting|sky\s*city|casino|online betting/
          .test(text)
      ) gambling = true;
      if (
        /afterpay|laybuy|\bzip\b|humm|klarna|bnpl|buy now pay later/
          .test(text)
      ) bnpl = true;
      if (/dishonour|dishonor|bounce|payday|high-interest/.test(text)) {
        dishonour = true;
      }
    }
  }
  return { gambling, bnpl, dishonour };
}

function buildParseSummary(
  detectedType: string,
  extracted: Record<string, unknown>,
): string {
  if (detectedType === "payslip") {
    const gross = (extracted.gross_salary ?? extracted.gross) ?? "—";
    const freq = (extracted.pay_frequency ?? extracted.salary_frequency) ?? "";
    return `Payslip parsed — gross ${gross}${freq ? ` (${freq})` : ""}`;
  }
  if (detectedType === "bank_statement") {
    const bank = extracted.bank_name ?? "Bank";
    const avg = (extracted.average_monthly_credits ?? extracted.total_credits) ?? "—";
    return `Bank statement parsed — ${bank}, avg credits ${avg}`;
  }
  if (detectedType === "id_document") {
    const nm =
      extracted.full_name ??
      (`${(extracted.first_name ?? "")} ${(extracted.last_name ?? "")}`.trim() || "ID");
    return `ID document parsed — ${nm}`;
  }
  const label = detectedType === "unknown"
    ? "Document"
    : detectedType.replace(/_/g, " ");
  return `${label} parsed`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!openaiKey) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let parseQueueId: string | undefined;
  let documentIdForCatch: string | undefined;
  try {
    const body = (await req.json()) as Payload;
    parseQueueId = body.parse_queue_id;
    let application_id = body.application_id;
    const { document_id, firm_id } = body;
    documentIdForCatch = document_id;

    if (!document_id || !firm_id) {
      return new Response(
        JSON.stringify({
          error: "Missing document_id or firm_id",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const useQueue = Boolean(parseQueueId);

    let queueRow: Record<string, unknown> | null = null;
    if (useQueue) {
      const { data: qData, error: qErr } = await supabase
        .from("document_parse_queue")
        .select("*")
        .eq("id", parseQueueId!)
        .single();

      if (qErr || !qData) {
        throw new Error(qErr?.message || "Parse queue row not found");
      }
      queueRow = qData as Record<string, unknown>;

      const { error: procErr } = await supabase
        .from("document_parse_queue")
        .update({ status: "processing", error_message: null })
        .eq("id", parseQueueId!);

      if (procErr) throw new Error(procErr.message);

      application_id =
        application_id ||
        (String(queueRow.application_id ?? ""));
    }

    const { data: docRow, error: dErr } = await supabase
      .from("documents")
      .select("id, url, detected_type, firm_id, client_id, application_id")
      .eq("id", document_id)
      .single();

    if (dErr || !docRow) {
      throw new Error(dErr?.message || "Document not found");
    }

    const docRec = docRow as Record<string, unknown>;
    if (String(docRec.firm_id ?? "") !== String(firm_id)) {
      throw new Error("Document firm_id does not match request");
    }

    const detectedFromDoc = String(
      docRec.detected_type ||
        (queueRow?.detected_type as string | undefined) ||
        "",
    ).trim().toLowerCase();
    const isIdDocumentOnboarding = detectedFromDoc === "id_document";

    if (!isIdDocumentOnboarding && !application_id) {
      return new Response(
        JSON.stringify({
          error: "Missing application_id (not required only for id_document onboarding)",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fileUrl = docRec.url as string;
    if (!fileUrl) {
      throw new Error("Document has no url");
    }

    const detectedType = String(
      docRec.detected_type ||
        (queueRow?.detected_type as string | undefined) ||
        "unknown",
    );

    const fileResp = await fetch(fileUrl);
    if (!fileResp.ok) {
      throw new Error(`Failed to download document: ${fileResp.status}`);
    }
    const buf = await fileResp.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    const contentType = fileResp.headers.get("content-type") ||
      guessMimeFromUrl(fileUrl);
    const mime = contentType.split(";")[0].trim() || guessMimeFromUrl(fileUrl);
    const dataUrl = `data:${mime};base64,${base64}`;

    const userText =
      "Extract the requested fields from this document. Respond with JSON only.";

    const isText = mime.includes("text/") || mime.includes("csv") ||
      /\.(csv|txt|tsv)(\?|$)/i.test(fileUrl);
    const isPdf = mime === "application/pdf" || mime.includes("pdf") ||
      /\.pdf(\?|$)/i.test(fileUrl);

    // Auto-detect type from filename and content if not already set
    let finalType = detectedType.trim();
    if (!finalType) finalType = "unknown";
    else finalType = finalType.toLowerCase();
    if (finalType === "unknown") {
      const fileName = (fileUrl.split("/").pop() || "").split("?")[0];
      const fn = fileName.toLowerCase();
      if (fn.includes("payslip") || fn.includes("pay_slip") || fn.includes("salary")) {
        finalType = "payslip";
      } else if (
        fn.includes("bank") || fn.includes("statement") || fn.includes("transaction")
      ) {
        finalType = "bank_statement";
      } else if (fn.includes("tax") || fn.includes("ir3") || fn.includes("return")) {
        finalType = "tax_return";
      } else if (filenameSuggestsIdDocument(fileName)) {
        finalType = "id_document";
      } else if (isJpegOrPngMime(mime, fileUrl)) {
        finalType = "id_document";
      } else if (isText || isPdf) {
        finalType = "bank_statement";
      }
    }

    const systemPrompt = systemPromptForType(finalType);

    let userContent: Array<Record<string, unknown>>;

    if (isText) {
      const textContent = new TextDecoder().decode(new Uint8Array(buf));
      userContent = [
        {
          type: "text",
          text: userText + "\n\nDocument content:\n" + textContent,
        },
      ];
    } else if (finalType === "id_document") {
      // ID docs: always vision (image_url), including scanned PDFs as data URL — not extracted text.
      userContent = [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: dataUrl } },
      ];
    } else if (isPdf) {
      const pdfText = tryExtractDigitalPdfText(buf);
      if (pdfText) {
        userContent = [
          {
            type: "text",
            text: userText + "\n\nDocument content (extracted from PDF):\n" + pdfText,
          },
        ];
      } else {
        throw new Error(
          "This PDF looks scanned or image-based (no usable text). " +
            "Upload a text-based PDF export from your bank, or a CSV/text statement.",
        );
      }
    } else {
      userContent = [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: dataUrl } },
      ];
    }

    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: 4096,
      }),
    });

    if (!openaiResp.ok) {
      const t = await openaiResp.text();
      throw new Error(`OpenAI error: ${openaiResp.status} ${t}`);
    }

    const openaiJson = await openaiResp.json();
    const content =
      openaiJson?.choices?.[0]?.message?.content as string | undefined;
    const totalTokens = openaiJson?.usage?.total_tokens as number | undefined;

    if (!content) throw new Error("Empty response from OpenAI");

    const extracted = parseJsonFromModelText(content);
    const fieldsPopulated: string[] = [];

    if (finalType === "payslip") {
      if (!application_id) {
        throw new Error("application_id is required for payslip parsing");
      }
      const { data: applicant, error: aErr } = await supabase
        .from("applicants")
        .select("id")
        .eq("application_id", application_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (aErr) throw new Error(aErr.message);
      if (!applicant?.id) {
        throw new Error("No applicant found for this application");
      }

      const gross = Number((extracted.gross_salary ?? extracted.gross) ?? 0);
      const freq = String(
        (extracted.pay_frequency ?? extracted.salary_frequency) ?? "monthly",
      );
      const annual = annualFromGrossAndFrequency(
        gross,
        freq,
      );

      const incomePayload = {
        applicant_id: applicant.id,
        income_type: "salary",
        gross_salary: gross,
        salary_frequency: freq,
        annual_gross_total: annual,
        parsed_from_document_id: document_id,
        parsed_bank_name: String(extracted.employer_name ?? ""),
        verified: false,
      };

      const { data: existingIncome } = await supabase
        .from("income")
        .select("id")
        .eq("applicant_id", applicant.id)
        .eq("parsed_from_document_id", document_id)
        .maybeSingle();

      if (existingIncome?.id) {
        const { error: upErr } = await supabase
          .from("income")
          .update(incomePayload)
          .eq("id", existingIncome.id);
        if (upErr) throw new Error(upErr.message);
      } else {
        const { error: insErr } = await supabase
          .from("income")
          .insert(incomePayload);
        if (insErr) throw new Error(insErr.message);
      }

      fieldsPopulated.push(
        "income_type",
        "gross_salary",
        "salary_frequency",
        "annual_gross_total",
        "parsed_from_document_id",
        "parsed_bank_name",
      );
    } else if (finalType === "bank_statement") {
      if (!application_id) {
        throw new Error("application_id is required for bank statement parsing");
      }
      const risk = bankStatementRiskFromExtracted(extracted);
      const months = monthsAnalysed(
        extracted.statement_period_start,
        extracted.statement_period_end,
      );
      const avgCredits = Number(
        (extracted.average_monthly_credits ?? extracted.total_credits) ?? 0,
      );

      const row = {
        application_id,
        firm_id,
        document_id,
        regular_income_monthly: avgCredits,
        has_gambling_transactions: risk.gambling,
        has_buy_now_pay_later: risk.bnpl,
        has_dishonour_fees: risk.dishonour,
        months_analysed: months,
        updated_at: new Date().toISOString(),
      };

      const { error: bErr } = await supabase
        .from("bank_statement_analysis")
        .upsert(row, {
          onConflict: "application_id,document_id",
        });

      if (bErr) throw new Error(bErr.message);

      fieldsPopulated.push(
        "regular_income_monthly",
        "has_gambling_transactions",
        "has_buy_now_pay_later",
        "has_dishonour_fees",
        "months_analysed",
      );
    } else {
      fieldsPopulated.push(...Object.keys(extracted));
    }

    const summary = buildParseSummary(finalType, extracted);

    if (useQueue && parseQueueId) {
      const { error: doneErr } = await supabase
        .from("document_parse_queue")
        .update({
          status: "completed",
          extracted_data: extracted,
          fields_populated: fieldsPopulated,
          tokens_used: totalTokens ?? null,
          model_used: "gpt-4o",
          completed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", parseQueueId);

      if (doneErr) throw new Error(doneErr.message);
    } else {
      const docUpdate: Record<string, unknown> = {
        parse_status: "parsed",
        parsed_at: new Date().toISOString(),
        detected_type: finalType,
      };
      const { error: docUpErr } = await supabase
        .from("documents")
        .update(docUpdate)
        .eq("id", document_id);
      if (docUpErr) {
        console.warn("documents parse_status update:", docUpErr.message);
      }
    }

    const payloadOut = {
      success: true,
      ok: true,
      summary,
      detected_type: finalType,
      extracted_data: extracted,
      populated_fields: fieldsPopulated,
      extracted,
      fields_populated: fieldsPopulated,
    };

    const docClientId = String(docRec.client_id ?? "").trim();
    const docApplicationId = String((docRec.application_id ?? application_id) ?? "").trim();
    const embedText = `${summary}\n\n${JSON.stringify(extracted)}`;
    const embedSourceType = finalType === "bank_statement" ? "bank_statement" : "document";
    void invokeGenerateEmbeddings(supabase, {
      content: embedText,
      firm_id,
      source_type: embedSourceType,
      source_id: document_id,
      client_id: docClientId || null,
      application_id: docApplicationId || null,
      metadata: {
        detected_type: finalType,
        document_id,
        parse_queue_id: parseQueueId ?? null,
      },
    });

    return new Response(
      JSON.stringify(payloadOut),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (parseQueueId) {
      await supabase
        .from("document_parse_queue")
        .update({ status: "failed", error_message: msg })
        .eq("id", parseQueueId);
    } else if (documentIdForCatch) {
      await supabase
        .from("documents")
        .update({ parse_status: "failed" })
        .eq("id", documentIdForCatch);
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
