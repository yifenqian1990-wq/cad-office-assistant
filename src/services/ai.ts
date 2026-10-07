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

export type StreamCallback = (chunk: string, reset?: boolean) => void;

export function parseApiError(error: any): { 
  code?: number | string; 
  status?: string; 
  message: string; 
  raw: string 
} {
  if (!error) return { message: '未知错误', raw: '' };
  
  const rawStr = typeof error === 'string' 
    ? error 
    : (error.message || error.statusText || String(error));
  
  let extractedCode: number | string | undefined = error.code || error.status;
  let extractedStatus: string | undefined = error.status;
  let extractedMessage = rawStr;

  if (typeof error === 'object' && error !== null) {
    if (error.error?.message) {
      extractedMessage = error.error.message;
      if (error.error.code) extractedCode = error.error.code;
      if (error.error.status) extractedStatus = error.error.status;
    }
  }

  const startIdx = rawStr.indexOf('{');
  const endIdx = rawStr.lastIndexOf('}');
  if (startIdx !== -1 && endIdx > startIdx) {
    try {
      const jsonCandidate = rawStr.substring(startIdx, endIdx + 1);
      const parsed = JSON.parse(jsonCandidate);
      if (parsed.error?.message) {
        extractedMessage = parsed.error.message;
        if (parsed.error.code) extractedCode = parsed.error.code;
        if (parsed.error.status) extractedStatus = parsed.error.status;
      } else if (parsed.message) {
        extractedMessage = parsed.message;
      }
    } catch {
      // not valid JSON
    }
  }

  extractedMessage = extractedMessage.replace(/^\[GoogleGenAI\s+Error\]:\s*/i, '').trim();

  let formatted = extractedMessage;
  if (extractedStatus && !formatted.includes(extractedStatus)) {
    formatted = `${extractedStatus}: ${formatted}`;
  } else if (extractedCode && !formatted.includes(String(extractedCode))) {
    formatted = `${extractedCode}: ${formatted}`;
  }

  return {
    code: extractedCode,
    status: extractedStatus,
    message: formatted,
    raw: rawStr
  };
}

export interface ServerBusyCheckResult {
  isBusy: boolean;
  reason: string;
}

/**
 * 判断错误是否由服务商高峰期算力繁忙/过载导致。
 * 如果是高峰期繁忙中断，则停止密钥轮换并给出明确的中断原因与建议。
 */
