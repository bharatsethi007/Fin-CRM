// Flow Intelligence Agent Edge Function
// Routes: POST /flow-intelligence-agent
// Handles: intent parsing, action execution, response generation

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function invokeGenerateEmbeddings(supabase: any, body: Record<string, unknown>) {
  try {
    await supabase.functions.invoke("generate-embeddings", { body });
  } catch (e) {
    console.warn("generate-embeddings invoke failed:", e);
  }
}

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── System prompt — the agent's identity and rules ──────────────
function buildSystemPrompt(context: any, actions: any[], crmContextFromClient?: string | null) {
  const actionList = actions.map(a =>
    `- ${a.action_key}: ${a.description} (${a.category}, confirmation_required: ${a.requires_confirmation})`
  ).join("\n");

  const crmBlock =
    crmContextFromClient && String(crmContextFromClient).trim().length > 0
      ? `

## Live CRM snapshot (this session — use for real names, emails, application refs)
The broker's workdesk data below is current. Prefer these facts when drafting emails or answering questions about clients and deals.
${String(crmContextFromClient).trim()}
`
      : "";

  return `You are Flow Intelligence, an AI agent built into AdvisorFlow — a NZ mortgage broker CRM.
You help mortgage advisers by answering questions AND taking real actions in the system.

## Your capabilities
${actionList}
Use **search_clients** (tool) when you need to find an existing client before creating duplicates.

## Current broker context
- Firm: ${context.firm?.name || "Unknown"}
- Adviser: ${context.advisor?.first_name} ${context.advisor?.last_name}
- Total clients in system: ${context.client_count ?? 0}
- Active applications: ${context.pipeline?.total_active || 0}
- Open anomalies: ${context.anomalies?.total || 0} (${context.anomalies?.critical || 0} critical)
- Commission expected this month: $${Math.round(context.commissions?.expected_this_month || 0).toLocaleString()}
- Refix alerts (90 days): ${context.refix_alerts?.due_90_days || 0}
${context.current_application ? `- Current application in focus: ${context.current_application.id} — ${context.current_application_client}` : ""}

## NZ Regulatory context
- All advice must comply with CCCFA, FMC Act 2013, FAA 2008
- Never recommend specific products without adviser review caveat
- Flag CCCFA affordability concerns proactively

## How you work (tools)
- You have **function tools** registered for this firm (CRM actions) plus built-in tools (search, **rag_search** for semantic search over embedded notes and parsed documents, applications, compliance, serviceability, LVR/DTI, pipeline, deadlines, commissions, rates, refix, notes, client/application CRUD, workflows, etc.).
- **Call tools** whenever you need real CRM data or to perform an action — you may chain multiple tool calls across turns until you have enough to answer.
- After tools return, **summarise results in plain language** for the broker. Do not output JSON or structured "intent" blocks — only natural language in your final reply.
- When you use tools that return structured data (**calculate_serviceability**, **get_pipeline_summary**, **check_compliance**, **calculate_lvr**, **get_upcoming_deadlines**), keep your text response brief — just summarise the conclusion in 1–2 sentences. The UI renders those results as visual cards, so **do not repeat the numbers, tables, or checklist rows** in your prose.
- For destructive or sensitive actions, follow tool results: **create_client**, **create_application**, **update_client**, and **update_application_stage** return \`requires_confirmation: true\` until the broker taps **Confirm** in Flow Intelligence — summarise the pending change and do not state it is complete until confirmed.
- For registry actions that require confirmation, explain clearly what will happen and ask them to confirm in the app.

## Workflow Executor
You can run predefined multi-step workflows using the **run_workflow** tool. Available workflows:
- **onboard_new_client**: Creates client, application, compliance checklist, document request tasks, and welcome email
- **pre_submission_checklist**: Checks all documents, runs serviceability/LVR/DTI calculations, verifies compliance
- **settlement_prep**: Verifies approvals, insurance, solicitor details, creates settlement tasks
- **annual_review**: Compares current vs market rates, calculates savings, drafts review email
- **refix_outreach**: Finds expiring fixed rates, calculates savings, drafts personalised emails

When a broker says things like "onboard John Smith" or "prep Blair's application for submission" or "do annual reviews", use the appropriate workflow.

## Executor Mindset — DO, don't just LIST
You are an **EXECUTOR**, not a reporter. When a broker asks about overdue tasks, problems, or things that need attention:

1. **FIRST** identify the issues (use tools to search/query)
2. **THEN** take action on each one **without** being asked:
   - Overdue task about calling a client? → **Draft the email** AND **create a new follow-up task**
   - Missing compliance documents? → **Draft a document request email** to the client
   - Stale application sitting in draft? → **Create a task** to follow up and **draft a nudge email**
   - Upcoming settlement? → **Check all requirements** and flag what's missing

3. **PRESENT what you DID**, not what needs doing:
   - **BAD:** "You have 6 overdue tasks: 1. Call Ben 2. Set up compliance..."
   - **GOOD:** "You had 6 overdue tasks. I've handled them:
          ✓ Drafted follow-up email to Ben Cooper (ready to send)
          ✓ Created document request emails for Kate Allen and Blair Matthews
          ✓ Rescheduled stale application follow-ups with new tasks for tomorrow
          ✓ Flagged Statement of Advice as high priority"

4. For anything that requires broker approval (sending emails, updating data), **draft it** and present for confirmation rather than just listing it.

5. When running workflows or handling multiple items, **chain your tool calls**:
   - Use **search_clients** to find the client
   - Use **get_client_details** to get their email
   - Use **draft_email** to create the email
   - Use **create_task** for follow-ups
   Do this for **EACH** item, not just the first one.

**REMEMBER:** Brokers are paying for an AI that **DOES** the work, not one that tells them what work needs doing. They already know what needs doing — they want **YOU** to do it.

## Rules
1. If the broker asks a question you can answer from context or after a quick tool lookup, do so — use tools when the CRM snapshot is not enough.
2. Prefer **search_clients** / **search_applications** before creating duplicate records.
3. **draft_email** only produces a draft — it does not send email.
4. Keep responses concise — brokers are busy
5. When you detect a compliance issue, flag it clearly
6. Never make up data — if you don't have it, say so and suggest how to get it (including which tool to use)
7. Speak like a knowledgeable colleague, not a chatbot
8. When you call tools that return structured data (**calculate_serviceability**, **get_pipeline_summary**, **check_compliance**, **calculate_lvr**, **get_upcoming_deadlines**), keep your text response to 1–2 sentences summarizing the conclusion. Do **not** repeat the numbers or data in your text — the UI automatically renders the tool results as visual cards. Just say things like "Blair passes serviceability with a strong surplus" or "Your pipeline looks healthy with $5.7M across 17 deals" without listing the individual numbers.

## Critical memory rules
- ALWAYS read the full conversation history before responding
- If the broker mentioned a client name 3 messages ago, that name is still in scope — carry it forward in ALL subsequent responses
- When the broker provides just an email, phone or extra detail, it is answering YOUR previous question — connect it to the pending context automatically
- Never ask for information already provided in the conversation
- Build up a mental model of what you know as the conversation progresses:
  Known: {extract all client/application details mentioned so far}
  Missing: {only ask for what's genuinely not yet provided}
- When you have: name + email + phone → proceed to confirmation
- When you have: name + email (no phone) → proceed to confirmation, phone can be added later

## Conversational data collection
When creating clients or applications, you MUST collect required information through conversation before proceeding. Follow these rules:

REQUIRED for creating a client:
- Full name (first and last)
- Email address
- Phone number

REQUIRED for creating an application:
- Loan purpose (first home / investment / refinance / top-up)
- Rough loan amount OR property value

OPTIONAL (ask only if not provided, don't block on these):
- Date of birth, address, employment details

If ANY required field is missing, do not call create-type registry tools yet.
Instead respond conversationally asking for the missing info.
Keep it to ONE question at a time — don't bombard with a list.

Example flows:

User: "New client John Smith"
Agent: (reply only) "Happy to create John's profile. What is his email address?"

User: "john@example.com"
Agent: (reply only) "Got it. And what's the best phone number for John?"

User: "021 456 789"
Agent: Call the appropriate registry tool (e.g. create_client) with full parameters drawn from the whole thread, then confirm with the broker if the tool result requires it.

IMPORTANT: Carry forward ALL information from the conversation history when calling tools. If the user said the name 3 messages ago, include it in the tool arguments now.

When all required fields are collected across multiple turns:
- Summarise what you're about to do
- Call the tool with complete parameters
- If the system requires confirmation, say so clearly${crmBlock}`;
}

/** Extra system instructions when the broker uploaded files in this request. */
function documentFilingInstructions(
  attached: unknown[],
  applicationId: string | null | undefined,
): string {
  if (!attached || attached.length === 0) return "";
  const ctxApp = applicationId && String(applicationId).trim() ? String(applicationId).trim() : "none";
  return `

## Document filing (this turn only)
The broker attached file(s). Metadata is under \`[Attached files metadata]\` in the latest user message.

1. Use **search_clients** / **search_applications** if you need UUIDs — match names from the broker's message, filename, or CRM snapshot.
2. Call **process_document** once with an \`items\` array (one entry per file). Pass through from metadata: \`storage_path\`, \`public_url\`, \`file_name\`, \`mime_type\`, \`size_bytes\`, \`file_hash\` (if present).
3. For each item set:
   - **detected_type**: payslip | bank_statement | tax_return | photo_id | proof_of_address | authority_to_proceed | sale_and_purchase | loan_application | insurance | valuation | solicitor_letter | other
   - **suggested_category** (exact string): '01 Fact Find' | '02 Financial Evidence' | '03 Property Documents' | '04 Lender Application' | '05 Compliance' | '06 Insurance' | '07 Settlement' | '08 Ongoing Reviews'
   - **client_id** (required): UUID of the client
   - **application_id** (optional): UUID; use **${ctxApp}** when it fits the broker's intent, else null
4. Do **not** claim documents are saved — the UI shows a confirmation card; filing happens when the broker taps Confirm.
5. If the client cannot be determined, call **process_document** with your best-effort client_id after **search_clients**, or use the closest match and note uncertainty in **confidence_note** — you may also ask a short clarifying question in your reply.
`;
}

