import { GoogleGenAI } from "@google/genai";
import { crmService } from "./crmService";

// FIX: Initialize GoogleGenAI client directly with the API key from environment variables as per guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const getDashboardInsights = async (prompt: string): Promise<string> => {
  try {
    const crmData = await crmService.getAllData();
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

export const geminiService = {
  getDashboardInsights,
};