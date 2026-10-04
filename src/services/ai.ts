import { AppSettings } from '../hooks/useSettings';
import { GoogleGenAI } from '@google/genai';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  rawContent?: string;
  timestamp: number;
  attachments?: {name: string, code: string, language: string}[];
  images?: string[]; // Array of base64 data URLs
  cadOutput?: string; // Captures raw execution logs
}

export type InteractionMode = 'CODE' | 'SKILL';

const BASE_GUIDELINES = `
IMPORTANT GUIDELINES:
1. Wrap all AutoLISP code in a \`\`\`lisp ... \`\`\` block.
2. Define your main commands using \`(defun c:COMMAND_NAME () ...)\`. Include local variables in the \`/ \` list to prevent variable leakage.
3. AT THE END OF THE SCRIPT, add a call to the main command, e.g. \`(c:COMMAND_NAME)\` so it runs immediately.
4. Do NOT instruct the user to type the command name.
5. Error Handling: Include standard error handlers (\`*error*\`) to restore system variables.
6. Safety Layer: If a user request violates physical limits (e.g., profile length > 6000mm), warn the user before generating code.
7. PARAMETERS: If your script requires parameters, explain them clearly in natural language before the code block. DO NOT use JSON to describe parameters. To retain CAD operation functionality, you MUST USE AutoLISP's interactive functions inside your code (such as \`getpoint\`, \`getreal\`, \`getdist\`, \`getstring\`, \`getint\`) so the user can input parameters via mouse or command-line during execution.
8. 对象格式：通过代码生成的的CAD对象格式如没有用户指定则默认按当前的设置状态（即图层、颜色、线型、属性等不进行强行硬编码，使其采用 AutoCAD 当前的工作环境设置）。
`;

const CODE_MODE_PROMPT = `You are an expert AutoCAD AutoLISP developer. 
Your goal is to provide direct solutions and scripts for AutoCAD drafting.
${BASE_GUIDELINES}
Focus on efficiency and correctness.`;

const SKILL_MODE_PROMPT = `You are a "Drafting Apprentice" AI. You must follow a strict "Perception -> Decision -> Execution" flow.

PHASE 1: PERCEPTION
Analyze the semantic data provided about selected entities. Understand the layers, types, and counts.

PHASE 2: DECISION (PLANNING)
Before generating any code, you MUST propose a step-by-step PLAN. 
Wait for the user to approve or correct your plan. 
Wrap your plan in a \`\`\`plan ... \`\`\` block.

PHASE 3: EXECUTION
Once the plan is finalized (usually in the next turn after user approval), generate the AutoLISP code.
${BASE_GUIDELINES}

PHASE 4: EVALUATION
Ask the user if the result matches their expectations. If logic is successful, suggest saving this as a "New Skill".`;