/** Built-in tools (always available alongside fi_action_registry tools). */
const builtInTools = [
  {
    type: "function",
    function: {
      name: "search_clients",
      description: "Search CRM clients by name, email or phone",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term - name, email or phone" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_applications",
      description:
        "Search loan applications by reference number (exact or partial), application UUID, client name, or optional workflow_stage filter",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Reference, UUID, or client name fragment" },
          status: {
            type: "string",
            enum: ["draft", "submitted", "conditional", "unconditional", "settled", "declined"],
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_details",
      description: "Get full details of a specific client including financials, documents, applications",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
        },
        required: ["client_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description: "Draft an email to a client or lender. Returns the draft for broker review.",
      parameters: {
        type: "object",
        properties: {
          to_email: { type: "string" },
          to_name: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          purpose: { type: "string", description: "e.g. follow-up, document request, update, introduction" },
        },
        required: ["to_email", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a task/reminder for the broker",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          due_date: { type: "string", description: "ISO date" },
          priority: { type: "string", enum: ["High", "Medium", "Low"] },
          client_id: { type: "string" },
          application_id: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_application_full",
      description:
        "Get complete application details including applicants, income, expenses, assets, liabilities, documents, and compliance status",
      parameters: {
        type: "object",
        properties: {
          application_id: {
            type: "string",
            description: "Application UUID or reference number (e.g. AF-20260331-3894)",
          },
        },
        required: ["application_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_compliance",
      description:
        "Check what documents and requirements are missing for an application. Returns completed and outstanding items against CCCFA-style requirements.",
      parameters: {
        type: "object",
        properties: {
          application_id: { type: "string" },
        },
        required: ["application_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_document_status",
      description:
        "List documents for a client and/or application with status (valid, expiring, expired) derived from expiry metadata.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string" },
          application_id: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_serviceability",
      description:
        "Calculate maximum borrowing capacity based on income, expenses and existing debts. Uses NZ-style stress test rate (default 8.5% p.a.).",
      parameters: {
        type: "object",
        properties: {
          application_id: { type: "string" },
          test_rate: { type: "number", description: "Annual stress-test rate %, default 8.5" },
          interest_rate: { type: "number", description: "Alias for test_rate (annual %)" },
          loan_term_years: { type: "number", description: "Default 30" },
        },
        required: ["application_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_lvr",
      description:
        "Calculate Loan-to-Value Ratio. Flags if above 80% (low equity premium may apply).",
      parameters: {
        type: "object",
        properties: {
          loan_amount: { type: "number" },
          property_value: { type: "number" },
        },
        required: ["loan_amount", "property_value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_dti",
      description:
        "Debt-to-income view for an application: liability balances, loan amount vs gross annual income; compare to common RBNZ discussion (~6x investor / ~7x owner-occupier as loan-to-income multiples).",
      parameters: {
        type: "object",
        properties: { application_id: { type: "string" } },
        required: ["application_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_alerts",
      description:
        "Get all upcoming deadlines, expiring documents, rate refixes, settlement dates, and overdue tasks for the firm",
      parameters: {
        type: "object",
        properties: {
          days_ahead: { type: "number", description: "How many days to look ahead, default 30" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_rates",
      description: "Compare current mortgage rates across NZ lenders for a given loan amount and type",
      parameters: {
        type: "object",
        properties: {
          loan_amount: { type: "number" },
          rate_type: {
            type: "string",
            enum: ["fixed_1yr", "fixed_2yr", "fixed_3yr", "fixed_5yr", "floating"],
          },
          lender: { type: "string", description: "Specific lender to check, or omit for all" },
        },
        required: ["loan_amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_summary",
      description:
        "Get firm-wide summary: total pipeline value, applications by stage, overdue tasks, commission forecast, upcoming settlements",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_summary",
      description:
        "Pipeline overview for the firm: applications by stage, total value, pending and overdue tasks.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_upcoming_deadlines",
      description:
        "Tasks and settlements due between today and the next N days (default 14).",
      parameters: {
        type: "object",
        properties: { days: { type: "number", description: "Default 14" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_commission_forecast",
      description:
        "Commission snapshot: received this month, expected in horizon, trail-style rows if present.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_note",
      description: "Add a note to a client or application record",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          client_id: { type: "string" },
          application_id: { type: "string" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rag_search",
      description:
        "Search across all documents, notes, bank statements, and client data using semantic search. Use this when the broker asks about document contents, past conversations, or needs to find specific information across their CRM data.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language search query" },
          source_type: {
            type: "string",
            enum: ["document", "note", "conversation", "bank_statement", "client_profile"],
            description: "Optional: filter by source type",
          },
          client_id: { type: "string", description: "Optional: filter by specific client" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_application_stage",
      description:
        "Move an application to a new workflow stage (draft, submitted, conditional, unconditional, settled, declined)",
      parameters: {
        type: "object",
        properties: {
          application_id: { type: "string" },
          new_stage: {
            type: "string",
            enum: ["draft", "submitted", "conditional", "unconditional", "settled", "declined"],
          },
          reason: { type: "string", description: "Why the stage changed" },
        },
        required: ["application_id", "new_stage"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_client",
      description: "Update client contact and profile fields for this firm.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string" },
          updates: {
            type: "object",
            description:
              "e.g. email, phone, residential_address, employment_status, employer_name, annual_income, first_name, last_name, city, date_of_birth",
          },
        },
        required: ["client_id", "updates"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_client",
      description: "Create a new client record.",
      parameters: {
        type: "object",
        properties: {
          first_name: { type: "string" },
          last_name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          residential_address: { type: "string" },
          date_of_birth: { type: "string" },
          employment_status: { type: "string" },
          annual_income: { type: "number" },
        },
        required: ["first_name", "last_name", "email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_application",
      description: "Create a new loan application for an existing client.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string" },
          application_type: {
            type: "string",
            enum: ["purchase", "refinance", "top_up", "construction"],
          },
          loan_amount: { type: "number" },
          property_value: { type: "number" },
          loan_purpose: { type: "string" },
          property_address: { type: "string" },
        },
        required: ["client_id", "application_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_lender_rates",
      description:
        "Compare indicative NZ mortgage rates across major banks (and optional live market_rates rows when available).",
      parameters: {
        type: "object",
        properties: {
          rate_type: {
            type: "string",
            enum: [
              "floating",
              "fixed_6m",
              "fixed_1yr",
              "fixed_18m",
              "fixed_2yr",
              "fixed_3yr",
              "fixed_5yr",
            ],
          },
          loan_amount: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_refix_opportunities",
      description:
        "Find settled loans whose fixed rate expires within N days (from settled_loans.current_rate_expiry_date).",
      parameters: {
        type: "object",
        properties: { days_ahead: { type: "number", description: "Default 90" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_workflow",
      description:
        "Predefined multi-step workflow plan (onboard_new_client, pre_submission_checklist, settlement_prep, annual_review, refix_outreach). Returns steps for the agent to execute.",
      parameters: {
        type: "object",
        properties: {
          workflow_name: {
            type: "string",
            enum: [
              "onboard_new_client",
              "pre_submission_checklist",
              "settlement_prep",
              "annual_review",
              "refix_outreach",
            ],
          },
          client_id: { type: "string" },
          application_id: { type: "string" },
        },
        required: ["workflow_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "process_document",
      description:
        "Propose how to file uploaded documents (metadata only in chat). Validates client/application belong to the firm. Does not write to the documents table — the broker confirms in the UI.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "One entry per attached file",
            items: {
              type: "object",
              properties: {
                storage_path: { type: "string", description: "Object path in documents bucket" },
                public_url: { type: "string" },
                file_name: { type: "string" },
                mime_type: { type: "string" },
                size_bytes: { type: "number" },
                file_hash: { type: "string", description: "SHA-256 hex if provided in metadata" },
                client_id: { type: "string", description: "UUID — required for a valid proposal" },
                application_id: { type: "string", description: "UUID or omit/null" },
                detected_type: {
                  type: "string",
                  enum: [
                    "payslip",
                    "bank_statement",
                    "tax_return",
                    "photo_id",
                    "proof_of_address",
                    "authority_to_proceed",
                    "sale_and_purchase",
                    "loan_application",
                    "insurance",
                    "valuation",
                    "solicitor_letter",
                    "other",
                  ],
                },
                suggested_category: {
                  type: "string",
                  enum: [
                    "01 Fact Find",
                    "02 Financial Evidence",
                    "03 Property Documents",
                    "04 Lender Application",
                    "05 Compliance",
                    "06 Insurance",
                    "07 Settlement",
                    "08 Ongoing Reviews",
                  ],
                },
                confidence_note: { type: "string" },
              },
              required: ["storage_path", "file_name", "detected_type", "suggested_category"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
] as const;

const BUILT_IN_TOOL_NAMES = new Set([
  "search_clients",
  "search_applications",
  "get_client_details",
  "get_application_full",
  "check_compliance",
  "check_document_status",
  "calculate_serviceability",
  "calculate_lvr",
  "calculate_dti",
  "get_alerts",
  "compare_rates",
  "compare_lender_rates",
  "get_dashboard_summary",
  "get_pipeline_summary",
  "get_upcoming_deadlines",
  "get_commission_forecast",
  "draft_email",
  "create_task",
  "add_note",
  "rag_search",
  "update_application_stage",
  "update_client",
  "create_client",
  "create_application",
  "check_refix_opportunities",
  "run_workflow",
  "process_document",
]);

/** Built-in tools that mutate CRM data — preview only until broker confirms in-app. */
const DESTRUCTIVE_BUILT_IN_TOOLS = new Set([
  "create_client",
  "create_application",
  "update_application_stage",
  "update_client",
]);

function destructiveBuiltInPreview(
  tool: string,
  args: Record<string, unknown>,
): {
  requires_confirmation: true;
  summary: string;
  pending_built_in: { tool: string; args: Record<string, unknown> };
  note: string;
} {
  const pending_built_in = { tool, args: JSON.parse(JSON.stringify(args)) as Record<string, unknown> };
  let summary = "";
  switch (tool) {
    case "create_client": {
      const fn = String(args.first_name ?? "").trim();
      const ln = String(args.last_name ?? "").trim();
      const em = String(args.email ?? "").trim();
      summary = `Create client ${fn} ${ln} (${em}).`;
      break;
    }
    case "create_application": {
      const cid = String(args.client_id ?? "").trim();
      const at = String(args.application_type ?? "").trim();
      const la = typeof args.loan_amount === "number" ? args.loan_amount : Number(args.loan_amount) || 0;
      const pv = typeof args.property_value === "number" ? args.property_value : null;
      const pa = args.property_address ? String(args.property_address).slice(0, 120) : "";
      summary = `Create ${at} application for client ${cid} — loan ${la}${
        pv != null && !Number.isNaN(pv) ? `, property value ${pv}` : ""
      }${pa ? `, address: ${pa}` : ""}.`;
      break;
    }
    case "update_client": {
      const cid = String(args.client_id ?? "").trim();
      const u = args.updates && typeof args.updates === "object" ? args.updates as Record<string, unknown> : {};
      const keys = Object.keys(u);
      summary = `Update client ${cid} — fields: ${keys.join(", ") || "(none)"}.`;
      break;
    }
    case "update_application_stage": {
      const aid = String(args.application_id ?? "").trim();
      const st = String(args.new_stage ?? "").trim();
      const rs = args.reason ? String(args.reason).slice(0, 200) : "";
      summary = `Set application ${aid} to stage "${st}"${rs ? ` — ${rs}` : ""}.`;
      break;
    }
    default:
      summary = `Apply ${tool}.`;
  }
  return {
    requires_confirmation: true,
    summary,
    pending_built_in,
    note:
      "Not applied yet. Summarise this for the broker and ask them to confirm in Flow Intelligence (Confirm button). Do not claim the change is done until they confirm.",
  };
}

function registryRowToOpenAITool(row: Record<string, unknown>): {
  type: string;
  function: { name: string; description: string; parameters: Record<string, unknown> };
} {
  const rawKey = String(row.action_key ?? "action");
  const name = rawKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "action";
  let parameters = row.parameter_schema ?? row.parameters_schema ?? row.json_schema;
  if (
    !parameters || typeof parameters !== "object" ||
    (parameters as { type?: string }).type !== "object"
  ) {
    parameters = {
      type: "object",
      description:
        `Arguments for ${name}. Pass fields expected by this action (see registry description).`,
      properties: {},
      additionalProperties: true,
    };
  }
  const desc = `${String(row.description || name)} [${String(row.category || "general")}]${
    row.requires_confirmation
      ? " — may require broker confirmation in the app before side effects apply."
      : ""
  }`;
  return { type: "function", function: { name, description: desc, parameters: parameters as Record<string, unknown> } };
}

/** Built-in tools first, then fi_action_registry (skip duplicate names). */
function buildOpenAITools(actions: Record<string, unknown>[]): unknown[] {
  const tools: unknown[] = [];
  const seen = new Set<string>();
  for (const t of builtInTools) {
    const n = (t as { function: { name: string } }).function.name;
    seen.add(n);
    tools.push(t);
  }
  for (const a of actions) {
    const key = String(a.action_key ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    tools.push(registryRowToOpenAITool(a));
  }
  return tools;
}

type ExecContext = {
  supabase: ReturnType<typeof createClient>;
  firmId: string;
  advisorId: string;
};

function execResultNeedsConfirmation(res: Record<string, unknown> | null): boolean {
  if (!res || typeof res !== "object") return false;
  if (res.requires_confirmation === true) return true;
  if (res.needs_confirmation === true) return true;
  if (res.awaiting_confirmation === true) return true;
  if (res.pending_confirmation === true) return true;
  return false;
}

function docNameLower(d: Record<string, unknown>): string {
  return String(d.name ?? "").toLowerCase();
}

function docCategoryLower(d: Record<string, unknown>): string {
  return String(d.category ?? "").toLowerCase();
}

/** Required items vs uploaded docs (name/category heuristics). */
const COMPLIANCE_REQUIREMENTS: { id: string; label: string; satisfied: (docs: Record<string, unknown>[]) => boolean }[] = [
  {
    id: "authority",
    label: "Signed authority to proceed",
    satisfied: (docs) =>
      docs.some((d) => /authority|a2p|dealing|mandate|letter of authority/i.test(docNameLower(d))),
  },
  {
    id: "photo_id",
    label: "Photo ID",
    satisfied: (docs) =>
      docs.some((d) =>
        docCategoryLower(d) === "id" || /passport|driver|licen[sc]e|photo id|identity/i.test(docNameLower(d))
      ),
  },
  {
    id: "proof_address",
    label: "Proof of address",
    satisfied: (docs) =>
      docs.some((d) => /proof of address|utility|rates notice|address verification|tenancy agreement/i.test(docNameLower(d))),
  },
  {
    id: "bank_statements",
    label: "3 months bank statements",
    satisfied: (docs) =>
      docs.some((d) =>
        /bank statement|3\s*month|three month|transaction history/i.test(docNameLower(d)) ||
        (docCategoryLower(d).includes("financial") && /statement|bank/i.test(docNameLower(d)))
      ),
  },
  {
    id: "proof_income",
    label: "Proof of income",
    satisfied: (docs) =>
      docs.some((d) =>
        /payslip|pay slip|income|salary|ird|tax summary|employment letter/i.test(docNameLower(d)) ||
        (docCategoryLower(d).includes("financial") && /income|payslip/i.test(docNameLower(d)))
      ),
  },
  {
    id: "loan_application",
    label: "Signed loan application",
    satisfied: (docs) =>
      docs.some((d) =>
        /loan application|application form|lender application|signed application|fact find/i.test(docNameLower(d)) ||
        docCategoryLower(d).includes("lender") || docCategoryLower(d).includes("04")
      ),
  },
];

function buildComplianceChecklist(docs: Record<string, unknown>[]) {
  const completed: { id: string; label: string }[] = [];
  const outstanding: { id: string; label: string }[] = [];
  for (const req of COMPLIANCE_REQUIREMENTS) {
    if (req.satisfied(docs)) completed.push({ id: req.id, label: req.label });
    else outstanding.push({ id: req.id, label: req.label });
  }
  return {
    document_count: docs.length,
    completed,
    outstanding,
    all_complete: outstanding.length === 0,
  };
}

function rowAnnualIncome(row: Record<string, unknown>): number {
  const parts: number[] = [];
  const np = Number(row.net_profit);
  if (!Number.isNaN(np) && np > 0) parts.push(np);
  const rim = Number(row.regular_income_monthly);
  if (!Number.isNaN(rim) && rim > 0) parts.push(rim * 12);
  const rgm = Number(row.rental_gross_monthly);
  if (!Number.isNaN(rgm) && rgm > 0) {
    const pct = (Number(row.rental_ownership_percent) || 100) / 100;
    parts.push(rgm * 12 * pct);
  }
  const oa = Number(row.other_income_amount);
  if (!Number.isNaN(oa) && oa > 0) {
    const f = String(row.other_income_frequency ?? "").toLowerCase();
    let ann = oa * 12;
    if (f.includes("week")) ann = oa * 52;
    else if (f.includes("fortnight")) ann = oa * 26;
    else if (f.includes("year") || f.includes("annual")) ann = oa;
    parts.push(ann);
  }
  return parts.length > 0 ? Math.max(...parts) : 0;
}

function sumMonthlyExpensesForApplication(expRows: Record<string, unknown>[]): number {
  let s = 0;
  for (const r of expRows) {
    const tm = Number((r as { total_monthly?: unknown }).total_monthly);
    if (!Number.isNaN(tm) && tm > 0) {
      s += tm;
      continue;
    }
    for (const [k, v] of Object.entries(r)) {
      if (
        ["id", "application_id", "firm_id", "created_at", "updated_at", "client_id", "notes", "description"].includes(
          k,
        )
      ) continue;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isNaN(n) && n > 0 && n < 500_000) s += n;
    }
  }
  return s;
}

function liabilityMonthlyRepayment(l: Record<string, unknown>): number {
  const mr = Number(l.monthly_repayment);
  if (!Number.isNaN(mr) && mr > 0) return mr;
  const ra = Number(l.repayment_amount);
  if (Number.isNaN(ra) || ra <= 0) return 0;
  const f = String(l.repayment_frequency ?? "monthly").toLowerCase();
  if (f.includes("week")) return (ra * 52) / 12;
  if (f.includes("fortnight")) return (ra * 26) / 12;
  if (f.includes("year") || f.includes("annual")) return ra / 12;
  return ra;
}

/** Max loan (PV) given monthly payment, annual rate, term in years — standard amortisation. */
function maxBorrowingFromPayment(monthlyAvailable: number, annualRate: number, termYears: number): number {
  const r = annualRate / 12;
  const n = Math.max(1, Math.round(termYears * 12));
  if (!(monthlyAvailable > 0) || !(r > 0)) return 0;
  const factor = (1 - Math.pow(1 + r, -n)) / r;
  return monthlyAvailable * factor;
}

const RATE_TYPE_TO_DB: Record<string, string> = {
  fixed_6m: "fixed_6m",
  fixed_1yr: "fixed_1yr",
  fixed_18m: "fixed_18m",
  fixed_2yr: "fixed_2yr",
  fixed_3yr: "fixed_3yr",
  fixed_5yr: "fixed_5yr",
  floating: "floating",
};

/** Indicative snapshot for compare_lender_rates (supplement market_rates when empty). */
const INDICATIVE_NZ_LENDER_RATES: Record<string, Record<string, number>> = {
  ANZ: { floating: 7.74, fixed_6m: 5.69, fixed_1yr: 5.59, fixed_18m: 5.44, fixed_2yr: 5.29, fixed_3yr: 5.49, fixed_5yr: 5.69 },
  ASB: { floating: 7.74, fixed_6m: 5.69, fixed_1yr: 5.59, fixed_18m: 5.44, fixed_2yr: 5.29, fixed_3yr: 5.49, fixed_5yr: 5.69 },
  BNZ: { floating: 7.74, fixed_6m: 5.69, fixed_1yr: 5.59, fixed_18m: 5.44, fixed_2yr: 5.29, fixed_3yr: 5.49, fixed_5yr: 5.69 },
  Westpac: { floating: 7.74, fixed_6m: 5.69, fixed_1yr: 5.59, fixed_18m: 5.44, fixed_2yr: 5.29, fixed_3yr: 5.49, fixed_5yr: 5.69 },
  Kiwibank: { floating: 7.24, fixed_6m: 5.59, fixed_1yr: 5.49, fixed_18m: 5.34, fixed_2yr: 5.19, fixed_3yr: 5.39, fixed_5yr: 5.59 },
  TSB: { floating: 7.49, fixed_6m: 5.59, fixed_1yr: 5.49, fixed_18m: 5.34, fixed_2yr: 5.19, fixed_3yr: 5.39, fixed_5yr: 5.59 },
};

const WORKFLOW_DEFINITIONS: Record<string, string[]> = {
  onboard_new_client: [
    "Create client record",
    "Create draft application",
    "Generate compliance checklist",
    "Create task: Request ID documents",
    "Create task: Request 3 months bank statements",
    "Create task: Request proof of income",
    "Draft welcome email to client",
    "Create task: Schedule initial consultation",
  ],
  pre_submission_checklist: [
    "Check all required documents uploaded",
    "Verify ID not expired",
    "Calculate serviceability",
    "Calculate LVR",
    "Calculate DTI",
    "Check compliance requirements met",
    "Generate summary for submission",
  ],
  settlement_prep: [
    "Verify unconditional approval received",
    "Check insurance arranged",
    "Verify solicitor details on file",
    "Create task: Confirm settlement date with solicitor",
    "Create task: Confirm funds available",
    "Draft pre-settlement email to client",
  ],
  annual_review: [
    "Pull current loan details",
    "Compare current rate vs market rates",
    "Calculate potential savings",
    "Check if client circumstances changed",
    "Draft annual review email",
  ],
  refix_outreach: [
    "Find all clients with rates expiring in 90 days",
    "For each client: calculate savings at current market rates",
    "Draft personalised refix email for each client",
    "Create follow-up tasks for each client",
  ],
};

function rowAnnualIncomeWithGross(row: Record<string, unknown>): number {
  const ag = Number(row.annual_gross_total);
  if (!Number.isNaN(ag) && ag > 0) return ag;
  return rowAnnualIncome(row);
}

function docMatchesCccfaRequirement(
  d: Record<string, unknown>,
  reqName: string,
  reqCategory: string,
): boolean {
  const n = docNameLower(d);
  const c = String(d.category ?? "");
  const firstToken = reqName.toLowerCase().split(/\s+/)[0] ?? "";
  if (firstToken && n.includes(firstToken)) return true;
  if (reqCategory && c === reqCategory) return true;
  if (reqName.toLowerCase().includes("bank") && /statement|bank|transaction/i.test(n)) return true;
  if (reqName.toLowerCase().includes("photo") && /passport|driver|licen|photo|id/i.test(n)) return true;
  if (reqName.toLowerCase().includes("disclosure") && /disclosure/i.test(n)) return true;
  if (reqName.toLowerCase().includes("privacy") && /privacy|consent/i.test(n)) return true;
  return false;
}

async function fetchDocumentsForApplicationAndClient(
  supabase: ReturnType<typeof createClient>,
  firmId: string,
  applicationId: string,
  clientId: string | null,
): Promise<Record<string, unknown>[]> {
  const sel =
    "id, name, category, status, expiry_date, upload_date, created_at, application_id, client_id";
  const { data: appDocs } = await supabase
    .from("documents")
    .select(sel)
    .eq("firm_id", firmId)
    .eq("application_id", applicationId);
  const byId = new Map<string, Record<string, unknown>>();
  for (const d of appDocs ?? []) {
    const id = String((d as { id?: string }).id ?? "");
    if (id) byId.set(id, d as Record<string, unknown>);
  }
  if (clientId && /^[0-9a-f-]{36}$/i.test(clientId)) {
    const { data: clientDocs } = await supabase
      .from("documents")
      .select(sel)
      .eq("firm_id", firmId)
      .eq("client_id", clientId);
    for (const d of clientDocs ?? []) {
      const id = String((d as { id?: string }).id ?? "");
      if (id) byId.set(id, d as Record<string, unknown>);
    }
  }
  return Array.from(byId.values());
}

async function fetchDocumentsForApplication(
  supabase: ReturnType<typeof createClient>,
  firmId: string,
  applicationId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, name, category, status, expiry_date, upload_date")
    .eq("firm_id", firmId)
    .eq("application_id", applicationId);
  if (error) return [];
  return (data ?? []) as Record<string, unknown>[];
}

type ExecuteBuiltInOptions = { confirmed?: boolean };

async function executeBuiltInTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ExecContext,
  options?: ExecuteBuiltInOptions,
): Promise<string> {
  const { supabase, firmId, advisorId } = ctx;
  const confirmed = options?.confirmed === true;
  try {
    if (name === "search_clients") {
      const query = String(args.query ?? "").trim();
      if (!query) return JSON.stringify({ matches: [], error: "query required" });
      const qlow = query.toLowerCase();
      const { data: rows, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, email, phone")
        .eq("firm_id", firmId)
        .limit(400);
      if (error) return JSON.stringify({ error: error.message, matches: [] });
      const matches = (rows ?? []).filter((c: Record<string, unknown>) => {
        const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
        return full.includes(qlow) ||
          String(c.email ?? "").toLowerCase().includes(qlow) ||
          String(c.phone ?? "").includes(query);
      }).slice(0, 25);
      return JSON.stringify({ matches, count: matches.length });
    }
    if (name === "search_applications") {
      const qRaw = String(args.query ?? "").trim();
      const qLower = qRaw.toLowerCase();
      const statusArg = args.status ? String(args.status) : null;
      const appSearchSelect =
        "id, reference_number, loan_amount, loan_purpose, workflow_stage, application_type, property_address, settlement_date, created_at, clients(id, first_name, last_name, email, phone)";

      let base = supabase
        .from("applications")
        .select(appSearchSelect)
        .eq("firm_id", firmId);
      if (statusArg) base = base.eq("workflow_stage", statusArg);

      if (qRaw) {
        let exactQ = supabase
          .from("applications")
          .select(appSearchSelect)
          .eq("firm_id", firmId)
          .eq("reference_number", qRaw)
          .limit(1);
        if (statusArg) exactQ = exactQ.eq("workflow_stage", statusArg);
        const { data: exactRef, error: exErr } = await exactQ;
        if (exErr) return JSON.stringify({ error: exErr.message, applications: [] });
        if (exactRef && exactRef.length > 0) {
          return JSON.stringify({ applications: exactRef, count: exactRef.length });
        }

        const uuidRe =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRe.test(qRaw)) {
          let idQ = supabase
            .from("applications")
            .select(appSearchSelect)
            .eq("firm_id", firmId)
            .eq("id", qRaw)
            .limit(1);
          if (statusArg) idQ = idQ.eq("workflow_stage", statusArg);
          const { data: idMatch, error: idErr } = await idQ;
          if (idErr) return JSON.stringify({ error: idErr.message, applications: [] });
          if (idMatch && idMatch.length > 0) {
            return JSON.stringify({ applications: idMatch, count: idMatch.length });
          }
        }

        let partialQ = supabase
          .from("applications")
          .select(appSearchSelect)
          .eq("firm_id", firmId)
          .ilike("reference_number", `%${qRaw}%`)
          .limit(10);
        if (statusArg) partialQ = partialQ.eq("workflow_stage", statusArg);
        const { data: partialRef, error: prErr } = await partialQ;
        if (prErr) return JSON.stringify({ error: prErr.message, applications: [] });
        if (partialRef && partialRef.length > 0) {
          return JSON.stringify({ applications: partialRef, count: partialRef.length });
        }

        const { data: pool, error: poolErr } = await base.limit(50);
        if (poolErr) return JSON.stringify({ error: poolErr.message, applications: [] });
        const filtered = (pool ?? []).filter((a: Record<string, unknown>) => {
          const cl = a.clients as { first_name?: string; last_name?: string } | null;
          const clientName = `${cl?.first_name ?? ""} ${cl?.last_name ?? ""}`.toLowerCase();
          return clientName.includes(qLower);
        }).slice(0, 10);
        return JSON.stringify({ applications: filtered, count: filtered.length });
      }

      const { data: rows, error } = await base.limit(10);
      if (error) return JSON.stringify({ error: error.message, applications: [] });
      return JSON.stringify({ applications: rows ?? [], count: (rows ?? []).length });
    }
    if (name === "get_client_details") {
      const client_id = String(args.client_id ?? "").trim();
      if (!client_id) return JSON.stringify({ error: "client_id required" });
      const { data: client, error: ce } = await supabase
        .from("clients")
        .select("*")
        .eq("id", client_id)
        .eq("firm_id", firmId)
        .maybeSingle();
      if (ce || !client) return JSON.stringify({ error: "Client not found" });
      const { data: apps } = await supabase
        .from("applications")
        .select("id, reference_number, status, workflow_stage, loan_amount, lender, application_type")
        .eq("client_id", client_id)
        .eq("firm_id", firmId);
      return JSON.stringify({ client, applications: apps ?? [] });
    }
    if (name === "draft_email") {
      const to_email = String(args.to_email ?? "");
      const subject = String(args.subject ?? "");
      const body = String(args.body ?? "");
      if (!to_email || !subject || !body) {
        return JSON.stringify({ error: "to_email, subject, and body are required" });
      }
      return JSON.stringify({
        draft: {
          to_email,
          to_name: args.to_name ?? null,
          subject,
          body,
          purpose: args.purpose ?? null,
        },
        note: "Draft only — not sent. Broker should review and send from their email client.",
      });
    }
    if (name === "create_task") {
      const title = String(args.title ?? "").trim();
      if (!title) return JSON.stringify({ error: "title required" });
      const pri = String(args.priority ?? "Medium").toLowerCase();
      const priority = pri === "high" ? "high" : pri === "low" ? "low" : "medium";
      const dueRaw = args.due_date ? String(args.due_date) : "";
      const due_date = dueRaw && dueRaw.length >= 8
        ? dueRaw.slice(0, 10)
        : new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          firm_id: firmId,
          title,
          description: args.description ? String(args.description) : null,
          due_date,
          priority,
          client_id: args.client_id ?? null,
          application_id: args.application_id ?? null,
          task_type: "to_do",
          status: "pending",
          created_by: advisorId,
          assigned_to: advisorId,
        })
        .select("id")
        .single();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, task_id: data?.id, title, due_date });
    }
    if (name === "get_application_full") {
      const rawId = String(args.application_id ?? "").trim();
      if (!rawId) return JSON.stringify({ error: "application_id required" });

      const uuidRe =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let applicationId = rawId;
      if (!uuidRe.test(rawId)) {
        const { data: refMatch } = await supabase
          .from("applications")
          .select("id")
          .eq("reference_number", rawId)
          .eq("firm_id", firmId)
          .maybeSingle();
        if (refMatch?.id) applicationId = String(refMatch.id);
      }

      const { data: app, error: ae } = await supabase
        .from("applications")
        .select("*, clients(*)")
        .eq("id", applicationId)
        .eq("firm_id", firmId)
        .maybeSingle();
      if (ae || !app) return JSON.stringify({ error: "Application not found" });

      const appRow = app as Record<string, unknown>;
      const clientId = appRow.client_id ? String(appRow.client_id) : null;

      const [{ data: applicants }, { data: expenses }, { data: assets }, { data: liabilities }] =
        await Promise.all([
          supabase.from("applicants").select("*").eq("application_id", applicationId),
          supabase.from("expenses").select("*").eq("application_id", applicationId),
          supabase.from("assets").select("*").eq("application_id", applicationId),
          supabase.from("liabilities").select("*").eq("application_id", applicationId),
        ]);

      let docsQuery = supabase
        .from("documents")
        .select("id, name, category, status, expiry_date, upload_date, created_at")
        .eq("firm_id", firmId);
      if (clientId) {
        docsQuery = docsQuery.or(
          `application_id.eq.${applicationId},client_id.eq.${clientId}`,
        );
      } else {
        docsQuery = docsQuery.eq("application_id", applicationId);
      }
      const { data: docs } = await docsQuery;

      const applicantIds = (applicants ?? []).map((a: { id: string }) => a.id).filter(Boolean);
      let income: Record<string, unknown>[] = [];
      if (applicantIds.length > 0) {
        const { data: inc } = await supabase.from("income").select("*").in("applicant_id", applicantIds);
        income = inc ?? [];
      }
      const docRows = (docs ?? []) as Record<string, unknown>[];
      const compliance = buildComplianceChecklist(docRows);
      return JSON.stringify({
        application: app,
        applicants: applicants ?? [],
        income,
        expenses: expenses ?? [],
        assets: assets ?? [],
        liabilities: liabilities ?? [],
        documents: docs ?? [],
        compliance_summary: compliance,
      });
    }
    if (name === "check_compliance") {
      const application_id = String(args.application_id ?? "").trim();
      if (!application_id) return JSON.stringify({ error: "application_id required" });
      const { data: app } = await supabase
        .from("applications")
        .select("id, reference_number, workflow_stage, client_id")
        .eq("id", application_id)
        .eq("firm_id", firmId)
        .maybeSingle();
      if (!app) return JSON.stringify({ error: "Application not found" });
      const clientId = (app as { client_id?: string | null }).client_id ?? null;
      const docs = await fetchDocumentsForApplicationAndClient(supabase, firmId, application_id, clientId);
      const required = [
        { name: "Authority to Proceed", category: "05 Compliance" },
        { name: "Photo ID", category: "ID" },
        { name: "Proof of Address", category: "03 Property Documents" },
        { name: "Bank Statements (3 months)", category: "02 Financial Evidence" },
        { name: "Proof of Income", category: "02 Financial Evidence" },
        { name: "Signed Application", category: "04 Lender Application" },
        { name: "Disclosure Statement", category: "05 Compliance" },
        { name: "Privacy Consent", category: "05 Compliance" },
      ] as const;
      const checklist = required.map((req) => {
        const found = docs.find((d) => docMatchesCccfaRequirement(d, req.name, req.category));
        const uploaded = (found?.created_at as string | undefined) ??
          (found?.upload_date as string | undefined) ??
          null;
        return {
          requirement: req.name,
          status: found ? "complete" as const : "missing" as const,
          document: found ? (found.name as string | undefined) ?? null : null,
          uploaded,
        };
      });
      return JSON.stringify({
        application_id,
        reference_number: (app as { reference_number?: string }).reference_number,
        total_requirements: required.length,
        completed: checklist.filter((c) => c.status === "complete").length,
        missing: checklist.filter((c) => c.status === "missing").length,
        checklist,
        ready_to_submit: checklist.every((c) => c.status === "complete"),
        legacy_summary: buildComplianceChecklist(docs),
        documents_sample: docs.slice(0, 20).map((d) => ({
          id: d.id,
          name: d.name,
          category: d.category,
          status: d.status,
          expiry_date: d.expiry_date,
        })),
      });
    }
    if (name === "calculate_serviceability") {
      const application_id = String(args.application_id ?? "").trim();
      if (!application_id) return JSON.stringify({ error: "application_id required" });
      const { data: app } = await supabase
        .from("applications")
        .select("id, loan_amount, reference_number")
        .eq("id", application_id)
        .eq("firm_id", firmId)
        .maybeSingle();
      if (!app) return JSON.stringify({ error: "Application not found" });
      const { data: applicants } = await supabase.from("applicants").select("id").eq("application_id", application_id);
      const applicantIds = (applicants ?? []).map((a: { id: string }) => a.id);
      let incomeRows: Record<string, unknown>[] = [];
      if (applicantIds.length > 0) {
        const { data: inc } = await supabase.from("income").select("*").in("applicant_id", applicantIds);
        incomeRows = inc ?? [];
      }
      const { data: expRows } = await supabase.from("expenses").select("*").eq("application_id", application_id);
      const { data: liabRows } = await supabase.from("liabilities").select("*").eq("application_id", application_id);
      const expenseRows = (expRows ?? []) as Record<string, unknown>[];
      const totalAnnualIncome = incomeRows.reduce((s, r) => s + rowAnnualIncomeWithGross(r), 0);
      const monthlyIncome = totalAnnualIncome / 12;
      const monthlyExpenses = expenseRows.length > 0
        ? (() => {
          const single = expenseRows.find((r) => Number((r as { total_monthly?: unknown }).total_monthly) > 0);
          if (single) return Number((single as { total_monthly?: unknown }).total_monthly) || 0;
          return sumMonthlyExpensesForApplication(expenseRows);
        })()
        : 0;
      const monthlyLiabilities = (liabRows ?? []).reduce(
        (s, l) => s + liabilityMonthlyRepayment(l as Record<string, unknown>),
        0,
      );
      const monthlyCommitments = monthlyExpenses + monthlyLiabilities;
      const availableForRepayment = monthlyIncome - monthlyExpenses - monthlyLiabilities;
      const testRatePct = typeof args.test_rate === "number" && args.test_rate > 0
        ? args.test_rate
        : typeof args.interest_rate === "number" && args.interest_rate > 0
        ? args.interest_rate
        : 8.5;
      const testRateAnnual = testRatePct / 100;
      const termYears = typeof args.loan_term_years === "number" && args.loan_term_years > 0
        ? args.loan_term_years
        : 30;
      const maxBorrowing = maxBorrowingFromPayment(
        Math.max(0, availableForRepayment),
        testRateAnnual,
        termYears,
      );
      const requestedLoan = Number((app as { loan_amount?: unknown }).loan_amount) || 0;
      const totalDebt = (liabRows ?? []).reduce((s, l) => {
        const b = Number((l as { current_balance?: unknown }).current_balance);
        return s + (!Number.isNaN(b) && b > 0 ? b : 0);
      }, 0);
      const balanceDti = totalAnnualIncome > 0 ? totalDebt / totalAnnualIncome : null;
      const loanToIncomeMultiple = totalAnnualIncome > 0
        ? Math.round((requestedLoan / totalAnnualIncome) * 10) / 10
        : null;
      return JSON.stringify({
        application_id,
        reference_number: (app as { reference_number?: string }).reference_number,
        monthly_income: Math.round(monthlyIncome),
        monthly_expenses: Math.round(monthlyExpenses),
        monthly_liabilities: Math.round(monthlyLiabilities),
        monthly_existing_repayments: Math.round(monthlyLiabilities * 100) / 100,
        monthly_commitments: Math.round(monthlyCommitments * 100) / 100,
        available_for_repayment: Math.round(availableForRepayment),
        max_borrowing_capacity: Math.round(maxBorrowing),
        max_borrowing_indicative: Math.round(maxBorrowing),
        requested_loan_amount: requestedLoan,
        surplus_or_deficit: Math.round(maxBorrowing - requestedLoan),
        serviceability_pass: maxBorrowing >= requestedLoan,
        test_rate_used: testRatePct,
        assumptions: {
          test_rate_annual_decimal: testRateAnnual,
          loan_term_years: termYears,
          note: "Indicative only — not credit advice.",
        },
        loan_to_annual_income_multiple: loanToIncomeMultiple,
        dti_ratio: loanToIncomeMultiple,
        liability_balance_to_income_ratio: balanceDti != null ? Math.round(balanceDti * 1000) / 1000 : null,
        total_debt: Math.round(totalDebt),
        annual_income: Math.round(totalAnnualIncome * 100) / 100,
      });
    }
    if (name === "get_alerts") {
      const days = typeof args.days_ahead === "number" && args.days_ahead > 0 ? args.days_ahead : 30;
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const end = new Date(today.getTime() + days * 864e5);
      const endStr = end.toISOString().slice(0, 10);
      const alerts: Record<string, unknown> = { days_ahead: days, tasks_due: [], documents_expiring: [], settlements_upcoming: [], rate_refixes: [] };
      const { data: tasks, error: te } = await supabase
        .from("tasks")
        .select("id, title, due_date, priority, status, application_id, client_id")
        .eq("firm_id", firmId)
        .in("status", ["pending", "in_progress"])
        .gte("due_date", todayStr)
        .lte("due_date", endStr)
        .order("due_date", { ascending: true })
        .limit(50);
      if (!te) alerts.tasks_due = tasks ?? [];
      const { data: docs, error: de } = await supabase
        .from("documents")
        .select("id, name, client_id, application_id, expiry_date, status")
        .eq("firm_id", firmId)
        .not("expiry_date", "is", null)
        .gte("expiry_date", todayStr)
        .lte("expiry_date", endStr)
        .limit(50);
      if (!de) alerts.documents_expiring = docs ?? [];
      const { data: apps, error: appE } = await supabase
        .from("applications")
        .select("id, reference_number, settlement_date, workflow_stage, client_id")
        .eq("firm_id", firmId)
        .not("settlement_date", "is", null)
        .gte("settlement_date", todayStr)
        .lte("settlement_date", endStr)
        .limit(50);
      if (!appE) alerts.settlements_upcoming = apps ?? [];
      const { data: refix, error: re } = await supabase
        .from("settled_loans")
        .select("id, loan_amount, current_rate_expiry_date, lender_name, client_id")
        .eq("firm_id", firmId)
        .not("current_rate_expiry_date", "is", null)
        .gte("current_rate_expiry_date", todayStr)
        .lte("current_rate_expiry_date", endStr)
        .limit(50);
      if (!re) alerts.rate_refixes = refix ?? [];
      else alerts.rate_refixes_note = "settled_loans query skipped or table unavailable";
      return JSON.stringify(alerts);
    }
    if (name === "compare_rates") {
      const loan_amount = Number(args.loan_amount);
      if (Number.isNaN(loan_amount) || loan_amount <= 0) {
        return JSON.stringify({ error: "loan_amount required" });
      }
      const rateTypeArg = args.rate_type ? String(args.rate_type) : "floating";
      const dbType = RATE_TYPE_TO_DB[rateTypeArg] ?? rateTypeArg;
      let q = supabase
        .from("market_rates")
        .select("lender_name, rate_type, rate_percent, owner_occupied")
        .eq("is_current", true)
        .order("rate_percent", { ascending: true })
        .limit(40);
      if (args.lender) q = q.ilike("lender_name", `%${String(args.lender).slice(0, 80)}%`);
      const { data: rows, error } = await q;
      if (error) return JSON.stringify({ error: error.message, loan_amount, rates: [] });
      const filtered = (rows ?? []).filter((r: { rate_type?: string }) =>
        !dbType || (r.rate_type ?? "").toLowerCase() === dbType.toLowerCase() ||
        (dbType === "floating" && ["floating", "variable", "revolving"].includes((r.rate_type ?? "").toLowerCase()))
      );
      const list = (filtered.length > 0 ? filtered : (rows ?? [])).slice(0, 15).map((r: Record<string, unknown>) => {
        const rp = Number(r.rate_percent);
        let indicative: number | null = null;
        if (!Number.isNaN(rp) && rp > 0 && loan_amount > 0) {
          const rm = rp / 100 / 12;
          const n = 360;
          const pow = Math.pow(1 + rm, n);
          indicative = Math.round((loan_amount * rm * pow) / (pow - 1));
        }
        return {
          lender: r.lender_name,
          rate_type: r.rate_type,
          rate_percent: r.rate_percent,
          indicative_monthly_repayment_30yr: indicative,
        };
      });
      return JSON.stringify({
        loan_amount,
        rate_type_requested: rateTypeArg,
        rates: list,
        note: "Indicative principal & interest repayment over 30 years (not advice).",
      });
    }
    if (name === "get_dashboard_summary") {
      const { data: fi, error } = await supabase.rpc("get_flow_intelligence_data", { p_firm_id: firmId });
      if (error) {
        const { data: apps } = await supabase
          .from("applications")
          .select("workflow_stage, loan_amount, status, settlement_date")
          .eq("firm_id", firmId)
          .eq("status", "active");
        const rows = apps ?? [];
        const totalValue = rows.reduce((s, a: { loan_amount?: unknown }) => s + (Number(a.loan_amount) || 0), 0);
        return JSON.stringify({
          fallback: true,
          error: error.message,
          active_applications: rows.length,
          total_pipeline_loan_amount: totalValue,
        });
      }
      return JSON.stringify({ source: "get_flow_intelligence_data", data: fi });
    }
    if (name === "add_note") {
      const content = String(args.content ?? "").trim();
      if (!content) return JSON.stringify({ error: "content required" });
      let client_id = args.client_id ? String(args.client_id) : "";
      const application_id = args.application_id ? String(args.application_id) : "";
      if (!client_id && application_id) {
        const { data: app } = await supabase
          .from("applications")
          .select("client_id")
          .eq("id", application_id)
          .eq("firm_id", firmId)
          .maybeSingle();
        client_id = String((app as { client_id?: string } | null)?.client_id ?? "");
      }
      if (!client_id) return JSON.stringify({ error: "client_id or application_id required" });
      const { data: adv } = await supabase
        .from("advisors")
        .select("first_name, last_name")
        .eq("id", advisorId)
        .maybeSingle();
      const authorName = adv
        ? `${(adv as { first_name?: string }).first_name ?? ""} ${
          (adv as { last_name?: string }).last_name ?? ""
        }`.trim() || "Adviser"
        : "Flow Intelligence";
      const { data, error } = await supabase
        .from("notes")
        .insert({
          firm_id: firmId,
          client_id,
          application_id: application_id || null,
          content,
          author_id: null,
          author_name: authorName,
          author_avatar_url: null,
        })
        .select("id, created_at")
        .single();
      if (error) return JSON.stringify({ error: error.message });
      if (data?.id) {
        void invokeGenerateEmbeddings(supabase, {
          content,
          firm_id: firmId,
          source_type: "note",
          source_id: String(data.id),
          client_id,
          application_id: application_id || null,
          metadata: { note_id: data.id },
        });
      }
      return JSON.stringify({
        success: true,
        created: true,
        note_id: data?.id,
        created_at: data?.created_at,
      });
    }
    if (name === "rag_search") {
      const query = String(args.query ?? "").trim();
      if (!query) return JSON.stringify({ error: "query required" });
      const embResponse = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: query,
        }),
      });
      const embData = await embResponse.json();
      const queryEmbedding = embData.data?.[0]?.embedding;
      if (!queryEmbedding) {
        return JSON.stringify({ error: "Failed to generate search embedding" });
      }
      const { data: matches, error: searchErr } = await supabase.rpc("search_documents", {
        p_firm_id: firmId,
        p_query_embedding: queryEmbedding,
        p_match_count: 5,
        p_source_type: args.source_type ? String(args.source_type) : null,
        p_client_id: args.client_id ? String(args.client_id) : null,
      });
      if (searchErr) {
        return JSON.stringify({ error: searchErr.message });
      }
      const rows = (matches ?? []) as Array<{
        content: string;
        source_type: string;
        similarity: number;
        metadata: unknown;
        client_id: string | null;
      }>;
      return JSON.stringify({
        matches: rows.map((m) => ({
          content: m.content.slice(0, 500),
          source_type: m.source_type,
          similarity: Math.round(m.similarity * 100) + "%",
          metadata: m.metadata,
          client_id: m.client_id,
        })),
        total_found: rows.length,
      });
    }
    if (name === "update_application_stage") {
      const application_id = String(args.application_id ?? "").trim();
      const new_stage = String(args.new_stage ?? "").trim();
      if (!application_id || !new_stage) {
        return JSON.stringify({ error: "application_id and new_stage required" });
      }
      const previewArgs: Record<string, unknown> = { application_id, new_stage };
      if (args.reason) previewArgs.reason = args.reason;
      if (!confirmed) {
        return JSON.stringify(destructiveBuiltInPreview("update_application_stage", previewArgs));
      }
      const { data: updated, error } = await supabase
        .from("applications")
        .update({
          workflow_stage: new_stage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", application_id)
        .eq("firm_id", firmId)
        .select("id, reference_number, workflow_stage")
        .single();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({
        success: true,
        updated: true,
        new_stage,
        application: updated,
        reason: args.reason ? String(args.reason) : null,
      });
    }
    if (name === "check_document_status") {
      const client_id = args.client_id ? String(args.client_id).trim() : "";
      const application_id = args.application_id ? String(args.application_id).trim() : "";
      if (!client_id && !application_id) {
        return JSON.stringify({ error: "client_id and/or application_id required" });
      }
      const sel =
        "id, name, category, status, expiry_date, upload_date, created_at, client_id, application_id";
      const rows: Record<string, unknown>[] = [];
      if (application_id && /^[0-9a-f-]{36}$/i.test(application_id)) {
        const { data } = await supabase.from("documents").select(sel).eq("firm_id", firmId).eq(
          "application_id",
          application_id,
        );
        rows.push(...((data ?? []) as Record<string, unknown>[]));
      }
      if (client_id && /^[0-9a-f-]{36}$/i.test(client_id)) {
        const { data } = await supabase.from("documents").select(sel).eq("firm_id", firmId).eq("client_id", client_id);
        for (const d of data ?? []) rows.push(d as Record<string, unknown>);
      }
      const byId = new Map<string, Record<string, unknown>>();
      for (const d of rows) {
        const id = String(d.id ?? "");
        if (id) byId.set(id, d);
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const soon = new Date(today.getTime() + 30 * 864e5);
      const documents = Array.from(byId.values()).map((d) => {
        const expRaw = d.expiry_date ? String(d.expiry_date).slice(0, 10) : "";
        let derived: "valid" | "expiring" | "expired" | "unknown" = "unknown";
        if (expRaw && /^\d{4}-\d{2}-\d{2}$/.test(expRaw)) {
          const exp = new Date(expRaw + "T12:00:00");
          if (exp < today) derived = "expired";
          else if (exp <= soon) derived = "expiring";
          else derived = "valid";
        } else {
          const st = String(d.status ?? "").toLowerCase();
          if (st.includes("expir")) derived = st.includes("soon") ? "expiring" : "expired";
          else if (st.includes("valid")) derived = "valid";
        }
        return {
          id: d.id,
          name: d.name,
          category: d.category,
          status: d.status,
          expiry_date: d.expiry_date,
          derived_status: derived,
        };
      });
      return JSON.stringify({ count: documents.length, documents });
    }
    if (name === "calculate_lvr") {
      const loan_amount = Number(args.loan_amount);
      const property_value = Number(args.property_value);
      if (Number.isNaN(loan_amount) || Number.isNaN(property_value)) {
        return JSON.stringify({ error: "loan_amount and property_value must be numbers" });
      }
      if (property_value <= 0) {
        return JSON.stringify({
          loan_amount,
          property_value,
          lvr_percentage: 0,
          deposit_amount: 0,
          deposit_percentage: 0,
          requires_lmi: false,
          rbnz_category: "Unknown — property value missing",
        });
      }
      const lvr = (loan_amount / property_value) * 100;
      const deposit = property_value - loan_amount;
      const depPct = (1 - loan_amount / property_value) * 100;
      return JSON.stringify({
        loan_amount,
        property_value,
        lvr_percentage: Math.round(lvr * 10) / 10,
        deposit_amount: Math.round(deposit),
        deposit_percentage: Math.round(depPct * 10) / 10,
        requires_lmi: lvr > 80,
        rbnz_category: lvr <= 60
          ? "Low risk"
          : lvr <= 80
          ? "Standard"
          : lvr <= 90
          ? "High LVR - restricted"
          : "Very high LVR - limited availability",
      });
    }
    if (name === "calculate_dti") {
      const application_id = String(args.application_id ?? "").trim();
      if (!application_id) return JSON.stringify({ error: "application_id required" });
      const { data: app } = await supabase
        .from("applications")
        .select("id, loan_amount")
        .eq("id", application_id)
        .eq("firm_id", firmId)
        .maybeSingle();
      if (!app) return JSON.stringify({ error: "Application not found" });
      const { data: applicants } = await supabase.from("applicants").select("id").eq("application_id", application_id);
      const applicantIds = (applicants ?? []).map((a: { id: string }) => a.id);
      let incomeRows: Record<string, unknown>[] = [];
      if (applicantIds.length > 0) {
        const { data: inc } = await supabase.from("income").select("*").in("applicant_id", applicantIds);
        incomeRows = inc ?? [];
      }
      const { data: liabRows } = await supabase.from("liabilities").select("*").eq("application_id", application_id);
      const totalAnnualIncome = incomeRows.reduce((s, r) => s + rowAnnualIncomeWithGross(r), 0);
      const totalLiabilityBalance = (liabRows ?? []).reduce((s, l) => {
        const b = Number((l as { current_balance?: unknown }).current_balance);
        return s + (!Number.isNaN(b) && b > 0 ? b : 0);
      }, 0);
      const loanAmount = Number((app as { loan_amount?: unknown }).loan_amount) || 0;
      const totalDebtExposure = totalLiabilityBalance + loanAmount;
      const loanToIncome = totalAnnualIncome > 0 ? loanAmount / totalAnnualIncome : null;
      const debtToIncome = totalAnnualIncome > 0 ? totalDebtExposure / totalAnnualIncome : null;
      return JSON.stringify({
        application_id,
        annual_gross_income: Math.round(totalAnnualIncome * 100) / 100,
        total_liability_balances: Math.round(totalLiabilityBalance),
        loan_amount: loanAmount,
        total_debt_exposure: Math.round(totalDebtExposure),
        loan_to_income_multiple: loanToIncome != null ? Math.round(loanToIncome * 10) / 10 : null,
        debt_to_income_multiple: debtToIncome != null ? Math.round(debtToIncome * 10) / 10 : null,
        within_rbnz_owner_occupier_7x: loanToIncome != null ? loanToIncome <= 7 : null,
        within_rbnz_investor_6x: loanToIncome != null ? loanToIncome <= 6 : null,
        note: "RBNZ thresholds are commonly discussed as loan-to-income multiples; confirm against current policy.",
      });
    }
    if (name === "get_pipeline_summary") {
      const { data: apps } = await supabase
        .from("applications")
        .select("id, loan_amount, workflow_stage, created_at, updated_at, clients(first_name, last_name)")
        .eq("firm_id", firmId);
      const stages: Record<string, { count: number; value: number }> = {};
      for (const a of apps ?? []) {
        const s = String((a as { workflow_stage?: string }).workflow_stage || "draft");
        if (!stages[s]) stages[s] = { count: 0, value: 0 };
        stages[s].count++;
        stages[s].value += Number((a as { loan_amount?: unknown }).loan_amount) || 0;
      }
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, status, due_date")
        .eq("firm_id", firmId)
        .eq("status", "pending");
      const todayStr = new Date().toISOString().slice(0, 10);
      const overdueTasks = (tasks ?? []).filter((t: { due_date?: string | null }) =>
        t.due_date && String(t.due_date).slice(0, 10) < todayStr
      );
      return JSON.stringify({
        total_applications: (apps ?? []).length,
        total_pipeline_value: (apps ?? []).reduce(
          (s: number, a: { loan_amount?: unknown }) => s + (Number(a.loan_amount) || 0),
          0,
        ),
        by_stage: stages,
        pending_tasks: (tasks ?? []).length,
        overdue_tasks: overdueTasks.length,
      });
    }
    if (name === "get_upcoming_deadlines") {
      const daysAhead = typeof args.days === "number" && args.days > 0 ? args.days : 14;
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const cutoff = new Date(today.getTime() + daysAhead * 864e5);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, due_date, priority, status")
        .eq("firm_id", firmId)
        .eq("status", "pending")
        .not("due_date", "is", null)
        .gte("due_date", todayStr)
        .lte("due_date", cutoffStr)
        .order("due_date", { ascending: true })
        .limit(80);
      const { data: settlements } = await supabase
        .from("applications")
        .select("id, reference_number, settlement_date, loan_amount, clients(first_name, last_name)")
        .eq("firm_id", firmId)
        .not("settlement_date", "is", null)
        .gte("settlement_date", todayStr)
        .lte("settlement_date", cutoffStr)
        .order("settlement_date", { ascending: true })
        .limit(80);
      return JSON.stringify({
        upcoming_tasks: tasks ?? [],
        upcoming_settlements: settlements ?? [],
        days_checked: daysAhead,
      });
    }
    if (name === "get_commission_forecast") {
      const today = new Date();
      const mStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const mEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
      const mStartStr = mStart.toISOString().slice(0, 10);
      const mEndStr = mEnd.toISOString().slice(0, 10);
      const horizonEnd = new Date(today.getTime() + 90 * 864e5).toISOString().slice(0, 10);
      const { data: commRows, error: ce } = await supabase
        .from("commissions")
        .select("net_amount, gross_amount, commission_type, status, settlement_date, expected_date, received_date")
        .eq("firm_id", firmId);
      if (ce) {
        return JSON.stringify({ error: ce.message, note: "commissions table unavailable" });
      }
      const rows = commRows ?? [];
      let received_this_month = 0;
      let expected_next_90 = 0;
      let trail_monthly_hint = 0;
      for (const r of rows) {
        const rec = String((r as { received_date?: string | null }).received_date ?? "").slice(0, 10);
        const exp = String((r as { expected_date?: string | null }).expected_date ?? "").slice(0, 10);
        const net = Number((r as { net_amount?: unknown }).net_amount) || 0;
        const st = String((r as { status?: string | null }).status ?? "").toLowerCase();
        const ctype = String((r as { commission_type?: string | null }).commission_type ?? "").toLowerCase();
        if (rec >= mStartStr && rec <= mEndStr && st === "received") received_this_month += net;
        if (exp && exp >= today.toISOString().slice(0, 10) && exp <= horizonEnd && st === "expected") {
          expected_next_90 += net;
        }
        if (ctype === "trail" && net > 0) trail_monthly_hint += net;
      }
      const { data: apps } = await supabase
        .from("applications")
        .select("loan_amount, workflow_stage")
        .eq("firm_id", firmId)
        .in("workflow_stage", ["submitted", "conditional", "unconditional"]);
      const pipeline_loan_total = (apps ?? []).reduce(
        (s, a: { loan_amount?: unknown }) => s + (Number(a.loan_amount) || 0),
        0,
      );
      return JSON.stringify({
        received_this_month_net: Math.round(received_this_month * 100) / 100,
        expected_next_90_days_net: Math.round(expected_next_90 * 100) / 100,
        trail_book_rows_net_sum: Math.round(trail_monthly_hint * 100) / 100,
        active_pipeline_loan_amount_total: pipeline_loan_total,
        note: "Net amounts from commissions table; trail sum is raw row total (not annualised). Indicative only.",
      });
    }
    if (name === "update_client") {
      const client_id = String(args.client_id ?? "").trim();
      const rawUpdates = args.updates;
      if (!client_id || !rawUpdates || typeof rawUpdates !== "object") {
        return JSON.stringify({ error: "client_id and updates object required" });
      }
      const u = rawUpdates as Record<string, unknown>;
      const allowed: Record<string, unknown> = {};
      const map: [string, string][] = [
        ["email", "email"],
        ["phone", "phone"],
        ["first_name", "first_name"],
        ["last_name", "last_name"],
        ["annual_income", "annual_income"],
        ["employment_status", "employment_status"],
        ["employer_name", "employer_name"],
        ["residential_address", "residential_address"],
        ["city", "city"],
        ["postal_code", "postal_code"],
        ["date_of_birth", "date_of_birth"],
        ["lead_source", "lead_source"],
        ["portal_status", "portal_status"],
        ["notes", "notes"],
      ];
      for (const [key, col] of map) {
        if (key in u) allowed[col] = u[key];
      }
      if (Object.keys(allowed).length === 0) {
        return JSON.stringify({ error: "No supported fields in updates" });
      }
      const execArgs: Record<string, unknown> = { client_id, updates: allowed };
      if (!confirmed) {
        return JSON.stringify(destructiveBuiltInPreview("update_client", execArgs));
      }
      const { error } = await supabase.from("clients").update(allowed).eq("id", client_id).eq("firm_id", firmId);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ updated: true, client_id });
    }
    if (name === "create_client") {
      const first_name = String(args.first_name ?? "").trim();
      const last_name = String(args.last_name ?? "").trim();
      const email = String(args.email ?? "").trim();
      if (!first_name || !last_name || !email) {
        return JSON.stringify({ error: "first_name, last_name, and email required" });
      }
      const execArgs: Record<string, unknown> = {
        first_name,
        last_name,
        email,
        phone: args.phone ? String(args.phone) : null,
        residential_address: args.residential_address ? String(args.residential_address) : null,
        date_of_birth: args.date_of_birth ? String(args.date_of_birth).slice(0, 10) : null,
        employment_status: args.employment_status ? String(args.employment_status) : null,
        annual_income: typeof args.annual_income === "number" ? args.annual_income : 0,
      };
      if (!confirmed) {
        return JSON.stringify(destructiveBuiltInPreview("create_client", execArgs));
      }
      const { data, error } = await supabase
        .from("clients")
        .insert({
          firm_id: firmId,
          first_name: String(execArgs.first_name),
          last_name: String(execArgs.last_name),
          email: String(execArgs.email),
          phone: execArgs.phone != null ? String(execArgs.phone) : null,
          residential_address: execArgs.residential_address != null
            ? String(execArgs.residential_address)
            : null,
          date_of_birth: execArgs.date_of_birth != null
            ? String(execArgs.date_of_birth).slice(0, 10)
            : null,
          employment_status: execArgs.employment_status != null
            ? String(execArgs.employment_status)
            : null,
          annual_income: typeof execArgs.annual_income === "number" ? execArgs.annual_income : 0,
          assigned_to: advisorId,
          portal_status: "Not Setup",
        })
        .select("id, first_name, last_name, email")
        .single();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ created: true, ...data });
    }
    if (name === "create_application") {
      const client_id = String(args.client_id ?? "").trim();
      const application_type = String(args.application_type ?? "").trim();
      if (!client_id || !application_type) {
        return JSON.stringify({ error: "client_id and application_type required" });
      }
      const execArgs: Record<string, unknown> = {
        client_id,
        application_type,
        loan_amount: typeof args.loan_amount === "number" ? args.loan_amount : 0,
        property_value: typeof args.property_value === "number" ? args.property_value : null,
        loan_purpose: args.loan_purpose ? String(args.loan_purpose) : null,
        property_address: args.property_address ? String(args.property_address) : null,
      };
      if (!confirmed) {
        return JSON.stringify(destructiveBuiltInPreview("create_application", execArgs));
      }
      const refNum =
        `AF-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${
          String(Math.floor(Math.random() * 10000)).padStart(4, "0")
        }`;
      const { data, error } = await supabase
        .from("applications")
        .insert({
          firm_id: firmId,
          client_id: String(execArgs.client_id),
          reference_number: refNum,
          application_type: String(execArgs.application_type),
          loan_amount: typeof execArgs.loan_amount === "number" ? execArgs.loan_amount : 0,
          property_value: typeof execArgs.property_value === "number" ? execArgs.property_value : null,
          loan_purpose: execArgs.loan_purpose != null ? String(execArgs.loan_purpose) : null,
          property_address: execArgs.property_address != null ? String(execArgs.property_address) : null,
          workflow_stage: "draft",
          status: "active",
          assigned_to: advisorId,
        })
        .select("id, reference_number")
        .single();
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ created: true, ...data });
    }
    if (name === "compare_lender_rates") {
      const rateTypeArg = args.rate_type ? String(args.rate_type) : "";
      const loan_amount = typeof args.loan_amount === "number" ? args.loan_amount : 0;
      const dbType = rateTypeArg && (RATE_TYPE_TO_DB[rateTypeArg] ?? rateTypeArg);
      let q = supabase
        .from("market_rates")
        .select("lender_name, rate_type, rate_percent, owner_occupied")
        .eq("is_current", true)
        .order("rate_percent", { ascending: true })
        .limit(60);
      const { data: rows, error } = await q;
      let fromDb: Record<string, unknown>[] = [];
      if (!error && rows && rows.length > 0) {
        const filtered = dbType
          ? rows.filter((r: { rate_type?: string }) =>
            (r.rate_type ?? "").toLowerCase() === String(dbType).toLowerCase() ||
            (String(dbType).toLowerCase() === "floating" &&
              ["floating", "variable", "revolving"].includes((r.rate_type ?? "").toLowerCase()))
          )
          : rows;
        fromDb = (filtered.length > 0 ? filtered : rows).slice(0, 20).map((r: Record<string, unknown>) => {
          const rp = Number(r.rate_percent);
          let indicative: number | null = null;
          if (!Number.isNaN(rp) && rp > 0 && loan_amount > 0) {
            const rm = rp / 100 / 12;
            const n = 360;
            const pow = Math.pow(1 + rm, n);
            indicative = Math.round((loan_amount * rm * pow) / (pow - 1));
          }
          return {
            lender: r.lender_name,
            rate_type: r.rate_type,
            rate_percent: r.rate_percent,
            indicative_monthly_repayment_30yr: indicative,
          };
        });
      }
      const indicativeTable = Object.entries(INDICATIVE_NZ_LENDER_RATES).map(([lender, r]) => ({
        lender,
        ...r,
      }));
      return JSON.stringify({
        as_of: new Date().toISOString().slice(0, 10),
        rate_type_requested: rateTypeArg || null,
        market_rates_sample: fromDb,
        rates: indicativeTable,
        note: "Indicative major-bank snapshot; use market_rates_sample when populated. Not advice — verify on lender sites.",
      });
    }
    if (name === "check_refix_opportunities") {
      const days = typeof args.days_ahead === "number" && args.days_ahead > 0 ? args.days_ahead : 90;
      const todayStr = new Date().toISOString().slice(0, 10);
      const end = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
      const { data: loans, error } = await supabase
        .from("settled_loans")
        .select("id, loan_amount, current_rate, current_rate_expiry_date, lender_name, client_id")
        .eq("firm_id", firmId)
        .not("current_rate_expiry_date", "is", null)
        .gte("current_rate_expiry_date", todayStr)
        .lte("current_rate_expiry_date", end)
        .order("current_rate_expiry_date", { ascending: true })
        .limit(100);
      if (error) {
        return JSON.stringify({
          message: error.message,
          opportunities: [],
          note: "settled_loans may be unavailable in this project.",
        });
      }
      const opportunities = (loans ?? []).map((L: Record<string, unknown>) => ({
        id: L.id,
        client_id: L.client_id,
        lender_name: L.lender_name,
        loan_amount: L.loan_amount,
        current_rate: L.current_rate,
        rate_expires: L.current_rate_expiry_date,
      }));
      return JSON.stringify({ days_ahead: days, count: opportunities.length, opportunities });
    }
    if (name === "run_workflow") {
      const workflow_name = String(args.workflow_name ?? "").trim();
      const steps = WORKFLOW_DEFINITIONS[workflow_name];
      if (!steps) {
        return JSON.stringify({ error: `Unknown workflow: ${workflow_name}` });
      }
      return JSON.stringify({
        workflow: workflow_name,
        total_steps: steps.length,
        steps: steps.map((s, i) => ({ step: i + 1, description: s, status: "ready" })),
        client_id: args.client_id ? String(args.client_id) : null,
        application_id: args.application_id ? String(args.application_id) : null,
        note: "Workflow ready to execute. The agent should run each step using the appropriate tools.",
      });
    }
    if (name === "process_document") {
      const itemsRaw = args.items;
      if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
        return JSON.stringify({ error: "items array required", proposals: [] });
      }
      const proposals: Record<string, unknown>[] = [];
      for (const raw of itemsRaw) {
        const item = raw as Record<string, unknown>;
        const storage_path = String(item.storage_path ?? "").trim();
        const file_name = String(item.file_name ?? "").trim() || "document";
        if (!storage_path || !storage_path.startsWith(`${firmId}/`)) {
          proposals.push({
            file_name,
            storage_path,
            error: "Invalid or missing storage_path for this firm",
          });
          continue;
        }
        const client_id = String(item.client_id ?? "").trim();
        if (!client_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(client_id)) {
          proposals.push({
            file_name,
            storage_path,
            public_url: item.public_url ?? null,
            error: "client_id required and must be a valid UUID",
          });
          continue;
        }
        const { data: cl, error: ce } = await supabase
          .from("clients")
          .select("id, first_name, last_name")
          .eq("id", client_id)
          .eq("firm_id", firmId)
          .maybeSingle();
        if (ce || !cl) {
          proposals.push({
            file_name,
            storage_path,
            client_id,
            error: "Client not found in your firm",
          });
          continue;
        }
        const clientLabel = `${(cl as { first_name?: string }).first_name ?? ""} ${
          (cl as { last_name?: string }).last_name ?? ""
        }`.trim() || "Client";
        let application_id: string | null = item.application_id
          ? String(item.application_id).trim()
          : null;
        let suggested_application: string | null = "General";
        if (application_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(application_id)) {
          const { data: app } = await supabase
            .from("applications")
            .select("id, reference_number, client_id")
            .eq("id", application_id)
            .eq("firm_id", firmId)
            .maybeSingle();
          const appRow = app as { client_id?: string; reference_number?: string } | null;
          if (!appRow || appRow.client_id !== client_id) {
            proposals.push({
              file_name,
              storage_path,
              client_id,
              suggested_client: clientLabel,
              error: "Application not found or does not belong to this client",
            });
            continue;
          }
          suggested_application = appRow.reference_number || application_id;
        } else {
          application_id = null;
        }
        const detected_type = String(item.detected_type ?? "other");
        const suggested_category = String(item.suggested_category ?? "02 Financial Evidence");
        proposals.push({
          file_name,
          storage_path,
          public_url: item.public_url ?? null,
          mime_type: item.mime_type ?? null,
          size_bytes: typeof item.size_bytes === "number" ? item.size_bytes : null,
          file_hash: item.file_hash ? String(item.file_hash) : null,
          client_id,
          suggested_client: clientLabel,
          application_id,
          suggested_application,
          detected_type,
          suggested_category,
          confidence_note: item.confidence_note ? String(item.confidence_note) : null,
        });
      }
      return JSON.stringify({
        mode: "propose",
        proposals,
        note: "Broker confirms filing in the Flow Intelligence UI.",
      });
    }
    return JSON.stringify({ error: `Unknown built-in: ${name}` });
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}

/** Max messages kept from client payload (DB / fi_get_conversation_context still hold full history). */
const MAX_CHAT_TURNS = 48;
/** Only the last N user/assistant turns are sent to OpenAI to limit tokens. */
const OPENAI_CHAT_MESSAGE_WINDOW = 6;
const MAX_MSG_CHARS = 12000;
/** Avoid unbounded waits if OpenAI keeps returning 429. */
const MAX_OPENAI_429_RETRIES = 12;

function normalizeClientChatMessages(raw: unknown): { role: string; content: string }[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: { role: string; content: string }[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: string }).role;
    const content = (m as { content?: string }).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    out.push({ role, content: content.slice(0, MAX_MSG_CHARS) });
  }
  return out.length > 0 ? out.slice(-MAX_CHAT_TURNS) : null;
}

function lastUserContent(msgs: { role: string; content: string }[]): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") return msgs[i].content;
  }
  return "";
}

function buildMemorySummary(chatMessages: { role: string; content: string }[]): string {
  const knownFacts: string[] = [];
  for (const m of chatMessages) {
    if (m.role === "user") {
      const names = m.content.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g);
      if (names) knownFacts.push(`Client name mentioned: ${names.join(", ")}`);
      const emails = m.content.match(/[\w.-]+@[\w.-]+\.\w+/g);
      if (emails) knownFacts.push(`Email provided: ${emails.join(", ")}`);
      const phones = m.content.match(
        /(?:02\d[\s-]?\d{3,4}[\s-]?\d{3,4}|\+64\d{8,10})/g,
      );
      if (phones) knownFacts.push(`Phone provided: ${phones.join(", ")}`);
    }
  }
  return knownFacts.length > 0
    ? `\n\n## EXTRACTED FACTS FROM THIS CONVERSATION (DO NOT RE-ASK THESE):\n${knownFacts.join("\n")}\n`
    : "";
}

function deriveIntentFromActions(actionsTaken: { tool: string; args: unknown; result: unknown }[]): {
  intent: {
    action: string | null;
    parameters: Record<string, unknown>;
    confidence: number;
    requires_confirmation: boolean;
  };
  actionResult: Record<string, unknown> | null;
  executionStatus: string;
} {
  const builtInPending = actionsTaken.filter((s) => {
    if (!DESTRUCTIVE_BUILT_IN_TOOLS.has(s.tool)) return false;
    const r = s.result as Record<string, unknown> | null;
    return r?.requires_confirmation === true && r?.pending_built_in != null;
  });

  if (builtInPending.length > 0) {
    const summaries = builtInPending.map((s) =>
      String((s.result as Record<string, unknown>).summary ?? s.tool)
    );
    const queue = builtInPending.map((s) => {
      const r = s.result as Record<string, unknown>;
      const pb = r.pending_built_in as { args?: Record<string, unknown> } | undefined;
      const args = pb?.args && typeof pb.args === "object"
        ? pb.args
        : (s.args && typeof s.args === "object" ? s.args : {}) as Record<string, unknown>;
      return { tool: s.tool, args };
    });
    return {
      intent: {
        action: "built_in_execute",
        parameters: { queue },
        confidence: 0.95,
        requires_confirmation: true,
      },
      actionResult: {
        pending_built_ins: true,
        summaries,
        summary: summaries.join("\n"),
        count: builtInPending.length,
      },
      executionStatus: "awaiting_confirmation",
    };
  }

  let intent = {
    action: null as string | null,
    parameters: {} as Record<string, unknown>,
    confidence: 0,
    requires_confirmation: false,
  };
  let actionResult: Record<string, unknown> | null = null;
  let executionStatus = "completed";

  for (const step of actionsTaken) {
    if (BUILT_IN_TOOL_NAMES.has(step.tool)) continue;
    const r = step.result as Record<string, unknown> | null;
    intent = {
      action: step.tool,
      parameters: (step.args && typeof step.args === "object"
        ? step.args as Record<string, unknown>
        : {}),
      confidence: 0.9,
      requires_confirmation: execResultNeedsConfirmation(r),
    };
    actionResult = r;
    executionStatus = intent.requires_confirmation ? "awaiting_confirmation" : "completed";
  }

  return { intent, actionResult, executionStatus };
}

/**
 * Agentic loop: model may chain tool calls (CRM search → details → draft email, etc.).
 * Built-ins use `executeBuiltInTool`; registry actions use `fi_execute_action`.
 */
async function runAgentLoop(
  systemPrompt: string,
  chatMessages: { role: string; content: string }[],
  supabase: ReturnType<typeof createClient>,
  firmId: string,
  advisorId: string,
  tools: unknown[],
  userId: string,
  maxIterations = 5,
): Promise<{ message: string; actions_taken: unknown[]; tokens: number }> {
  const chatForModel = chatMessages.slice(-OPENAI_CHAT_MESSAGE_WINDOW);
  const memorySummary = buildMemorySummary(chatForModel);
  const messages: Record<string, unknown>[] = [
    { role: "system", content: systemPrompt + memorySummary },
    ...chatForModel.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  ];

  const actionsTaken: { tool: string; args: unknown; result: unknown }[] = [];
  let totalTokens = 0;
  let openai429Retries = 0;

  const execCtx: ExecContext = { supabase, firmId, advisorId };

  for (let i = 0; i < maxIterations; i++) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        tools: tools as Record<string, unknown>[],
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        if (openai429Retries >= MAX_OPENAI_429_RETRIES) {
          const errText = await response.text();
          throw new Error(`OpenAI error: 429 rate limit (exceeded retries) ${errText}`);
        }
        openai429Retries++;
        const retryAfter = parseFloat(response.headers.get("retry-after") || "5");
        const delayMs = Math.min(
          120_000,
          retryAfter * 1000 * Math.pow(2, openai429Retries - 1),
        );
        await new Promise((r) => setTimeout(r, delayMs));
        i--; // retry this iteration
        continue;
      }
      const errText = await response.text();
      throw new Error(`OpenAI error: ${response.status} ${errText}`);
    }

    openai429Retries = 0;
    const data = await response.json();
    totalTokens += data.usage?.total_tokens ?? 0;

    const choice = data.choices?.[0];
    const msg = choice?.message;

    const wantsTools =
      choice?.finish_reason === "tool_calls" ||
      (msg?.tool_calls && (msg.tool_calls as unknown[]).length > 0);

    if (wantsTools && msg?.tool_calls?.length) {
      messages.push(msg as Record<string, unknown>);

      for (const toolCall of msg.tool_calls as Array<{
        id: string;
        function: { name: string; arguments: string };
      }>) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function?.arguments || "{}") as Record<string, unknown>;
        } catch { /* empty */ }

        const fn = toolCall.function?.name ?? "";
        let result: unknown;

        if (BUILT_IN_TOOL_NAMES.has(fn)) {
          const jsonStr = await executeBuiltInTool(fn, args, execCtx);
          try {
            result = JSON.parse(jsonStr);
          } catch {
            result = { raw: jsonStr };
          }
        } else {
          const { data: execResult, error: rpcErr } = await supabase.rpc("fi_execute_action", {
            p_action_key: fn,
            p_parameters: args,
            p_advisor_id: userId,
            p_firm_id: firmId,
          });
          result = execResult ?? { error: rpcErr?.message ?? "no result" };
        }

        actionsTaken.push({ tool: fn, args, result });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result).slice(0, 12000),
        });
      }

      continue;
    }

    return {
      message: typeof msg?.content === "string" && msg.content.length > 0
        ? msg.content
        : "I couldn't process that request.",
      actions_taken: actionsTaken,
      tokens: totalTokens,
    };
  }

  return {
    message: "I completed the available steps. Let me know if you need anything else.",
    actions_taken: actionsTaken,
    tokens: totalTokens,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorised", { status: 401, headers: cors });

  const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) return new Response("Unauthorised", { status: 401, headers: cors });

  // Service client for DB writes
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const body = await req.json();
  const {
    message,
    conversation_id,
    application_id,
    confirm_action,
    messages: clientMessages,
    crm_context: crmContextFromClient,
    attached_files: attachedFilesRaw,
  } = body;
  const attached_files = Array.isArray(attachedFilesRaw) ? attachedFilesRaw : [];

  const start = Date.now();

  // Load adviser + firm
  const { data: advisor } = await supabase
    .from("advisors").select("*, firms(*)").eq("id", user.id).single();
  if (!advisor) return new Response("Adviser not found", { status: 404, headers: cors });

  const firmId = advisor.firm_id;
  const firm = (advisor as any).firms;

  /** Confirm pending CRM actions without a new user chat message. */
  if (confirm_action?.message_id && conversation_id) {
    const convIdConfirm = String(conversation_id);
    const { data: pendingMsg } = await supabase
      .from("fi_messages")
      .select("*")
      .eq("id", confirm_action.message_id)
      .single();

    if (!pendingMsg || pendingMsg.advisor_id !== user.id || pendingMsg.conversation_id !== convIdConfirm) {
      return new Response(JSON.stringify({ error: "Invalid or unauthorised pending message" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const intent = pendingMsg.intent as Record<string, unknown> | null;
    const params = intent?.parameters as Record<string, unknown> | undefined;

    if (intent?.action === "built_in_execute" && Array.isArray(params?.queue)) {
      const start2 = Date.now();
      const execCtx: ExecContext = { supabase, firmId, advisorId: user.id };
      const queue = params.queue as { tool: string; args: Record<string, unknown> }[];
      const results: Record<string, unknown>[] = [];
      let lastClientId: string | null = null;
      let lastError: string | null = null;

      for (const item of queue) {
        let qArgs = { ...item.args };
        if (item.tool === "create_application") {
          const cid = String(qArgs.client_id ?? "").trim();
          if (!cid && lastClientId) qArgs = { ...qArgs, client_id: lastClientId };
        }
        const jsonStr = await executeBuiltInTool(item.tool, qArgs, execCtx, { confirmed: true });
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(jsonStr) as Record<string, unknown>;
        } catch {
          parsed = { parse_error: true, raw: jsonStr };
        }
        results.push(parsed);
        if (parsed.error) {
          lastError = String(parsed.error);
          break;
        }
        if (item.tool === "create_client" && parsed.id) {
          lastClientId = String(parsed.id);
        }
      }

      const summary = lastError
        ? `Could not complete: ${lastError}`
        : results.length === 1
        ? (results[0].created ? "Created." : results[0].updated ? "Updated." : "Done.")
        : `Completed ${results.length} steps.`;
      const execBundle = { success: !lastError, results, summary, lastError };

      await supabase.from("fi_messages").update({
        action_result: execBundle,
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id,
        execution_status: lastError ? "failed" : "completed",
        requires_confirmation: false,
      }).eq("id", confirm_action.message_id);

      await supabase.from("fi_messages").insert({
        conversation_id: convIdConfirm,
        firm_id: firmId,
        advisor_id: user.id,
        role: "tool_result",
        content: summary,
        action_result: execBundle,
        execution_status: lastError ? "failed" : "completed",
        latency_ms: Date.now() - start2,
      });

      return new Response(JSON.stringify({
        conversation_id: convIdConfirm,
        message: summary,
        action_result: execBundle,
        requires_confirmation: false,
        suggestions: ["Show me the results", "What else needs attention?"],
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (intent?.action === "built_in_execute") {
      return new Response(JSON.stringify({ error: "Invalid built-in confirmation payload" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (intent?.action && typeof intent.action === "string") {
      const start2 = Date.now();
      const { data: execResult } = await supabase.rpc("fi_execute_action", {
        p_action_key: intent.action,
        p_parameters: params ?? {},
        p_advisor_id: user.id,
        p_firm_id: firmId,
      });

      await supabase.from("fi_messages").update({
        action_result: execResult,
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id,
        execution_status: execResult?.success ? "completed" : "failed",
        requires_confirmation: false,
      }).eq("id", confirm_action.message_id);

      await supabase.from("fi_messages").insert({
        conversation_id: convIdConfirm,
        firm_id: firmId,
        advisor_id: user.id,
        role: "tool_result",
        content: execResult?.summary || "Action completed",
        action_result: execResult,
        execution_status: "completed",
        latency_ms: Date.now() - start2,
      });

      return new Response(JSON.stringify({
        conversation_id: convIdConfirm,
        message: execResult?.summary || "Done.",
        action_result: execResult,
        requires_confirmation: false,
        suggestions: ["Show me the results", "What else needs attention?"],
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Nothing to confirm for this message" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const normalizedClient = normalizeClientChatMessages(clientMessages);
  let userText = typeof message === "string" ? message : "";
  if (!userText.trim() && normalizedClient) {
    userText = lastUserContent(normalizedClient);
  }
  if (!userText.trim() && attached_files.length > 0) {
    userText = "I uploaded documents, please process them.";
  }
  if (!userText.trim()) {
    return new Response(JSON.stringify({ error: "message or non-empty messages[] required" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Get or create conversation
  let convId = conversation_id;
  if (!convId) {
    const { data: conv } = await supabase.from("fi_conversations").insert({
      firm_id: firmId,
      advisor_id: user.id,
      context_application_id: application_id || null,
      title: userText.slice(0, 60) + (userText.length > 60 ? "..." : ""),
    }).select("id").single();
    convId = conv?.id;
  }

  // Load conversation history
  const { data: convContext } = await supabase
    .rpc("fi_get_conversation_context", { p_conversation_id: convId, p_limit: 8 });

  const historyMessages = convContext?.messages || [];

  // Load available actions
  const { data: actions } = await supabase
    .from("fi_action_registry").select("*").eq("is_enabled", true);

  // Load live context + firm client count (for prompt)
  const [{ data: liveContext }, { count: clientCount }] = await Promise.all([
    supabase.rpc("get_flow_intelligence_data", { p_firm_id: firmId }),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", firmId),
  ]);

  // Build context object
  const context = {
    firm,
    advisor,
    client_count: clientCount ?? 0,
    pipeline: liveContext?.pipeline,
    anomalies: liveContext?.anomalies,
    commissions: liveContext?.commissions,
    refix_alerts: liveContext?.refix_alerts,
    market_rates: liveContext?.market_rates,
    current_application: application_id ? { id: application_id } : null,
  };

  // Save user message
  await supabase.from("fi_messages").insert({
    conversation_id: convId, firm_id: firmId, advisor_id: user.id,
    role: "user", content: userText,
  });

  // Update conversation
  await supabase.from("fi_conversations").update({
    last_message_at: new Date().toISOString(),
    message_count: (convContext?.messages?.length || 0) + 1,
    context_application_id: application_id || null,
  }).eq("id", convId);

  // Parse intent with AI — prefer full thread from client; else DB history + this user turn
  let chatMessagesForAI: { role: string; content: string }[];
  if (normalizedClient && normalizedClient.length > 0) {
    chatMessagesForAI = normalizedClient.map((m, idx) => {
      const isLastUser = idx === normalizedClient.length - 1 && m.role === "user";
      if (isLastUser && attached_files.length > 0) {
        const extra = `\n\n[Attached files metadata]\n${JSON.stringify(attached_files, null, 2)}`;
        return {
          role: m.role,
          content: (m.content + extra).slice(0, MAX_MSG_CHARS),
        };
      }
      return { role: m.role, content: m.content };
    });
  } else {
    const userTurn = attached_files.length > 0
      ? `${userText}\n\n[Attached files metadata]\n${JSON.stringify(attached_files, null, 2)}`
      : userText;
    chatMessagesForAI = [
      ...historyMessages.map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? "").slice(0, MAX_MSG_CHARS),
      })),
      { role: "user", content: userTurn.slice(0, MAX_MSG_CHARS) },
    ];
  }

  const systemPrompt =
    buildSystemPrompt(context, actions || [], crmContextFromClient) +
    documentFilingInstructions(attached_files, application_id || null);
  const openAITools = buildOpenAITools((actions || []) as Record<string, unknown>[]);

  let agent: { message: string; actions_taken: unknown[]; tokens: number };
  try {
    agent = await runAgentLoop(
      systemPrompt,
      chatMessagesForAI,
      supabase,
      firmId,
      user.id,
      openAITools,
      user.id,
      5,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg, conversation_id: convId }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const latency = Date.now() - start;
  const { intent, actionResult, executionStatus } = deriveIntentFromActions(
    agent.actions_taken as { tool: string; args: unknown; result: unknown }[],
  );

  // Save assistant message
  const { data: savedMsg } = await supabase.from("fi_messages").insert({
    conversation_id: convId, firm_id: firmId, advisor_id: user.id,
    role: "assistant",
    content: agent.message,
    intent,
    action_result: actionResult,
    requires_confirmation: intent.requires_confirmation || false,
    execution_status: executionStatus,
    tokens_used: agent.tokens,
    model_used: "gpt-4o",
    latency_ms: latency,
  }).select("id").single();

  return new Response(JSON.stringify({
    conversation_id: convId,
    message_id: savedMsg?.id,
    message: agent.message,
    intent,
    action_result: actionResult,
    requires_confirmation: intent.requires_confirmation || false,
    suggestions: [],
    actions_taken: agent.actions_taken,
    latency_ms: latency,
    tokens_used: agent.tokens,
  }), { headers: { ...cors, "Content-Type": "application/json" } });
});

/* ── PARAMETER EXTRACTION GUIDE (append to system prompt) ──────────
   
When action is 'create_client', extract these parameters from natural language:
- first_name: string (required)
- last_name: string (required)  
- email: string (required)
- phone: string (optional, NZ format e.g. "021 123 4567")
- date_of_birth: string (optional, ISO format YYYY-MM-DD)
- address: string (optional)
- city: string (optional)
- employment_status: "employed" | "self_employed" | "unemployed" | "retired"
- annual_income: number (optional, annual gross)

When action is 'create_application', extract:
- client_id: uuid (required — must already be known from context)
- application_type: "purchase" | "refinance" | "top_up" | "construction"
- loan_amount: number (optional)
- property_value: number (optional)
- deposit_amount: number (optional — calculate as property_value - loan_amount if not given)
- loan_purpose: string (e.g. "First home", "Investment", "Refinance to ANZ")
- property_address: string (optional)
- property_city: string (optional)

When action is 'create_client_and_application', extract all of the above.

Example: "I have a new client — John Smith, john@email.com, 021 456 789, 
          first home buyer, income $95k, looking at $650k property in Auckland"
→ action: create_client_and_application
→ parameters: {
    first_name: "John", last_name: "Smith", email: "john@email.com",
    phone: "021 456 789", employment_status: "employed",
    annual_income: 95000, application_type: "purchase",
    loan_amount: 520000, property_value: 650000,
    deposit_amount: 130000, loan_purpose: "First home",
    property_city: "Auckland",
    income_hint: "$95k salary"
  }
*/
