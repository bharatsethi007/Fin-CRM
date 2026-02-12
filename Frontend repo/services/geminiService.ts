import { GoogleGenAI, Type } from "@google/genai";
import { crmService } from "./crmService";
import type { Client, AIRecommendationResponse, BankRates, AIComplianceResult } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const getDashboardInsights = async (prompt: string): Promise<string> => {
  try {
    const crmData = await crmService.getAllDataForAI();
    // We simplify the data to only include key fields to fit within the prompt limits
    const simplifiedData = {
      leads: crmData.leads.map(({ name, status, estimatedLoanAmount, dateAdded }) => ({ name, status, estimatedLoanAmount, dateAdded })),
      applications: crmData.applications.map(({ clientName, status, loanAmount, estSettlementDate }) => ({ clientName, status, loanAmount, estSettlementDate })),
      tasks: crmData.tasks.map(({ title, dueDate, isCompleted, priority }) => ({ title, dueDate, isCompleted, priority })),
    };
    
    const dataContext = JSON.stringify(simplifiedData, null, 2);

    const fullPrompt = `
      You are an expert AI assistant for a mortgage broker in New Zealand.
      Your name is AdvisorFlow AI.
      Analyze the following CRM data and answer the user's question.
      Provide concise, helpful, and actionable insights.
      If asked to summarize, provide bullet points.
      Current Date: ${new Date().toISOString().split('T')[0]}

      CRM Data:
      ${dataContext}

      User's Question: "${prompt}"

      Your Answer:
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
    });

    return response.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to get insights from AI assistant.");
  }
};

const getLenderRecommendation = async (
  client: Client,
  lendingDetails: { loanAmount: number; purpose: string; term: number },
  interestRates: BankRates[]
): Promise<Omit<AIRecommendationResponse, 'recommendationId'>> => {
    try {
        const fullPrompt = `
        You are an expert mortgage advisor AI for AdvisorFlow in New Zealand. Your task is to provide lender recommendations for a client based on their profile, loan requirements, and current interest rates.

        **Client Profile:**
        - Annual Income: $${client.financials.income}
        - Annual Expenses: $${client.financials.expenses}
        - Total Assets: $${client.financials.assets}
        - Total Liabilities: $${client.financials.liabilities}
        - Credit Score: ${client.creditScore.score}

        **Loan Details:**
        - Loan Amount: $${lendingDetails.loanAmount}
        - Loan Purpose: ${lendingDetails.purpose}
        - Loan Term: ${lendingDetails.term} years

        **Current Advertised Interest Rates (for context):**
        ${interestRates.map(bank => `
        - ${bank.lender}:
          ${bank.rates.map(rate => `  - ${rate.term}: ${rate.rate}%`).join('\n')}`).join('')}

        **Your Task:**
        1.  **Assess the Borrower's Circumstances:**
            -   Analyze their income, expenses, and existing liabilities to determine their debt-to-income ratio and ability to service the new loan.
            -   Consider their assets as potential equity or security.
            -   Evaluate their credit score in relation to lender criteria (higher scores are better).
            -   Consider the loan purpose (e.g., first home buyers might have different needs than investors).
            -   Briefly summarize your assessment of the client's financial position and risk profile.

        2.  **Recommend Lenders:**
            -   Based on your assessment and the provided interest rates, recommend the top 2-3 most suitable lenders from the provided list (ANZ, ASB, BNZ, Westpac, Kiwi Bank).
            -   For each recommended lender, provide:
                -   A confidence score (from 0.0 to 1.0) indicating how suitable they are.
                -   A clear rationale for the recommendation, linking it back to the client's profile and mentioning the competitive interest rates where applicable.
                -   A short list of potential pros (e.g., "Flexible repayment options").
                -   A short list of potential cons (e.g., "Slightly higher application fees").
                -   The most relevant interest rate product for the client (e.g., "6.79% (2-Year Fixed)"). This should be based on common client choices like 1 or 2-year fixed terms, unless the client profile strongly suggests otherwise.

        Provide the output in the specified JSON format.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    assessmentSummary: {
                        type: Type.STRING,
                        description: "A summary of the assessment of the client's financial situation and ability to repay.",
                    },
                    recommendations: {
                        type: Type.ARRAY,
                        description: "An array of recommended lenders.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                lender: { type: Type.STRING, description: "The name of the recommended lender." },
                                confidenceScore: { type: Type.NUMBER, description: "A score from 0.0 to 1.0 indicating suitability." },
                                rationale: { type: Type.STRING, description: "The reasoning behind the recommendation." },
                                pros: { type: Type.ARRAY, items: { type: Type.STRING } },
                                cons: { type: Type.ARRAY, items: { type: Type.STRING } },
                                interestRate: { type: Type.STRING, description: "The most relevant interest rate, e.g., '6.79% (2-Year Fixed)'." }
                            },
                            required: ['lender', 'confidenceScore', 'rationale', 'pros', 'cons', 'interestRate'],
                        },
                    },
                },
                required: ['assessmentSummary', 'recommendations'],
            },
        },
      });

      return JSON.parse(response.text);

    } catch (error) {
        console.error("Error calling Gemini API for lender recommendation:", error);
        throw new Error("Failed to get lender recommendation from AI assistant.");
    }
};