export async function generateResponse(
  messages: ChatMessage[],
  settings: AppSettings,
  onStream: (chunk: string) => void,
  executeCode?: (code: string) => Promise<string | boolean>,
  mode: InteractionMode = 'CODE',
  module: 'CAD' | 'OFFICE' = 'CAD',
  abortSignal?: AbortSignal
): Promise<{ nextPrompt?: string, autoExecPayload?: string, cadOutput?: string } | void> {
  if (abortSignal?.aborted) return;
  const { activeProvider } = settings;
  
  const OFFICE_MODE_PROMPT = `You are an expert Office & WPS productivity assistant specialized in Microsoft Office (Excel, Word, PowerPoint) and WPS Office (WPS Spreadsheets, WPS Writer, WPS Presentation).

Your capabilities cover two main categories:
1. **Excel / WPS 表格公式与函数 (Worksheet Formulas)**:
   - When the user asks for Excel / WPS formulas (e.g., VLOOKUP, XLOOKUP, INDEX/MATCH, IFERROR, SUMIFS, date calculations, conditional formulas, etc.):
   - Wrap the formula in a \`\`\`excel ... \`\`\` code block.
   - Do NOT add any extra text like "excel" on the first line inside the code block. Put only the clean formula (e.g., \`=IFERROR(INDEX(B:B, MATCH(D2, A:A, 0)), "")\`).
   - Explain each parameter, use cases, and how the user can paste and apply it in their cells.
   - Do NOT wrap formulas in VBA Sub/Function unless VBA is explicitly requested.

2. **VBA / JSA 宏与自动化脚本 (VBA Macros & Automation)**:
   - When the user asks for macros, automation, batch processing, document generation, or VBA/JSA scripts:
   - Wrap VBA code in a \`\`\`vba ... \`\`\` block.
   - Structure your code with an entry point Sub, e.g.
     \`\`\`vba
     Sub AutoProcessData()
         ' Your code here
     End Sub
     \`\`\`
   - **One-Click Execution & Event Procedures**:
     * By default, prefer standard parameterless Macros that operate on \`ActiveCell\` or \`Selection\` (e.g. \`Sub 复制当前行()\`). This allows one-click automated execution directly via the web interface.
     * If the user specifically asks for interactive worksheet event triggers (like double-click \`Worksheet_BeforeDoubleClick\` or change \`Worksheet_Change\`):
       1) Explicitly emphasize to the user that event code MUST be placed into the specific Worksheet code page (e.g. \`Sheet1\`), and will NOT trigger if placed in a standard module (\`模块1\`).
       2) Also provide an accompanying standard one-click macro (e.g. \`Sub 一键执行()\`) based on \`ActiveCell\` so they can click "发送到 Office 运行" immediately without manual copy-pasting.
   - Stick to standard Excel, Word, and PowerPoint object models.
   - Add clear comments explaining key operations and error handling.
   - Focus on compatibility with both MS Office and WPS Office.
`;

  let systemInstruction = CODE_MODE_PROMPT;
  if (module === 'OFFICE') {
    systemInstruction = OFFICE_MODE_PROMPT;
  } else if (mode === 'SKILL') {
    systemInstruction = SKILL_MODE_PROMPT;
  }
  if (settings.personalPreferences && settings.personalPreferences.trim()) {
    systemInstruction += `\n\nUSER PERSONAL PREFERENCES & ADDITIONAL INSTRUCTIONS:\n${settings.personalPreferences.trim()}`;
  }
  let fullResponse = '';

  const handleStreamChunk = (chunk: string) => {
    fullResponse += chunk;
    onStream(chunk);
  };

  if (activeProvider === 'gemini') {
    if (!settings.geminiKeys || settings.geminiKeys.length === 0) {
      if (settings.geminiKey) {
        settings.geminiKeys = [{ id: 'default', name: '默认密钥', key: settings.geminiKey }];
      } else {
        throw new Error('未设置 Gemini API 密钥，请在设置中添加。');
      }
    }
    
    const geminiContents = messages.map(m => {
      let text = m.content;
      // Strip auto-execution feedback from past messages so LLM context is clean
      // and it only considers the current task.
      const feedbackIndex = text.indexOf('\n\n---\n**Auto-execution Feedback:**');
      if (feedbackIndex !== -1) {
        text = text.substring(0, feedbackIndex);
      }
      
      if (m.cadOutput) {
        text += `\n\n[CAD Execution Output for context]:\n\`\`\`\n${m.cadOutput}\n\`\`\``;
      }
      
      const parts: any[] = [{ text: text }];
      if (m.images) {
        for (const img of m.images) {
          const match = img.match(/^data:(image\/\w+);base64,(.*)$/);
          if (match) {
            parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          }
        }
      }
      return {
        role: m.role === 'user' ? 'user' : 'model',
        parts
      };
    });

    let lastError: any = null;
    let success = false;

    for (let i = 0; i < settings.geminiKeys.length; i++) {
        const apiKey = settings.geminiKeys[i].key;
        if (!apiKey) continue;
        
        const ai = new GoogleGenAI({ apiKey });
        
        try {
            const responseStream = await ai.models.generateContentStream({
                model: settings.geminiModel,
                contents: geminiContents,
                config: {
                  systemInstruction: systemInstruction,
                }
            });
            
            for await (const chunk of responseStream) {
                if (abortSignal?.aborted) {
                  break;
                }
                if (chunk.text) {
                  handleStreamChunk(chunk.text);
                }
            }
            if (abortSignal?.aborted) {
              return;
            }
            success = true;
            break; 
        } catch (error: any) {
            if (abortSignal?.aborted) {
              return;
            }
            console.error(`Gemini Error with key ${settings.geminiKeys[i].name}:`, error);
            let errMsg = error.message || '';
            
            try {
                if (errMsg.includes('{')) {
                  const parsed = JSON.parse(errMsg);
                  if (parsed.error && parsed.error.message) errMsg = parsed.error.message;
                }
            } catch (e) {}

            lastError = errMsg;
            
            if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('unauthorized') || errMsg.toLowerCase().includes('permissions')) {
                console.log(`Key ${settings.geminiKeys[i].name} exhausted or invalid, trying next...`);
                continue;
            } else {
                break;
            }
        }
    }

    if (!success) {
        let finalErrorMsg = lastError || 'Error communicating with Gemini API';
        if (finalErrorMsg.includes('unexpected model name format') || finalErrorMsg.includes('INVALID_ARGUMENT')) {
            finalErrorMsg = `模型名称格式错误 (${settings.geminiModel})。请在设置中使用标准的API标识符，例如：gemini-2.5-flash`;
        } else if (settings.geminiKeys.length > 1) {
            finalErrorMsg = `所有可用的 Gemini 密钥均已尝试并失败。最后一次错误：${finalErrorMsg}`;
        }
        throw new Error(finalErrorMsg);
    }
  } else {
    // Handling DeepSeek & OpenAI Compatible APIs
    const isDeepSeek = activeProvider === 'deepseek';
    
    // Prepare API keys list
    let keysList: { id: string, name: string, key: string }[] = [];
    if (isDeepSeek) {
      if (settings.deepseekKeys && settings.deepseekKeys.length > 0) {
        keysList = settings.deepseekKeys.filter(k => k.key.trim() !== '');
      } else if (settings.openaiKey) {
        keysList = [{ id: 'default', name: '默认密钥', key: settings.openaiKey }];
      }
    } else {
      if (settings.openaiKey) {
        keysList = [{ id: 'default', name: '默认密钥', key: settings.openaiKey }];
      }
    }

    if (keysList.length === 0) {
      throw new Error(isDeepSeek ? '未设置 DeepSeek API 密钥，请在设置中添加。' : '未设置 OpenAI API 密钥，请在设置中添加。');
    }

    // Determine Base URL and Model
    let rawBaseUrl = isDeepSeek 
      ? (settings.deepseekBaseUrl || 'https://api.deepseek.com') 
      : (settings.openaiBaseUrl || 'https://api.openai.com/v1');
    
    rawBaseUrl = rawBaseUrl.trim().replace(/\/+$/, '');
    if (!rawBaseUrl.startsWith('http://') && !rawBaseUrl.startsWith('https://')) {
      rawBaseUrl = 'https://' + rawBaseUrl;
    }

    let url = rawBaseUrl;
    if (!url.endsWith('/chat/completions')) {
      url = `${url}/chat/completions`;
    }

    const modelName = isDeepSeek 
      ? (settings.deepseekModel || 'deepseek-chat') 
      : (settings.openaiModel || 'gpt-4o');

    const isReasoner = modelName.toLowerCase().includes('reasoner') || modelName.toLowerCase().includes('r1');
    const oaiMessages: any[] = [];

    // DeepSeek API (both V3 and R1) and OpenAI both support system message.
    // Ensure systemInstruction includes strict output requirement for code block in final content.
    const strictCodePrompt = module === 'OFFICE'
      ? '\n\n【重要规范】思考完毕后，你必须在最终回复正文中输出完整内容：若是公式/函数请使用 ```excel ... ``` 代码块并附详细说明；若是宏/自动化脚本请使用 ```vba ... ``` 代码块（包含 Sub 入口），切勿留空或仅在思考中提及！'
      : '\n\n【重要规范】思考完毕后，你必须在最终回复正文中输出完整的可直接运行的 ```lisp ... ``` 代码块（包含入口命令定义如 (defun c:...) 及在尾部调用），切勿留空或仅在思考中提及！';

    oaiMessages.push({ 
      role: 'system', 
      content: systemInstruction + strictCodePrompt 
    });
    
    for (let idx = 0; idx < messages.length; idx++) {
      const m = messages[idx];
      let text = m.content;
      const feedbackIndex = text.indexOf('\n\n---\n**Auto-execution Feedback:**');
      if (feedbackIndex !== -1) {
        text = text.substring(0, feedbackIndex);
      }

      // Strip previous thinking traces (<think>...</think>) from history so past thoughts don't poison context
      if (m.role === 'assistant') {
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      }

      if (m.cadOutput) {
        text += `\n\n[CAD Execution Output for context]:\n\`\`\`\n${m.cadOutput}\n\`\`\``;
      }

    // For the latest user message, add an extra reminder if using a reasoner model
    const isLatestUser = idx === messages.length - 1 && m.role === 'user';
    if (isReasoner && isLatestUser) {
      text += module === 'OFFICE'
        ? `\n\n【重要要求】请在思考推导完成后，务必在正式回复正文中输出完整的 \`\`\`excel ... \`\`\` 公式或 \`\`\`vba ... \`\`\` 宏代码块及使用说明，切勿仅在思考中保留。`
        : `\n\n【重要要求】请在思考推导完成后，务必在正式回复正文中输出完整的 \`\`\`lisp ... \`\`\` AutoLISP 代码块（包含 (defun c:...) 入口命令），切勿仅在思考中保留。`;
    }

      if (m.images && m.images.length > 0) {
        const content = [];
        content.push({ type: "text", text: text });
        for (const img of m.images) {
          content.push({ type: "image_url", image_url: { url: img } });
        }
        oaiMessages.push({ role: m.role, content });
      } else {
        oaiMessages.push({ role: m.role, content: text });
      }
    }

    let lastError: any = null;
    let success = false;

    for (let i = 0; i < keysList.length; i++) {
      const apiKey = keysList[i].key;
      if (!apiKey) continue;

      try {
        const requestPayload: any = {
          model: modelName,
          messages: oaiMessages,
          stream: true,
          max_tokens: 8192,
        };

        // DeepSeek reasoning models like deepseek-reasoner don't use temperature
        if (!isReasoner) {
          requestPayload.temperature = 0.3;
        }

        const res = await fetch(url, {
          method: 'POST',
          signal: abortSignal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestPayload)
        });

        if (!res.ok) {
          let errDetail = '';
          try {
            const errJson = await res.json();
            errDetail = errJson.error?.message || JSON.stringify(errJson);
          } catch {
            errDetail = await res.text();
          }
          throw new Error(`${isDeepSeek ? 'DeepSeek' : 'OpenAI'} API 错误 (${res.status}): ${errDetail}`);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder('utf-8');

        if (!reader) throw new Error('无法创建响应数据流读取器 (No reader from response)');

        let done = false;
        let sseBuffer = '';
        let accumulatedReasoning = '';
        let accumulatedContent = '';

        while (!done) {
          if (abortSignal?.aborted) {
            try { await reader.cancel(); } catch {}
            return;
          }
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            sseBuffer += decoder.decode(value, { stream: !done });
            const lines = sseBuffer.split(/\r?\n/);
            // Retain incomplete last line in buffer
            sseBuffer = lines.pop() || '';

            for (const line of lines) {
              if (abortSignal?.aborted) {
                try { await reader.cancel(); } catch {}
                return;
              }
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]' || trimmed === 'data:[DONE]') continue;
              if (trimmed.startsWith('data:')) {
                const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
                if (!jsonStr || jsonStr === '[DONE]') continue;
                try {
                  const data = JSON.parse(jsonStr);
                  const choice = data.choices?.[0];
                  if (!choice) continue;

                  const reasoning = choice.delta?.reasoning_content || choice.delta?.reasoning;
                  if (reasoning) {
                    accumulatedReasoning += reasoning;
                  }

                  const content = choice.delta?.content;
                  if (content) {
                    accumulatedContent += content;
                    handleStreamChunk(content);
                  }
                } catch {
                  // Ignore JSON parse errors for fragmented SSE lines
                }
              }
            }
          }
        }

        if (abortSignal?.aborted) return;

        // Process any remainder in sseBuffer
        if (sseBuffer.trim()) {
          const trimmed = sseBuffer.trim();
          if (trimmed.startsWith('data:') && !trimmed.includes('[DONE]')) {
            try {
              const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
              const data = JSON.parse(jsonStr);
              const choice = data.choices?.[0];
              const reasoning = choice?.delta?.reasoning_content || choice?.delta?.reasoning;
              if (reasoning) accumulatedReasoning += reasoning;
              const content = choice?.delta?.content;
              if (content) {
                accumulatedContent += content;
                handleStreamChunk(content);
              }
            } catch {}
          }
        }

        if (abortSignal?.aborted) return;

        // If reasoning model completed thought process but generated 0 final answer content
        // (common when R1 stops at thought boundary or hits token limits before answer start)
        if (accumulatedContent.trim().length === 0 && (accumulatedReasoning.length > 0 || isReasoner)) {
          try {
            const followUpMessages = [
              ...oaiMessages,
              ...(accumulatedReasoning ? [{ role: 'assistant', content: accumulatedReasoning }] : []),
              { 
                role: 'user', 
                content: module === 'OFFICE'
                  ? '请基于上述分析，直接输出完整的可执行 VBA 宏代码块（```vba ... ```）或 Excel 公式（```excel ... ```）及使用说明。'
                  : '请基于上述分析，直接输出完整、可直接在 AutoCAD 运行的 AutoLISP 代码块（```lisp ... ```，包含 (defun c:...) 入口命令）及操作说明。'
              }
            ];

            const fallbackModel = isDeepSeek ? 'deepseek-chat' : (modelName.includes('reasoner') ? 'gpt-4o' : modelName);
            const followUpRes = await fetch(url, {
              method: 'POST',
              signal: abortSignal,
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model: fallbackModel,
                messages: followUpMessages,
                stream: true,
                max_tokens: 4096,
                temperature: 0.3
              })
            });

            if (followUpRes.ok && followUpRes.body) {
              const fReader = followUpRes.body.getReader();
              let fDone = false;
              let fBuffer = '';
              while (!fDone) {
                if (abortSignal?.aborted) {
                  try { await fReader.cancel(); } catch {}
                  return;
                }
                const { value, done: fDoneReading } = await fReader.read();
                fDone = fDoneReading;
                if (value) {
                  fBuffer += decoder.decode(value, { stream: !fDone });
                  const fLines = fBuffer.split(/\r?\n/);
                  fBuffer = fLines.pop() || '';
                  for (const fLine of fLines) {
                    if (abortSignal?.aborted) {
                      try { await fReader.cancel(); } catch {}
                      return;
                    }
                    const fTrimmed = fLine.trim();
                    if (!fTrimmed || fTrimmed.includes('[DONE]')) continue;
                    if (fTrimmed.startsWith('data:')) {
                      try {
                        const fData = JSON.parse(fTrimmed.replace(/^data:\s*/, ''));
                        const fContent = fData.choices?.[0]?.delta?.content;
                        if (fContent) {
                          handleStreamChunk(fContent);
                        }
                      } catch {}
                    }
                  }
                }
              }
            }
          } catch (followUpErr: any) {
            if (abortSignal?.aborted || followUpErr?.name === 'AbortError') return;
            console.error('Auto follow-up completion error:', followUpErr);
          }
        }

        if (abortSignal?.aborted) return;
        success = true;
        break;
      } catch (error: any) {
        if (abortSignal?.aborted || error?.name === 'AbortError' || error?.message?.includes('aborted')) {
          return;
        }
        console.error(`${isDeepSeek ? 'DeepSeek' : 'OpenAI'} Error with key ${keysList[i].name}:`, error);
        lastError = error.message || '网络连接或请求超时';

        // Check if retryable error (rate limit, quota, or invalid key with more keys available)
        const isQuotaOrAuth = lastError.includes('429') || lastError.includes('quota') || 
                              lastError.includes('401') || lastError.includes('Insufficient Balance') || 
                              lastError.includes('insufficient_quota') || lastError.includes('402');
        if (isQuotaOrAuth && keysList.length > 1 && i < keysList.length - 1) {
          console.log(`Key ${keysList[i].name} failed, trying next key...`);
          continue;
        } else {
          break;
        }
      }
    }

    if (!success) {
      throw new Error(lastError || `调用 ${isDeepSeek ? 'DeepSeek' : 'OpenAI'} 接口失败，请检查密钥与网络设置。`);
    }
  }

  // Auto-execute logic if executeCode is provided
  if (abortSignal?.aborted) return;
  let nextPrompt: string | undefined = undefined;
  let finalErrorFeedback: string | undefined = undefined;
  let fullCadOutput: string | undefined = undefined;
  
  if (executeCode) {
    // Robust Regex to match AutoLISP code blocks (including ```lsp, ```lisp, ```autolisp, ```cad)
    const lispRegex = /```(?:lisp|lsp|autolisp|cad|autocad)?\s*\r?\n([\s\S]*?)(?:```|$)/gi;
    // Robust Regex to match VBA code blocks (including ```vba, ```vb, ```bas, ```visualbasic)
    const vbaRegex = /```(?:vba|vb|bas|visualbasic|vbs|macro)?\s*\r?\n([\s\S]*?)(?:```|$)/gi;
    
    let match;
    const codesToExecute: string[] = [];
    
    // Strip out <think>...</think> content first so reasoning notes with code snippets aren't executed by mistake
    const cleanResponseForExec = fullResponse.replace(/<think>[\s\S]*?<\/think>/gi, '');

    if (module === 'OFFICE') {
      while ((match = vbaRegex.exec(cleanResponseForExec)) !== null) {
        const codeText = match[1].trim();
        if (codeText && (codeText.toLowerCase().includes('sub ') || codeText.toLowerCase().includes('function ') || codeText.toLowerCase().includes('dim '))) {
          codesToExecute.push(codeText);
        }
      }
    } else {
      while ((match = lispRegex.exec(cleanResponseForExec)) !== null) {
        const codeText = match[1].trim();
        if (codeText && (codeText.includes('(defun') || codeText.includes('(command') || codeText.includes('(setq') || codeText.includes('('))) {
          codesToExecute.push(codeText);
        }
      }
    }

    if (codesToExecute.length > 0) {
      let errorFeedback = '';
      let combinedOutput = '';
      
      for (let i = 0; i < codesToExecute.length; i++) {
        try {
          const res = await executeCode(codesToExecute[i]);
          if (typeof res === 'string' && res.trim()) {
            combinedOutput += `[Script ${i + 1} Output]:\n${res.trim()}\n`;
            const lower = res.toLowerCase();
            const isActualError = lower.includes('error:') || lower.includes('错误:') || lower.includes('exception') || lower.includes('syntax error') || lower.includes('quit / exit abort');
            if (isActualError) {
              errorFeedback += `Script ${i + 1} Error Output:\n\`\`\`text\n${res.trim()}\n\`\`\`\n`;
            }
          } else {
            combinedOutput += `[Script ${i + 1}]: ✅ Executed successfully.\n`;
          }
        } catch (err: any) {
          combinedOutput += `[Script ${i + 1} Error]:\n${err.message}\n`;
          errorFeedback += `Script ${i + 1} Error:\n\`\`\`text\n${err.message}\n\`\`\`\n`;
        }
      }
      
      if (combinedOutput) {
        fullCadOutput = combinedOutput.trim();
      }
      
      if (errorFeedback) {
        finalErrorFeedback = errorFeedback;
        nextPrompt = module === 'OFFICE'
          ? `我在 Office/WPS 中自动执行了你提供的 VBA 代码，但遇到了一些错误。请根据反馈信息，修正代码并重新提供完整的代码。`
          : `我在 AutoCAD 中自动执行了你提供的代码，但遇到了一些错误。请根据反馈信息，修正代码并重新提供完整的代码。`;
      }
    }
  }
  
  return { nextPrompt, autoExecPayload: finalErrorFeedback, cadOutput: fullCadOutput };
}