export function checkServerBusyError(error: any, provider: 'Gemini' | 'DeepSeek' | 'OpenAI' = 'Gemini'): ServerBusyCheckResult {
  if (!error) return { isBusy: false, reason: '' };

  const parsed = parseApiError(error);
  const code = String(parsed.code || error?.status || error?.code || '');
  const status = String(parsed.status || error?.status || '').toUpperCase();
  const rawCombined = `${parsed.raw} ${parsed.message} ${String(error?.message || '')} ${String(error?.statusText || '')}`.toLowerCase();

  // 1. 状态码与状态标识检查：503 (UNAVAILABLE / Service Unavailable), 529 (Site Overloaded), 504/502 (高峰网关超时或错误)
  const is503 = code === '503' || status.includes('503') || status.includes('UNAVAILABLE') || rawCombined.includes('503') || rawCombined.includes('unavailable');
  const is529 = code === '529' || status.includes('529') || rawCombined.includes('529');
  const is504 = code === '504' || status.includes('504') || rawCombined.includes('504');
  const is502 = code === '502' || status.includes('502') || rawCombined.includes('502');

  // 2. 关键词检查（中英文典型高峰期/高负载/繁忙错误提示）
  const busyKeywords = [
    'overloaded',
    'high demand',
    'server is busy',
    'server busy',
    'server_busy',
    'temporarily unavailable',
    'service unavailable',
    'service_unavailable',
    'capacity exceeded',
    'exceeded capacity',
    'model capacity',
    'high traffic',
    'traffic limit exceeded',
    'site is overloaded',
    'upstream request timeout',
    'upstream connect error',
    'gateway timeout',
    '服务器繁忙',
    '系统繁忙',
    '服务繁忙',
    '负载过高',
    '高峰期',
    '高峰时段',
    '高峰时刻',
    '服务暂时不可用',
    '服务不可用',
    '算力不足',
    '资源暂时耗尽，请稍后再试'
  ];

  const matchedKeyword = busyKeywords.find(kw => rawCombined.includes(kw.toLowerCase()));

  // 排除单纯由用户主动取消产生的中断
  const isUserAbort = rawCombined.includes('abort') || rawCombined.includes('cancelled');
  if (isUserAbort && !is503 && !is529 && !matchedKeyword) {
    return { isBusy: false, reason: '' };
  }

  if (is503 || is529 || is504 || is502 || matchedKeyword) {
    let specificDetail = '';
    if (rawCombined.includes('overloaded') || rawCombined.includes('负载过高')) {
      specificDetail = '官方模型算力负载过高（Model Overloaded）';
    } else if (rawCombined.includes('high demand') || rawCombined.includes('high traffic') || rawCombined.includes('高峰')) {
      specificDetail = '正处于使用高峰期，官方服务器并发请求超负荷（High Demand / Traffic）';
    } else if (rawCombined.includes('server is busy') || rawCombined.includes('server_busy') || rawCombined.includes('服务器繁忙') || rawCombined.includes('系统繁忙')) {
      specificDetail = '官方服务节点繁忙（Server Busy）';
    } else if (is529 || rawCombined.includes('site is overloaded')) {
      specificDetail = '站点过载（529 Site Overloaded）';
    } else if (is504 || rawCombined.includes('timeout')) {
      specificDetail = '服务器网关响应超时（504 Gateway Timeout）';
    } else if (is503 || status.includes('UNAVAILABLE') || rawCombined.includes('unavailable')) {
      specificDetail = '官方服务暂时不可用（503 Service Unavailable / UNAVAILABLE）';
    } else {
      specificDetail = '服务高峰期高负载';
    }

    const providerName = provider === 'Gemini' ? 'Google Gemini' : (provider === 'DeepSeek' ? 'DeepSeek' : 'OpenAI');
    const cleanErrorSnippet = parsed.message ? `\n📌 服务端返回：${parsed.message}` : '';

    const reason = `【${providerName} 高峰期繁忙 · 生成中断】\n⚠️ 中断原因：${specificDetail}。\n此时段属于官方云端服务请求高峰，服务器并发负载已满。此问题属于服务商机房算力承载上限，并非您的 API 密钥失效或个人额度用尽。因此系统已直接停止生成，未进行密钥轮换。\n💡 建议操作：\n1. 请稍候 1~2 分钟待高峰流量缓解后重试。\n2. 或在【设置 - API配置】中切换为其他轻量或备用模型（如 gemini-2.5-flash / deepseek-chat）。${cleanErrorSnippet}`;

    return {
      isBusy: true,
      reason
    };
  }

  return { isBusy: false, reason: '' };
}

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
  onStream: StreamCallback,
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

  const handleStreamChunk = (chunk: string, reset?: boolean) => {
    if (reset) {
      fullResponse = chunk;
    } else {
      fullResponse += chunk;
    }
    onStream(chunk, reset);
  };

  if (activeProvider === 'gemini') {
    const candidateKeys = settings.geminiKeys && settings.geminiKeys.length > 0
      ? settings.geminiKeys.filter(k => k.key && k.key.trim().length > 0)
      : (settings.geminiKey && settings.geminiKey.trim().length > 0
          ? [{ id: 'default', name: '默认密钥', key: settings.geminiKey.trim() }]
          : []);

    if (candidateKeys.length === 0) {
      throw new Error('未设置有效的 Gemini API 密钥，请在【设置 - API配置】中添加。');
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
    const attemptedKeys: { name: string; error: string }[] = [];

    for (let i = 0; i < candidateKeys.length; i++) {
        const currentKeyObj = candidateKeys[i];
        const apiKey = currentKeyObj.key.trim();
        if (!apiKey) continue;

        // If a previous key had streamed partial output before failing, clear it cleanly
        if (fullResponse.length > 0) {
          handleStreamChunk('', true);
        }
        
        const ai = new GoogleGenAI({ apiKey });
        let isThinking = false;
        
        try {
            console.log(`[Gemini] 正在尝试密钥 "${currentKeyObj.name}" (${i + 1}/${candidateKeys.length})，模型: ${settings.geminiModel}`);
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

                // Check for candidates parts to support reasoning/thinking tokens (part.thought)
                const parts = (chunk as any).candidates?.[0]?.content?.parts;
                if (parts && parts.length > 0) {
                  for (const part of parts) {
                    if (typeof part.text === 'string' && part.text) {
                      if (part.thought) {
                        if (!isThinking) {
                          handleStreamChunk('<think>\n' + part.text);
                          isThinking = true;
                        } else {
                          handleStreamChunk(part.text);
                        }
                      } else {
                        if (isThinking) {
                          handleStreamChunk('\n</think>\n\n' + part.text);
                          isThinking = false;
                        } else {
                          handleStreamChunk(part.text);
                        }
                      }
                    }
                  }
                } else if (chunk.text) {
                  if (isThinking) {
                    handleStreamChunk('\n</think>\n\n' + chunk.text);
                    isThinking = false;
                  } else {
                    handleStreamChunk(chunk.text);
                  }
                }
            }
            if (isThinking) {
              handleStreamChunk('\n</think>\n\n');
              isThinking = false;
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
            if (isThinking) {
              handleStreamChunk('\n</think>\n\n');
              isThinking = false;
            }
            console.error(`Gemini Error with key "${currentKeyObj.name}":`, error);
            const parsedErr = parseApiError(error);
            const errSummary = parsedErr.message || String(error);
            attemptedKeys.push({ name: currentKeyObj.name, error: errSummary });
            lastError = errSummary;

            // 1. 判断是否属于高峰期服务繁忙/过载导致的中断。若是，直接停止并给出明确中断原因，无需轮换备用密钥
            const busyCheck = checkServerBusyError(error, 'Gemini');
            if (busyCheck.isBusy) {
              console.warn(`[Gemini] 检测到高峰时刻繁忙中断，直接停止并跳过密钥轮换:`, busyCheck.reason);
              if (fullResponse.trim().length > 0) {
                handleStreamChunk(`\n\n*(⚠️ ${busyCheck.reason})*`);
              }
              throw new Error(busyCheck.reason);
            }

            // Check if model name format itself is invalid (INVALID_ARGUMENT / unexpected format)
            const isFatalModelArgError = 
              errSummary.includes('unexpected model name format') || 
              (errSummary.includes('INVALID_ARGUMENT') && errSummary.toLowerCase().includes('model'));

            if (isFatalModelArgError) {
              console.warn(`[Gemini] 检测到模型名称配置错误 (${settings.geminiModel})，中断轮换。`);
              break;
            }

            // Always try the next key in the pool if available (handles 429, 401, 403, 500, network error, etc.)
            if (i < candidateKeys.length - 1) {
              console.warn(
                `[Gemini] 密钥 "${currentKeyObj.name}" 调用失败 (${errSummary})，正在自动轮换尝试下一个密钥 "${candidateKeys[i + 1].name}" (${i + 2}/${candidateKeys.length})...`
              );
              continue;
            } else {
              console.warn(`[Gemini] 所有 ${candidateKeys.length} 个可用密钥均已尝试完毕，均未成功。`);
              break;
            }
        }
    }

    if (!success) {
        let finalErrorMsg = lastError || '与 Gemini API 通信时发生错误';
        if (finalErrorMsg.includes('unexpected model name format') || finalErrorMsg.includes('INVALID_ARGUMENT')) {
            finalErrorMsg = `模型名称格式错误 (${settings.geminiModel})。请在【设置 - API配置】中使用标准的 API 标识符，例如：gemini-2.5-flash 或 gemini-2.0-flash`;
        } else if (candidateKeys.length > 1) {
            const attemptedNames = attemptedKeys.map(k => `"${k.name}"`).join('、');
            finalErrorMsg = `所有可用的 ${candidateKeys.length} 个 Gemini 密钥（${attemptedNames}）均已尝试并失败。\n最后一次错误：${finalErrorMsg}`;
            if (finalErrorMsg.includes('503') || finalErrorMsg.includes('high demand') || finalErrorMsg.includes('UNAVAILABLE')) {
              finalErrorMsg += `\n\n💡 提示：Gemini 官方服务当前正经历高负载高峰（503 UNAVAILABLE）。通常短时间内会恢复，您也可以在【设置 - API配置】中切换模型（如 gemini-2.5-flash / gemini-2.0-flash）或稍后重试。`;
            }
        } else {
            if (finalErrorMsg.includes('503') || finalErrorMsg.includes('high demand') || finalErrorMsg.includes('UNAVAILABLE')) {
              finalErrorMsg = `Gemini API 调用失败（503 UNAVAILABLE）：模型当前正经历请求高峰。\n💡 建议：可稍后重试，或在【设置 - API配置】中添加备用密钥 / 切换其他模型。`;
            } else {
              finalErrorMsg = `Gemini API 调用失败 [${candidateKeys[0]?.name || '默认密钥'}]：${finalErrorMsg}`;
            }
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
    const attemptedKeys: { name: string; error: string }[] = [];

    for (let i = 0; i < keysList.length; i++) {
      const currentKeyObj = keysList[i];
      const apiKey = currentKeyObj.key.trim();
      if (!apiKey) continue;

      if (fullResponse.length > 0) {
        handleStreamChunk('', true);
      }

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
          const httpErr: any = new Error(`${isDeepSeek ? 'DeepSeek' : 'OpenAI'} API 错误 (${res.status}): ${errDetail}`);
          httpErr.status = res.status;
          httpErr.code = res.status;
          throw httpErr;
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
        console.error(`${isDeepSeek ? 'DeepSeek' : 'OpenAI'} Error with key "${currentKeyObj.name}":`, error);
        const parsedErr = parseApiError(error);
        const errSummary = parsedErr.message || '网络连接或请求超时';
        attemptedKeys.push({ name: currentKeyObj.name, error: errSummary });
        lastError = errSummary;

        // 1. 判断是否属于高峰期服务繁忙/过载导致的中断。若是，直接停止并给出明确中断原因，无需轮换备用密钥
        const busyCheck = checkServerBusyError(error, isDeepSeek ? 'DeepSeek' : 'OpenAI');
        if (busyCheck.isBusy) {
          console.warn(`[${isDeepSeek ? 'DeepSeek' : 'OpenAI'}] 检测到高峰时刻繁忙中断，直接停止并跳过密钥轮换:`, busyCheck.reason);
          if (fullResponse.trim().length > 0) {
            handleStreamChunk(`\n\n*(⚠️ ${busyCheck.reason})*`);
          }
          throw new Error(busyCheck.reason);
        }

        if (i < keysList.length - 1) {
          console.warn(`[${isDeepSeek ? 'DeepSeek' : 'OpenAI'}] 密钥 "${currentKeyObj.name}" 调用失败 (${errSummary})，正在自动轮换尝试下一个密钥 "${keysList[i + 1].name}" (${i + 2}/${keysList.length})...`);
          continue;
        } else {
          break;
        }
      }
    }

    if (!success) {
      let finalErrorMsg = lastError || `调用 ${isDeepSeek ? 'DeepSeek' : 'OpenAI'} 接口失败，请检查密钥与网络设置。`;
      if (keysList.length > 1) {
        const attemptedNames = attemptedKeys.map(k => `"${k.name}"`).join('、');
        finalErrorMsg = `所有可用的 ${keysList.length} 个 ${isDeepSeek ? 'DeepSeek' : 'OpenAI'} 密钥（${attemptedNames}）均已尝试并失败。\n最后一次错误：${finalErrorMsg}`;
      }
      throw new Error(finalErrorMsg);
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