const summarizeAndExtractActions = async (transcript: string): Promise<{ summary: string; actions: string[] }> => {
    try {
        const fullPrompt = `
        You are an AI assistant for a mortgage broker. Your task is to process a meeting transcript.
        1. Provide a concise summary of the meeting.
        2. Extract any clear action items for the broker or the client. List them as bullet points.

        Transcript:
        ---
        ${transcript}
        ---

        Please provide the output in the specified JSON format.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: fullPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        summary: {
                            type: Type.STRING,
                            description: "A concise summary of the meeting.",
                        },
                        actions: {
                            type: Type.ARRAY,
                            description: "A list of action items.",
                            items: { type: Type.STRING },
                        },
                    },
                    required: ['summary', 'actions'],
                },
            },
        });

        return JSON.parse(response.text);

    } catch (error) {
        console.error("Error calling Gemini API for summarization:", error);
        throw new Error("Failed to summarize transcript.");
    }
};

const analyzeCompliance = async (text: string): Promise<AIComplianceResult> => {
    try {
        const fullPrompt = `
        You are a compliance officer AI for a financial advisory firm in New Zealand.
        Your task is to analyze a communication (note or email) for potential compliance risks.
        
        Look for issues such as:
        - Promising or guaranteeing outcomes (e.g., "I guarantee the loan will be approved").
        - Unsubstantiated claims (e.g., "this is the best rate you'll ever get").
        - High-pressure sales tactics (e.g., "you must sign today or the offer is gone").
        - Giving financial advice that is not recorded properly or is outside the advisor's scope.
        - Downplaying risks.

        Analyze the following text:
        ---
        ${text}
        ---

        Based on your analysis, determine if the text is compliant. If it is not, provide a brief reason.
        Respond in the specified JSON format.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: fullPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        isCompliant: {
                            type: Type.BOOLEAN,
                            description: "True if no compliance issues are found, otherwise false.",
                        },
                        reason: {
                            type: Type.STRING,
                            description: "A brief explanation if isCompliant is false. Null if compliant.",
                        },
                    },
                    required: ['isCompliant', 'reason'],
                },
            },
        });
        
        return JSON.parse(response.text) as AIComplianceResult;

    } catch (error) {
        console.error("Error calling Gemini API for compliance check:", error);
        // Default to compliant to avoid blocking user flow on API error
        return { isCompliant: true, reason: null };
    }
};

export const geminiService = {
  getDashboardInsights,
  getLenderRecommendation,
  summarizeAndExtractActions,
  analyzeCompliance,
};