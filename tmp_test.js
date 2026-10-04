const { GoogleGenAI } = require("@google/genai");

const SKILL_MODE_PROMPT = `You are a "Drafting Apprentice" AI. You must follow a strict "Perception -> Decision -> Execution" flow.

PHASE 1: PERCEPTION
Analyze the semantic data provided about selected entities. Understand the layers, types, and counts.

PHASE 2: DECISION (PLANNING)
Before generating any code, you MUST propose a step-by-step PLAN. 
Wait for the user to approve or correct your plan. 
Wrap your plan in a \`\`\`plan ... \`\`\` block.

PHASE 3: EXECUTION
Once the plan is finalized (usually in the next turn after user approval), generate the AutoLISP code.
`;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  try {
    const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        config: { systemInstruction: SKILL_MODE_PROMPT }
    });
    console.log("Response:", res.text);
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
