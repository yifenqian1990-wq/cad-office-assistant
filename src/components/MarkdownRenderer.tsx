import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Copy, Download, Check, Play, Loader2, AlertCircle, 
  BookmarkPlus, ChevronDown, ChevronRight, Sparkles, Clock
} from 'lucide-react';

import { downloadAsAnsi } from '../lib/downloadAnsi';
import type { CadBusyState } from '../hooks/useAutoCadSync';

function CodeBlock({ 
  node, 
  className, 
  children, 
  onSendToCad, 
  onSendToOffice, 
  activeModule = 'CAD', 
  onBookmark, 
  cadBusyState,
  ...props 
}: any) {
  const match = /language-([a-zA-Z0-9_-]+)/i.exec(className || '');
  const rawLang = match ? match[1].toLowerCase() : '';
  let content = String(children).replace(/\r?\n$/, '');

  // Strip accidental language prefix on the first line (e.g., if code is "excel\n=IFERROR(...)")
  const leadingLangMatch = /^(?:excel|vba|lisp|lsp|autolisp|bas|formula|fx)\s*\r?\n([\s\S]+)$/i.exec(content);
  if (leadingLangMatch) {
    content = leadingLangMatch[1].trim();
  }

  const hasNewline = content.includes('\n');
  const isCodeBlock = Boolean(match || hasNewline);

  // Distinguish Excel Formulas from VBA Macros and CAD Lisp
  const isVbaLang = ['vba', 'vb', 'bas', 'visualbasic', 'vbs', 'macro'].includes(rawLang) ||
    (activeModule === 'OFFICE' && !['excel', 'formula', 'fx', 'sheets', 'xlsx'].includes(rawLang) && 
      (content.includes('Sub ') || content.includes('Function ') || content.includes('End Sub') || content.includes('Dim ')));

  const isExcelFormula = !isVbaLang && (
    ['excel', 'formula', 'fx', 'sheets', 'xlsx', 'csv'].includes(rawLang) ||
    content.trim().startsWith('=') ||
    content.trim().startsWith('@=') ||
    (activeModule === 'OFFICE' && !isCodeBlock && content.trim().startsWith('='))
  );

  const isLispLang = ['lisp', 'lsp', 'autolisp', 'cad', 'autocad', 'cl', 'scheme'].includes(rawLang) ||
    (activeModule === 'CAD' && isCodeBlock && !isVbaLang && !isExcelFormula && rawLang !== 'json');

  const isCadTarget = isLispLang;
  const isOfficeTarget = isVbaLang;

  let displayLang = 'CODE';
  if (isExcelFormula) {
    displayLang = 'EXCEL 公式';
  } else if (isVbaLang) {
    displayLang = 'VBA 宏';
  } else if (isLispLang) {
    displayLang = 'LISP';
  } else if (rawLang) {
    displayLang = rawLang.toUpperCase();
  }

  const [copied, setCopied] = useState(false);
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [cadOutput, setCadOutput] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    let filename = `autocad-script${isCadTarget ? '.lsp' : '.txt'}`;
    if (isOfficeTarget) {
      filename = `office-macro.bas`;
    } else if (isExcelFormula) {
      filename = `excel-formula.txt`;
    }
    
    if (isCadTarget && activeModule === 'CAD') {
      downloadAsAnsi(content, filename);
    } else {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleSendToCad = async () => {
    if (!onSendToCad) return;
    try {
      setSendStatus('sending');
      setErrorMsg('');
      setCadOutput(null);
      const res = await onSendToCad(content);
      setSendStatus('success');
      if (typeof res === 'string' && res.trim()) {
        setCadOutput(res);
      }
      setTimeout(() => setSendStatus('idle'), 3000);
    } catch (err: any) {
      setSendStatus('error');
      setErrorMsg(err.message || '发送失败');
      setTimeout(() => setSendStatus('idle'), 6000);
    }
  };

  const handleSendToOffice = async () => {
    if (!onSendToOffice) return;
    try {
      setSendStatus('sending');
      setErrorMsg('');
      setCadOutput(null);
      const res = await onSendToOffice(content);
      setSendStatus('success');
      if (typeof res === 'string' && res.trim()) {
        setCadOutput(res);
      }
      setTimeout(() => setSendStatus('idle'), 3000);
    } catch (err: any) {
      setSendStatus('error');
      setErrorMsg(err.message || '发送失败');
      setTimeout(() => setSendStatus('idle'), 6000);
    }
  };

  if (rawLang === 'json') {
    return null;
  }

  if (!isCodeBlock) {
    return (
      <code className="bg-gray-100 text-blue-700 px-1.5 py-0.5 rounded text-xs font-mono border border-gray-200/80 inline-block align-middle my-0.5" {...props}>
        {children}
      </code>
    );
  }

  const actionButtons = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => onBookmark?.(content, displayLang.toLowerCase())}
        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 rounded transition-colors"
        title="收藏代码"
      >
        <BookmarkPlus size={13} />
        <span>收藏</span>
      </button>

      {/* Excel Formula copy button */}
      {isExcelFormula ? (
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors shadow-xs"
          title="复制公式后可直接粘贴至 Excel/WPS 单元格"
        >
          {copied ? <Check size={13} className="text-emerald-700" /> : <Copy size={13} className="text-emerald-700" />}
          <span className="font-semibold">{copied ? '公式已复制' : '复制公式'}</span>
        </button>
      ) : (
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 rounded transition-colors"
          title="复制到剪贴板"
        >
          {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      )}

      {/* Download button for files */}
      {!isExcelFormula && (
        <button
          onClick={handleDownload}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 rounded transition-colors"
          title="下载为文件"
        >
          <Download size={13} />
          <span>{isOfficeTarget ? '保存为.bas文件' : '保存为.lsp文件'}</span>
        </button>
      )}

      {/* VBA Macro Send to Office */}
      {isOfficeTarget && onSendToOffice && (
        <button
          onClick={handleSendToOffice}
          disabled={sendStatus === 'sending'}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all shadow-sm ${
            sendStatus === 'success' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
            sendStatus === 'error' ? 'bg-red-100 text-red-800 border border-red-300' :
            'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          {sendStatus === 'sending' ? (
            <><Loader2 size={13} className="animate-spin flex-shrink-0" /> <span>发送中...</span></>
          ) : sendStatus === 'success' ? (
            <><Check size={13} className="flex-shrink-0" /> <span>发送成功</span></>
          ) : sendStatus === 'error' ? (
            <><AlertCircle size={13} className="flex-shrink-0" /> <span title={errorMsg}>发送失败</span></>
          ) : (
            <><Play size={13} className="flex-shrink-0 fill-current" /> <span>发送至 Office/WPS 运行</span></>
          )}
        </button>
      )}

      {/* CAD Lisp Send to CAD */}
      {isCadTarget && onSendToCad && (
        <button
          onClick={handleSendToCad}
          disabled={sendStatus === 'sending'}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all shadow-sm ${
            sendStatus === 'success' ? 'bg-green-100 text-green-800 border border-green-300' :
            sendStatus === 'error' ? 'bg-red-100 text-red-800 border border-red-300' :
            sendStatus === 'sending' && cadBusyState?.isWaiting ? 'bg-amber-600 hover:bg-amber-700 text-white' :
            'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {sendStatus === 'sending' ? (
            cadBusyState?.isWaiting ? (
              <><Loader2 size={13} className="animate-spin flex-shrink-0" /> <span>等待 CAD 空闲...</span></>
            ) : (
              <><Loader2 size={13} className="animate-spin flex-shrink-0" /> <span>发送中...</span></>
            )
          ) : sendStatus === 'success' ? (
            <><Check size={13} className="flex-shrink-0" /> <span>发送成功</span></>
          ) : sendStatus === 'error' ? (
            <><AlertCircle size={13} className="flex-shrink-0" /> <span title={errorMsg}>发送失败</span></>
          ) : (
            <><Play size={13} className="flex-shrink-0 fill-current" /> <span>发送至 CAD 运行</span></>
          )}
        </button>
      )}
    </div>
  );

  return (
    <div className="relative my-4 rounded-xl overflow-hidden bg-white border border-gray-200 shadow-sm flex flex-col max-w-full text-gray-900">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-gray-50 border-b border-gray-200 flex-wrap gap-2">
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 focus:outline-none uppercase tracking-wider font-mono"
        >
          {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          <span className={isExcelFormula ? 'text-emerald-700 font-bold' : ''}>{displayLang}</span>
          <span className="text-[11px] text-gray-500 lowercase font-sans font-normal ml-1">
            {isExcelFormula ? '(可在表格中直接使用)' : `(${content.split('\n').length} 行代码)`}
          </span>
        </button>
        {actionButtons}
      </div>

      {/* Code body */}
      {!isCollapsed && (
        <div className={`p-4 overflow-x-auto max-h-[500px] font-mono text-[13px] leading-relaxed ${
          isExcelFormula ? 'bg-emerald-50/20 text-emerald-950 font-semibold' : 'bg-white text-gray-800'
        }`}>
          <pre {...props}>
            <code className="block whitespace-pre font-mono selection:bg-blue-100">{content}</code>
          </pre>
        </div>
      )}

      {/* Footer bar with action buttons */}
      {!isCollapsed && (
        <div className="flex items-center justify-between px-3.5 py-2 bg-gray-50 border-t border-gray-200">
          <div className="text-[11px] text-gray-500">
            {isExcelFormula && (
              <span>💡 提示：点击“复制公式”后，直接粘贴到 Excel 或 WPS 的单元格编辑栏即可。</span>
            )}
          </div>
          {actionButtons}
        </div>
      )}

      {/* CAD Busy waiting alert box */}
      {!isCollapsed && sendStatus === 'sending' && cadBusyState?.isWaiting && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 text-amber-900 text-xs flex items-start gap-2.5 animate-in fade-in">
          <Loader2 size={16} className="animate-spin text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <div className="font-semibold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock size={13} className="text-amber-600" />
                AutoCAD 正在被用户使用，已自动挂起等待
              </span>
              {cadBusyState.elapsed !== undefined && (
                <span className="font-mono text-[11px] text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded">
                  已等待 {cadBusyState.elapsed}s
                </span>
              )}
            </div>
            <p className="text-amber-800 leading-relaxed text-[11px]">
              {cadBusyState.message || `检测到 CAD 当前正在被操作（${cadBusyState.reason || '绘图/命令进行中'}）。无需强制取消，一旦您在 CAD 中完成当前操作或按 Esc 退出，代码将立即自动发送并执行！`}
            </p>
          </div>
        </div>
      )}

      {/* Output log box */}
      {!isCollapsed && cadOutput && (
        <div className="px-4 py-3 bg-gray-900 text-gray-100 border-t border-gray-800 text-xs break-words font-mono">
          <strong className="block mb-1 text-emerald-400">
            {activeModule === 'OFFICE' ? 'Office/WPS 运行输出:' : 'AutoCAD 运行输出:'}
          </strong>
          <pre className="whitespace-pre-wrap text-emerald-300 font-mono">{cadOutput}</pre>
        </div>
      )}

      {/* Error alert box */}
      {!isCollapsed && sendStatus === 'error' && (
        <div className="px-4 py-3 bg-red-50 border-t border-red-200 text-red-800 text-xs break-words">
          <strong className="block mb-1 text-red-700 font-semibold">
            {activeModule === 'OFFICE' ? '⚠️ 发送失败 / Office 错误:' : '⚠️ 发送失败 / AutoCAD 错误:'}
          </strong>
          <span className="font-mono text-red-600">
            {errorMsg?.includes('-2146827284') || errorMsg?.includes('发生意外') || errorMsg?.includes('0x800a03ec')
              ? 'COM 自动化被 Office 拦截：需要开启「信任对 VBA 工程对象模型的访问」或退出单元格编辑状态。'
              : errorMsg}
          </span>
          <div className="mt-2 pt-2 border-t border-red-200/80 text-red-700 text-[11px]">
            <strong>排查与解决方法：</strong>
            <ul className="list-disc pl-4 mt-1 space-y-1.5">
              {activeModule === 'OFFICE' ? (
                <>
                  <li className="font-medium text-red-900">
                    <strong>1. 启用 VBA 信任访问（关键）：</strong>在 Excel / Word / PPT 中依次点击：
                    <div className="mt-0.5 ml-1 p-1.5 bg-white border border-red-200 rounded font-mono text-[11px] text-gray-800">
                      【文件】 → 【选项】 → 【信任中心】 → 【信任中心设置】 → 【宏设置】 → 勾选<strong>「信任对 VBA 工程对象模型的访问」</strong>并确定。
                    </div>
                  </li>
                  <li><strong>2. 退出单元格编辑模式：</strong>请检查 Excel 是否正处于单元格输入/双击状态（光标闪烁），在 Excel 中按一次 <strong>Esc</strong> 键即可。</li>
                  <li><strong>3. 确认存在活动工作簿：</strong>请确保 Excel 中已打开至少一个工作表或新建了空白工作簿。</li>
                  <li><strong>4. 若仅需单元格公式：</strong>请直接点击上方绿色的<strong>【复制公式】</strong>按钮粘贴至表格，无需点击运行宏。</li>
                </>
              ) : (
                <>
                  <li>请确认 AutoCAD 或兼容 CAD 软件正在运行，且已加载当前图纸</li>
                  <li>AutoCAD 当前是否正处于某个命令执行中（可在 CAD 中按 <strong>Esc</strong> 键退出）</li>
                  <li>检查本机 CAD 插件服务或通信端口连接是否正常</li>
                </>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export function MarkdownRenderer({ 
  content, 
  onSendToCad, 
  onSendToOffice, 
  activeModule = 'CAD', 
  onBookmark,
  onQuickPrompt,
  isGenerating = false,
  cadBusyState,
}: { 
  content: string, 
  onSendToCad?: (code: string) => Promise<boolean | string>, 
  onSendToOffice?: (code: string) => Promise<boolean | string>, 
  activeModule?: 'CAD' | 'OFFICE', 
  onBookmark?: (code: string, language: string) => void,
  onQuickPrompt?: (prompt: string) => void,
  isGenerating?: boolean,
  cadBusyState?: CadBusyState | null,
}) {
  const callbacksRef = React.useRef({ onSendToCad, onSendToOffice, onBookmark, onQuickPrompt });
  callbacksRef.current = { onSendToCad, onSendToOffice, onBookmark, onQuickPrompt };

  // Clean think blocks if any existed in raw string
  let sanitizedMarkdown = content || '';
  if (sanitizedMarkdown.includes('<think>')) {
    sanitizedMarkdown = sanitizedMarkdown.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
  }

  // Auto-close unclosed code fences while streaming to ensure code stays inside code box
  const backtickMatches = sanitizedMarkdown.match(/```/g);
  const backtickCount = backtickMatches ? backtickMatches.length : 0;
  if (backtickCount % 2 !== 0) {
    sanitizedMarkdown += '\n```\n';
  }

  const components = React.useMemo(() => ({
    pre: ({ children }: any) => <>{children}</>,
    code: (props: any) => (
      <CodeBlock 
        {...props} 
        onSendToCad={(code: string) => callbacksRef.current.onSendToCad?.(code)} 
        onSendToOffice={(code: string) => callbacksRef.current.onSendToOffice?.(code)} 
        activeModule={activeModule}
        onBookmark={(code: string, lang: string) => callbacksRef.current.onBookmark?.(code, lang)} 
        cadBusyState={cadBusyState}
      />
    ),
    p: ({ children }: any) => <p className="mb-3.5 last:mb-0 text-gray-800 leading-relaxed text-sm lg:text-[15px] break-words">{children}</p>,
    ul: ({ children }: any) => <ul className="list-disc pl-5 mb-3 text-gray-800 text-sm lg:text-[15px] space-y-1">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-3 text-gray-800 text-sm lg:text-[15px] space-y-1">{children}</ol>,
    li: ({ children }: any) => <li className="mb-1">{children}</li>,
    h1: ({ children }: any) => <h1 className="text-xl font-bold text-gray-900 mt-5 mb-3">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-lg font-bold text-gray-900 mt-4 mb-2.5">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-base font-bold text-gray-900 mt-3.5 mb-2">{children}</h3>,
    blockquote: ({ children }: any) => <blockquote className="border-l-4 border-blue-400 pl-3 py-1 my-3 bg-blue-50/50 text-gray-700 italic text-sm rounded-r">{children}</blockquote>,
  }), [activeModule]);

  return (
    <div className="w-full">
      {sanitizedMarkdown ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={components}
        >
          {sanitizedMarkdown}
        </ReactMarkdown>
      ) : isGenerating ? (
        <div className="text-xs text-gray-500 italic py-2 flex items-center gap-1.5">
          <Loader2 size={13} className="animate-spin text-blue-600" />
          <span>AI 正在生成代码与回复...</span>
        </div>
      ) : (
        <div className="text-xs text-gray-400 italic py-1 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
          <span>(已停止生成，未产生内容)</span>
        </div>
      )}
    </div>
  );
}


