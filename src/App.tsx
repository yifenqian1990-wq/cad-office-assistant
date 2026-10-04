import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Settings, Send, TerminalSquare, AlertCircle, Loader2, 
  Link as LinkIcon, Link2Off, Edit3, Copy, Trash2, 
  RefreshCw, Bookmark, X, MessageSquarePlus, Crosshair, 
  Zap, BrainCircuit, Book, CheckCircle2, Code2, Settings2, Play, Images, Sigma, Sparkles, Square
} from 'lucide-react';
import { useSettings } from './hooks/useSettings';
import { useDrawingLibrary } from './hooks/useDrawingLibrary';
import { useAutoCadSync } from './hooks/useAutoCadSync';
import { useOfficeSync } from './hooks/useOfficeSync';
import { SettingsModal } from './components/SettingsModal';
import { LocalAgentGuide } from './components/LocalAgentGuide';
import { BookmarksModal } from './components/BookmarksModal';
import { DrawingLibraryModal } from './components/DrawingLibraryModal';
import { SaveBookmarkModal } from './components/SaveBookmarkModal';
import { generateResponse, ChatMessage } from './services/ai';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { useBookmarks, Bookmark as BookmarkType } from './hooks/useBookmarks';
import { useChatHistory, ChatSession } from './hooks/useChatHistory';
import { useSkillLibrary } from './hooks/useSkillLibrary';
import { ChatSidebar } from './components/ChatSidebar';
import { ArchiveModal } from './components/ArchiveModal';
import { SkillLibraryModal } from './components/SkillLibraryModal';
import { OnboardingTour } from './components/OnboardingTour';
import { FeatureGuideModal } from './components/FeatureGuideModal';
import { InteractionMode } from './services/ai';

const CADAILogo = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 10a4 4 0 0 0 0 8 M16 10a4 4 0 0 1 0 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="12" cy="14" r="1.5" fill="currentColor" />
  </svg>
);

export default function App() {
  const { settings, updateSettings } = useSettings();
  const autoCad = useAutoCadSync();
  const { isConnected, sendCode, documents, selectedDocument, setSelectedDocument, cadInstances, selectedPid, setSelectedPid, refreshDocuments, isReceivingData, receiveProgress, cancelSelection, cadBusyState } = autoCad;
  const office = useOfficeSync();
  const [activeModule, setActiveModule] = useState<'CAD' | 'OFFICE'>('CAD');
  const bookmarksState = useBookmarks(activeModule);
  
  const chatHistory = useChatHistory(activeModule);
  const skillLibrary = useSkillLibrary();
  const { syncWithFile } = useDrawingLibrary();

  useEffect(() => {
    if (isConnected) {
      syncWithFile();
    }
  }, [isConnected]);

  const { 
    sessions, currentSessionId, currentSession, setCurrentSessionId, 
    createSession, updateSession, updateSessionMessages, updateCurrentSessionMessages, 
    deleteSession, togglePin, toggleArchive, reorderSessions
  } = chatHistory;

  // Synchronize currentSessionId and activeModule
  useEffect(() => {
    if (chatHistory.isLoaded && currentSession) {
      const sessionModule = currentSession.module || 'CAD';
      if (sessionModule !== activeModule) {
        setActiveModule(sessionModule);
      }
    }
  }, [currentSessionId, currentSession, chatHistory.isLoaded]);

  const handleSwitchModule = (module: 'CAD' | 'OFFICE') => {
    setActiveModule(module);
    
    // Find the most recent active session for this module
    const activeModuleSessions = sessions.filter(s => !s.isArchived && (s.module || 'CAD') === module);
    if (activeModuleSessions.length > 0) {
      // Sort to find the top active session (pinned, order, updatedAt)
      const sorted = [...activeModuleSessions].sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        if (a.order !== b.order && a.order !== undefined && b.order !== undefined) return a.order - b.order;
        return b.updatedAt - a.updatedAt;
      });
      setCurrentSessionId(sorted[0].id);
    } else {
      // Create a new session for this module
      createSession(module);
    }
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isSkillLibraryOpen, setIsSkillLibraryOpen] = useState(false);
  const [skillAddLogic, setSkillAddLogic] = useState<string | null>(null);
  const [skillAddParams, setSkillAddParams] = useState<object[] | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [isFeatureGuideOpen, setIsFeatureGuideOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAgentGuideOpen, setIsAgentGuideOpen] = useState(false);
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [saveBookmarkData, setSaveBookmarkData] = useState<{isOpen: boolean, code: string, language: string, history?: {role:string, content:string}[]}>({ isOpen: false, code: '', language: '', history: [] });
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<{name: string, code: string, language: string}[]>([]);
  const [imageAttachments, setImageAttachments] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [autoExecute, setAutoExecute] = useState(true);
  const [isReadingSelection, setIsReadingSelection] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const activeSessionIdRef = useRef<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Sync helper: updates state, ref, and persists to current session in history
  const syncMessages = useCallback((newMessages: ChatMessage[]) => {
    setMessages(newMessages);
    messagesRef.current = newMessages;
    if (currentSessionId) {
      updateSessionMessages(currentSessionId, newMessages);
    }
  }, [currentSessionId, updateSessionMessages]);

  // Load messages ONLY when switching to a different session or on initial session load
  useEffect(() => {
    if (!currentSession) return;

    // Only switch/load if the current session ID differs from what is currently loaded
    if (currentSession.id !== activeSessionIdRef.current) {
      // Flush previous session if it existed and had messages
      if (activeSessionIdRef.current && messagesRef.current.length > 0) {
        updateSessionMessages(activeSessionIdRef.current, messagesRef.current);
      }

      activeSessionIdRef.current = currentSession.id;
      const cleaned = (currentSession.messages || []).filter(
        m => m.role !== 'assistant' || (m.content && m.content.trim().length > 0)
      );
      setMessages(cleaned);
      messagesRef.current = cleaned;
    }
  }, [currentSession?.id, currentSession, updateSessionMessages]);

  // Close sidebar on mobile when session is selected
  const handleSessionSelect = (id: string) => {
    if (currentSessionId && messagesRef.current.length > 0) {
      updateSessionMessages(currentSessionId, messagesRef.current);
    }
    setCurrentSessionId(id);
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleNewSession = () => {
    if (currentSessionId && messagesRef.current.length > 0) {
      updateSessionMessages(currentSessionId, messagesRef.current);
    }
    createSession(activeModule);
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };


  const handleReadSelection = async () => {
    try {
      setIsReadingSelection(true);
      setError(null);
      
      if (activeModule === 'OFFICE') {
        const payload = await office.getSelection();
        if (!payload || !payload.data) {
          alert('获取Office数据为空，请确保已打开对应的Office/WPS应用并存有数据。');
          return;
        }
        
        let attachmentName = '';
        let contentStr = '';
        
        if (payload.data.type === 'Excel') {
          attachmentName = `Excel单元格数据 - ${payload.workbook || '活动工作簿'} - ${payload.worksheet || '活动工作表'}`;
          contentStr = JSON.stringify(payload.data, null, 2);
        } else if (payload.data.type === 'Word') {
          const modeStr = payload.data.mode ? ` (${payload.data.mode})` : '';
          const statsInfo = payload.data.stats 
            ? `\n\n--- 文档信息 ---\n段落数: ${payload.data.stats.paragraphs || 0}, 词/字数: ${payload.data.stats.words || 0}, 表格数: ${payload.data.stats.tables || 0}` 
            : '';
          const tablesInfo = (payload.data.tables && payload.data.tables.length > 0)
            ? `\n\n--- 提取表格数据预览 ---\n${JSON.stringify(payload.data.tables, null, 2)}`
            : '';
          attachmentName = `Word文档数据 - ${payload.document || '活动文档'}${modeStr}`;
          contentStr = (payload.data.text || '') + statsInfo + tablesInfo;
        } else if (payload.data.type === 'PowerPoint') {
          attachmentName = `PPT幻灯片文本 - ${payload.document || '活动演示文稿'}`;
          contentStr = JSON.stringify(payload.data, null, 2);
        } else {
          attachmentName = `Office数据 - ${payload.app}`;
          contentStr = JSON.stringify(payload.data, null, 2);
        }
        
        setAttachments(prev => [...prev, {
          name: attachmentName,
          code: contentStr,
          language: payload.data.type === 'Word' ? 'text' : 'json'
        }]);
      } else {
        const objects = await autoCad.getSelection();
        if (!objects || objects.length === 0) {
          alert('未检测到选中的对象 (请确保在CAD中先选中对象后再点击读取)');
          return;
        }
        
        const jsonStr = JSON.stringify(objects, null, 2);
        const docName = selectedDocument || '当前图纸';
        setAttachments(prev => [...prev, {
          name: `CAD选中对象 - ${docName} (${objects.length}个)`,
          code: jsonStr,
          language: 'json'
        }]);
      }
    } catch (err: any) {
      setError(err.message || '读取失败');
    } finally {
      setIsReadingSelection(false);
    }
  };

  useEffect(() => {
    // Only scroll to bottom if user hasn't manually scrolled up
    if (!userScrolled) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isGenerating, userScrolled]);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);

    setMessages((prev) => {
      // Find the last assistant message
      const lastIndex = [...prev].reverse().findIndex(m => m.role === 'assistant');
      if (lastIndex === -1) return prev;
      const actualIndex = prev.length - 1 - lastIndex;
      const lastMsg = prev[actualIndex];

      // If the message is completely empty or just whitespace, remove it immediately
      if (!lastMsg.content || !lastMsg.content.trim()) {
        return prev.filter((_, i) => i !== actualIndex);
      }

      // If it had partial content, mark it as stopped
      if (!lastMsg.content.includes('已停止生成')) {
        return prev.map((m, i) => i === actualIndex ? {
          ...m,
          content: m.content.trimEnd() + '\n\n*(已停止生成)*'
        } : m);
      }

      return prev;
    });
  };

  const runAI = async (currentMessages: ChatMessage[], retryCount = 0) => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsGenerating(true);
    const assistantMessageId = crypto.randomUUID();
    
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      },
    ]);

    try {
      const isModuleConnected = activeModule === 'OFFICE' ? office.isConnected : isConnected;
      const executeCodeFunc = activeModule === 'OFFICE' ? office.sendCode : sendCode;

      const res = await generateResponse(
        currentMessages,
        settings,
        (chunk) => {
          if (abortController.signal.aborted) return;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + chunk }
                : msg
            )
          );
        },
        (isModuleConnected && autoExecute) ? executeCodeFunc : undefined,
        settings.interactionMode,
        activeModule,
        abortController.signal
      );

      if (abortController.signal.aborted) {
        return;
      }

      if (res && res.cadOutput) {
        setMessages((prev) => {
          const next = prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, cadOutput: res.cadOutput }
              : msg
          );
          messagesRef.current = next;
          if (currentSessionId) {
            updateSessionMessages(currentSessionId, next);
          }
          return next;
        });
      }

      if (res && res.nextPrompt && retryCount < 3 && !abortController.signal.aborted) {
        const nextUserMessageId = crypto.randomUUID();
        const autoUserMsg: ChatMessage = {
          id: nextUserMessageId,
          role: 'user',
          content: res.nextPrompt,
          rawContent: res.nextPrompt, // Only the clean text for User view
          timestamp: Date.now(),
        };
        
        setMessages((prev) => {
          const next = [...prev, autoUserMsg];
          messagesRef.current = next;
          if (currentSessionId) {
            updateSessionMessages(currentSessionId, next);
          }
          return next;
        });
        
        // Let state update and brief pause
        await new Promise(r => setTimeout(r, 1000));
        if (abortController.signal.aborted) return;
        
        // Pass updated messages to the next iteration
        let latestAssistantContent = '';
        setMessages((prev) => {
          const astMsg = prev.find(m => m.id === assistantMessageId);
          if (astMsg) latestAssistantContent = astMsg.content;
          return prev;
        });

        const newMessages = [
          ...currentMessages,
          { id: assistantMessageId, role: 'assistant', content: latestAssistantContent, timestamp: Date.now() },
          autoUserMsg
        ] as ChatMessage[];
        
        // Continue generation
        await runAI(newMessages, retryCount + 1);
      }
    } catch (err: any) {
      if (abortController.signal.aborted || err?.name === 'AbortError' || err?.message?.includes('aborted') || err?.message?.includes('The user aborted a request')) {
        console.log('AI generation stopped by user.');
        setMessages((prev) => {
          const target = prev.find(m => m.id === assistantMessageId);
          let next = prev;
          if (target && (!target.content || !target.content.trim())) {
            next = prev.filter(m => m.id !== assistantMessageId);
          } else if (target && !target.content.includes('已停止生成')) {
            next = prev.map(m => m.id === assistantMessageId ? {
              ...m,
              content: m.content.trimEnd() + '\n\n*(已停止生成)*'
            } : m);
          }
          messagesRef.current = next;
          if (currentSessionId) {
            updateSessionMessages(currentSessionId, next);
          }
          return next;
        });
      } else {
        setError(err.message || 'An error occurred.');
        setMessages((prev) => {
          const target = prev.find(m => m.id === assistantMessageId);
          let next = prev;
          if (target && (!target.content || !target.content.trim())) {
            next = prev.filter(m => m.id !== assistantMessageId);
          }
          messagesRef.current = next;
          if (currentSessionId) {
            updateSessionMessages(currentSessionId, next);
          }
          return next;
        });
      }
    } finally {
      if (retryCount === 0) {
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
      // Guaranteed safety cleanup: remove assistant message if it has empty content and persist
      setMessages((prev) => {
        const cleaned = prev.filter(m => m.role !== 'assistant' || (m.content && m.content.trim().length > 0));
        messagesRef.current = cleaned;
        if (currentSessionId && retryCount === 0) {
          updateSessionMessages(currentSessionId, cleaned);
        }
        return cleaned;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0 && imageAttachments.length === 0) || isGenerating) return;

    setUserScrolled(false);
    const rawInput = input.trim();
    let finalInput = rawInput;
    if (attachments.length > 0) {
      const attachmentsText = attachments.map(a => `[附件代码: ${a.name}]\n\`\`\`${a.language}\n${a.code}\n\`\`\``).join('\n\n');
      finalInput = finalInput ? `${finalInput}\n\n${attachmentsText}` : attachmentsText;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: finalInput, // Keep finalInput for AI to read
      rawContent: rawInput, // For editing
      timestamp: Date.now(),
      attachments: attachments,
      images: imageAttachments.length > 0 ? imageAttachments : undefined,
    };

    const nextMessages = [...messages, userMessage];
    syncMessages(nextMessages);
    setInput('');
    setAttachments([]);
    setImageAttachments([]);
    setError(null);
    
    await runAI(nextMessages);
  };

  const handleGenerateFormula = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0 && imageAttachments.length === 0) || isGenerating) return;

    setUserScrolled(false);
    const rawInput = input.trim();
    let finalInput = `【公式生成请求】请直接提供满足以下要求的 Excel/Office/WPS 单元格公式（例如 VLOOKUP, INDEX, MATCH, XLOOKUP, IF 等），不要生成任何 VBA 宏或 VB 代码。请给出公式的详细解释、各个参数的说明以及在表格中的具体使用步骤。\n\n需求描述：\n${rawInput}`;
    
    if (attachments.length > 0) {
      const attachmentsText = attachments.map(a => `[附件代码: ${a.name}]\n\`\`\`${a.language}\n${a.code}\n\`\`\``).join('\n\n');
      finalInput = `${finalInput}\n\n${attachmentsText}`;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: finalInput,
      rawContent: rawInput,
      timestamp: Date.now(),
      attachments: attachments,
      images: imageAttachments.length > 0 ? imageAttachments : undefined,
    };

    const nextMessages = [...messages, userMessage];
    syncMessages(nextMessages);
    setInput('');
    setAttachments([]);
    setImageAttachments([]);
    setError(null);
    
    await runAI(nextMessages);
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isGenerating) return;
    setUserScrolled(false);
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      rawContent: text.trim(),
      timestamp: Date.now(),
    };
    const nextMessages = [...messages, userMessage];
    syncMessages(nextMessages);
    setError(null);
    await runAI(nextMessages);
  };

  const handleEditMessage = (id: string, content: string) => {
    const index = messagesRef.current.findIndex(m => m.id === id);
    if (index !== -1) {
      const msg = messagesRef.current[index];
      const newMessages = messagesRef.current.slice(0, index);
      syncMessages(newMessages);
      setInput(msg.rawContent !== undefined ? msg.rawContent : content);
      if (msg.attachments) {
        setAttachments(msg.attachments);
      }
      if (msg.images) {
        setImageAttachments(msg.images);
      }
    }
  };

  const handleDeleteMessage = (id: string) => {
    const updated = messagesRef.current.filter(m => m.id !== id);
    syncMessages(updated);
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleRegenerateMessage = async (id: string) => {
    if (isGenerating) return;
    const index = messages.findIndex(m => m.id === id);
    if (index !== -1) {
      setUserScrolled(false);
      const history = messages.slice(0, index);
      syncMessages(history);
      setError(null);
      await runAI(history);
    }
  };

  const filteredSessions = useMemo(() => {
    const unique: ChatSession[] = [];
    const seenIds = new Set<string>();
    for (const s of sessions) {
      if (s && s.id && !seenIds.has(s.id)) {
        seenIds.add(s.id);
        unique.push(s);
      }
    }
    return unique.filter(s => {
      const sessionModule = s.module || 'CAD';
      return sessionModule === activeModule;
    });
  }, [sessions, activeModule]);

  const moduleRecentBookmarks = useMemo(() => {
    const unique: BookmarkType[] = [];
    const seenIds = new Set<string>();
    for (const b of bookmarksState.bookmarks) {
      if (b && b.id && !seenIds.has(b.id)) {
        seenIds.add(b.id);
        unique.push(b);
      }
    }

    const used = [...unique]
      .filter(b => b.lastUsed)
      .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    
    if (used.length > 0) {
      return used.slice(0, 10);
    }
    // Fallback: If no bookmarks have been marked as used yet, show the 10 most recently created/added bookmarks
    return [...unique]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 10);
  }, [bookmarksState.bookmarks]);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden">
      <ChatSidebar 
        sessions={filteredSessions}
        currentSessionId={currentSessionId}
        onSelect={handleSessionSelect}
        onNew={handleNewSession}
        onUpdate={updateSession}
        onDelete={deleteSession}
        onTogglePin={togglePin}
        onToggleArchive={toggleArchive}
        onReorder={reorderSessions}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        onOpenArchived={() => setIsArchiveOpen(true)}
        onRunTour={() => setShowTour(true)}
        onOpenToolbox={() => setIsFeatureGuideOpen(true)}
        activeModule={activeModule}
        onSwitchModule={handleSwitchModule}
      />

      <div className={`flex flex-col bg-gray-50 text-gray-900 font-sans flex-1 min-w-0 h-full relative transition-all duration-300 ${isSidebarOpen && window.innerWidth >= 768 ? 'md:ml-0' : ''}`}>
        {/* Header */}
        <header className="flex-none h-[64px] sm:h-[72px] border-b border-gray-200 bg-white px-2 sm:px-6 flex items-center justify-between shadow-sm z-50 relative">
          <div className="flex items-center gap-3">
            {isSidebarOpen && window.innerWidth >= 768 ? null : (
              <div className="md:hidden w-10"></div>
            )}
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${
              activeModule === 'OFFICE'
                ? 'bg-emerald-600/10 text-emerald-600 border-emerald-500/20'
                : 'bg-blue-600/10 text-blue-500 border-blue-500/20'
            } ${!isSidebarOpen || window.innerWidth < 768 ? 'ml-8' : ''}`}>
              <CADAILogo className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-gray-900">
                {activeModule === 'OFFICE' ? 'OfficeAI 助手' : 'CADAI 助手'}
              </h1>
              <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">
                {activeModule === 'OFFICE' ? 'VBA / MACRO 代码生成器' : 'AutoLISP 代码生成器'}
              </p>
            </div>

            {/* Header Mode Switcher (Desktop only) */}
            <div className="hidden lg:flex bg-gray-100 p-1 rounded-lg border border-gray-200 ml-4 animate-fade-in">
              <button
                onClick={() => handleSwitchModule('CAD')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeModule === 'CAD'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                }`}
              >
                AutoCAD 助手
              </button>
              <button
                onClick={() => handleSwitchModule('OFFICE')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeModule === 'OFFICE'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                }`}
              >
                Office/WPS 助手
              </button>
            </div>
          </div>
        <div className="flex items-center gap-3">
          {activeModule === 'OFFICE' && office.isConnected && (
            <div className="hidden sm:flex items-center gap-2 mr-2 bg-emerald-50/50 px-2 py-1 rounded-lg border border-emerald-500/10">
              <div className="flex flex-col gap-1">
                {/* 目标应用 */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-gray-500 font-medium whitespace-nowrap w-10">目标:</span>
                  <select
                    value={office.selectedApp || 'Excel'}
                    onChange={(e) => office.setSelectedApp(e.target.value)}
                    title="选择 Office/WPS 目标应用"
                    className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-[110px] truncate"
                  >
                    {office.runningApps.length > 0 ? (
                      office.runningApps.map(app => (
                        <option key={app.name} value={app.name}>{app.name}</option>
                      ))
                    ) : (
                      <>
                        <option value="Excel">Excel</option>
                        <option value="Word">Word</option>
                        <option value="PowerPoint">PowerPoint</option>
                        <option value="WPS Excel">WPS 表格</option>
                        <option value="WPS Word">WPS 文字</option>
                        <option value="WPS PPT">WPS 演示</option>
                      </>
                    )}
                  </select>
                  <button
                    onClick={office.refreshApps}
                    title="刷新运行中的应用"
                    className="p-0.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-100 rounded transition-colors"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>

                {/* 工作簿 / 文档 (放在 目标 下方) */}
                <div className="flex items-center gap-1">
                  {(office.selectedApp === 'Excel' || office.selectedApp === 'WPS Excel') ? (
                    <>
                      <span className="text-[11px] text-gray-500 font-medium whitespace-nowrap w-10">工作簿:</span>
                      <select
                        value={office.selectedWorkbook || ''}
                        onChange={(e) => office.setSelectedWorkbook(e.target.value || null)}
                        title="选择工作簿"
                        className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-[100px] truncate"
                      >
                        {(office.runningApps.find(app => app.name === office.selectedApp)?.workbooks || []).map(wb => (
                          <option key={wb.name} value={wb.name}>{wb.name}</option>
                        ))}
                      </select>

                      {office.selectedWorkbook && (
                        <>
                          <span className="text-[11px] text-gray-500 font-medium whitespace-nowrap ml-1">表:</span>
                          <select
                            value={office.selectedWorksheet || ''}
                            onChange={(e) => office.setSelectedWorksheet(e.target.value || null)}
                            title="选择工作表"
                            className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-[85px] truncate"
                          >
                            {((office.runningApps.find(app => app.name === office.selectedApp)?.workbooks || [])
                              .find(w => w.name === office.selectedWorkbook)?.sheets || []).map(sheet => (
                              <option key={sheet} value={sheet}>{sheet}</option>
                            ))}
                          </select>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] text-gray-500 font-medium whitespace-nowrap w-10">文档:</span>
                      <select
                        value={office.selectedDocument || ''}
                        onChange={(e) => office.setSelectedDocument(e.target.value || null)}
                        title="选择文档"
                        className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-[140px] truncate"
                      >
                        {(office.runningApps.find(app => app.name === office.selectedApp)?.documents || []).map(doc => (
                          <option key={doc} value={doc}>{doc}</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeModule === 'CAD' && isConnected && (cadInstances?.length > 0 || documents.length > 0) && (
            <div className="hidden sm:flex items-center gap-2 mr-2 bg-blue-50/50 px-2 py-1 rounded-lg border border-blue-500/10">
              <div className="flex flex-col gap-1">
                {/* 进程 PID */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-gray-500 font-medium whitespace-nowrap w-7">PID:</span>
                  {cadInstances && cadInstances.length > 0 ? (
                    <select
                      value={selectedPid || ''}
                      onChange={(e) => {
                        const pid = parseInt(e.target.value, 10);
                        setSelectedPid(pid);
                        const currentApp = cadInstances.find(a => a.pid === pid);
                        if (currentApp) {
                          setSelectedDocument(currentApp.active_doc || (currentApp.docs.length > 0 ? currentApp.docs[0] : null));
                        }
                      }}
                      title="选择 AutoCAD 进程"
                      className={`border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 w-[130px] truncate ${
                        cadInstances.find(a => a.pid === selectedPid)?.connected === false 
                          ? 'bg-red-50 border-red-200 text-red-700 focus:ring-red-500' 
                          : 'bg-white border-gray-200 text-gray-700 focus:ring-blue-500'
                      }`}
                    >
                      {cadInstances.map(app => (
                        <option key={app.pid} value={app.pid}>
                          PID: {app.pid} {app.is_top ? '(当前激活)' : ''} {!app.connected ? '(未连接)' : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-gray-400">无进程</span>
                  )}
                  <button
                    onClick={refreshDocuments}
                    title="刷新图纸列表"
                    className="p-0.5 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded transition-colors"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>

                {/* 连接的图纸名称 (放在 PID 下方) */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-gray-500 font-medium whitespace-nowrap w-7">图纸:</span>
                  {cadInstances && cadInstances.find(a => a.pid === selectedPid)?.connected === false ? (
                    <span className="text-[10px] text-red-500 whitespace-nowrap bg-red-100 px-1 py-0.5 rounded">
                      ⚠️ 请在CAD中保存任意图纸
                    </span>
                  ) : (
                    <select
                      value={selectedDocument || ''}
                      onChange={(e) => setSelectedDocument(e.target.value)}
                      title="选择目标图纸"
                      className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 w-[130px] truncate"
                    >
                      {documents.map(doc => (
                        <option key={doc} value={doc}>{doc}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>
          )}
          <button
            onClick={() => {
              handleNewSession();
              setAttachments([]);
              setError(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all border ${
              activeModule === 'OFFICE'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100'
                : 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100'
            }`}
          >
            <MessageSquarePlus size={14} />
            <span className="hidden sm:inline">新会话</span>
          </button>
          {activeModule === 'CAD' && (
            <>
              <button
                onClick={() => setIsSkillLibraryOpen(true)}
                title="查看我的技能书"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all border bg-purple-50 border-purple-200 text-purple-600 hover:bg-purple-100"
              >
                <Book size={14} />
                <span className="hidden lg:inline">技能书</span>
              </button>
              <div className="h-8 w-px bg-gray-200 mx-1 hidden sm:block" />
              <button
                onClick={() => updateSettings({ 
                  interactionMode: settings.interactionMode === 'CODE' ? 'SKILL' : 'CODE' 
                })}
                title={settings.interactionMode === 'SKILL' ? "切换到代码模式 (快速生成)" : "切换到技能模式 (带教/分步)"}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all border ${
                  settings.interactionMode === 'SKILL'
                    ? 'bg-purple-600 text-white border-purple-700 shadow-sm'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
              >
                <BrainCircuit size={14} />
                <span>{settings.interactionMode === 'SKILL' ? '技能模式' : '代码模式'}</span>
              </button>
            </>
          )}
          <button
            onClick={() => setIsBookmarksOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all border ${
              activeModule === 'OFFICE'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100'
                : 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100'
            }`}
          >
            <Bookmark size={14} />
            <span className="hidden sm:inline">代码收藏</span>
          </button>
          {activeModule === 'CAD' && (
            <button
              onClick={() => setIsLibraryOpen(true)}
              title="CAD 图块收藏管理"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all border bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100"
            >
              <Images size={14} />
              <span className="hidden lg:inline">图库管理</span>
            </button>
          )}
          {activeModule === 'CAD' && isConnected && cadBusyState?.isWaiting && (
            <div 
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-800 border border-amber-300 shadow-sm animate-pulse"
              title={`CAD 正在被使用（${cadBusyState.reason || '绘图/命令交互中'}），操作结束后将自动发送运行`}
            >
              <Loader2 size={13} className="animate-spin text-amber-600 flex-shrink-0" />
              <span>CAD繁忙挂起中 ({cadBusyState.elapsed || 0}s)</span>
            </div>
          )}
          <button
            id="agent-guide-btn"
            onClick={() => setIsAgentGuideOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all border ${
              activeModule === 'OFFICE'
                ? (office.isConnected 
                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20' 
                    : 'bg-gray-100 text-gray-600 border-gray-200 hover:text-gray-800')
                : (isConnected 
                    ? 'bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20' 
                    : 'bg-gray-100 text-gray-600 border-gray-200 hover:text-gray-800')
            }`}
          >
            {activeModule === 'OFFICE'
              ? (office.isConnected ? <LinkIcon size={14} /> : <Link2Off size={14} />)
              : (isConnected ? <LinkIcon size={14} /> : <Link2Off size={14} />)
            }
            <span className="hidden sm:inline">
              {activeModule === 'OFFICE'
                ? (office.isConnected ? '已连接 Office/WPS' : '未连接 Office/WPS')
                : (isConnected ? '已连接 CAD' : '未连接 CAD')
              }
            </span>
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 border border-gray-200 rounded-lg transition-all hover:border-gray-400"
          >
            <Settings size={18} />
            <span className="hidden sm:inline">设置</span>
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main 
        className="flex-1 px-4 py-8 w-full overflow-y-auto"
        onScroll={(e) => {
          const target = e.target as HTMLElement;
          const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 150;
          setUserScrolled(!isAtBottom);
        }}
      >
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 py-6 animate-fade-in">
              <div className="flex flex-col items-center space-y-3 max-w-xl mx-auto">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                  activeModule === 'OFFICE' 
                    ? 'bg-emerald-600/10 text-emerald-600 border border-emerald-500/20 shadow-emerald-500/10' 
                    : 'bg-blue-600/10 text-blue-600 border border-blue-500/20 shadow-blue-500/10'
                }`}>
                  {activeModule === 'OFFICE' ? <Code2 size={28} /> : <TerminalSquare size={28} />}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                  {activeModule === 'OFFICE' ? 'Office / WPS 智能自动化助手' : 'AutoCAD 智能绘图助手'}
                </h2>
                <p className="text-xs sm:text-sm text-gray-500 max-w-lg leading-relaxed">
                  {activeModule === 'OFFICE'
                    ? '支持 Excel 批量处理、公式生成、Word 文档规范排版与 PPT 幻灯片自动化。'
                    : '支持 AutoLISP 几何绘制、多框裁剪拼接、自动编号标注、面积统计与图纸标准化。'
                  }
                </p>
              </div>

              {moduleRecentBookmarks.length > 0 && (
                <div className="flex flex-col items-center w-full max-w-2xl bg-white border border-gray-200/80 p-3.5 rounded-2xl shadow-sm">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">最近使用的代码:</span>
                  <div className="flex flex-wrap justify-center gap-2">
                    {moduleRecentBookmarks.map(b => (
                      <button 
                        key={b.id}
                        onClick={async () => {
                          const connected = activeModule === 'OFFICE' ? office.isConnected : isConnected;
                          const sender = activeModule === 'OFFICE' ? office.sendCode : sendCode;
                          if (!connected) {
                            alert(activeModule === 'OFFICE' ? '请先连接 Office/WPS 本地代理' : '请先连接 AutoCAD');
                            return;
                          }
                          try {
                            await sender(b.code);
                            bookmarksState.markAsUsed(b.id);
                          } catch (err: any) {
                            alert(err.message || '发送失败');
                          }
                        }}
                        className={`text-xs bg-gray-50 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg transition-all shadow-xs flex items-center gap-1.5 ${
                          activeModule === 'OFFICE'
                            ? 'hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'
                            : 'hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300'
                        }`}
                      >
                        <Bookmark size={12} className="text-amber-500" />
                        <span className="font-medium">{b.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            messages.map((msg, index) => {
              const isLastAssistant = msg.role === 'assistant' && msg.id === [...messages].reverse().find(m => m.role === 'assistant')?.id;
              
              // Do not render empty assistant message bubbles if generation is finished or aborted
              if (msg.role === 'assistant' && (!msg.content || !msg.content.trim()) && (!isGenerating || !isLastAssistant)) {
                return null;
              }

              const displayContent = msg.role === 'assistant' && !isLastAssistant && msg.content.includes('\n\n---\n**Auto-execution Feedback:**') 
                  ? msg.content.substring(0, msg.content.indexOf('\n\n---\n**Auto-execution Feedback:**')) 
                  : msg.content;
              
              const isPlan = msg.role === 'assistant' && msg.content.includes('```plan');
              const canSaveAsSkill = msg.role === 'assistant' && msg.content.includes('```lisp') && settings.interactionMode === 'SKILL';

              return (
              <div
                key={`${msg.id}-${index}`}
                className={`flex group ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div className={`relative max-w-[85%] flex flex-col gap-1`}>
                  <div
                    className={`relative ${
                      msg.role === 'user'
                        ? 'bg-blue-600/20 border border-blue-500/30 text-gray-800 ml-12 rounded-2xl rounded-tr-none px-5 py-3.5 shadow-sm'
                        : `bg-white border text-gray-800 mr-12 rounded-2xl rounded-tl-none px-6 py-5 shadow-lg overflow-hidden ${
                            settings.interactionMode === 'SKILL' ? 'border-purple-200' : 'border-gray-200'
                          }`
                    }`}
                  >
                    {msg.role === 'assistant' && settings.interactionMode === 'SKILL' && (
                      <div className="absolute top-0 right-0 px-2 py-0.5 bg-purple-500 text-white text-[10px] font-bold uppercase tracking-tighter">
                        技能模式
                      </div>
                    )}
                    {msg.role === 'user' ? (
                      <div className="flex flex-col gap-2">
                        {msg.images && msg.images.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {msg.images.map((img, i) => (
                              <img key={i} src={img} alt="attachment" className="max-h-48 max-w-full rounded-lg border border-black/10 object-contain shadow-sm bg-white" />
                            ))}
                          </div>
                        )}
                        {msg.rawContent !== undefined ? (
                          <>
                            {msg.rawContent && <div className="whitespace-pre-wrap mb-3">{msg.rawContent}</div>}
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="flex flex-col gap-2 mt-2">
                                {msg.attachments.map((att, i) => (
                                  <details key={i} className="bg-blue-700/20 rounded-md border border-blue-400/30 overflow-hidden text-sm">
                                    <summary className="px-3 py-2 cursor-pointer hover:bg-blue-700/30 font-medium select-none flex items-center gap-2">
                                      <TerminalSquare size={14} className="flex-none" />
                                      <span className="truncate" title={att.name}>附件: {att.name}</span>
                                    </summary>
                                    <div className="p-3 bg-blue-900/50 overflow-x-auto">
                                      <pre className="text-blue-100 text-[13px] font-mono whitespace-pre">{att.code}</pre>
                                    </div>
                                  </details>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="whitespace-pre-wrap">{displayContent}</div>
                        )}
                      </div>
                    ) : (
                      <div className="markdown-body">
                        <MarkdownRenderer 
                          content={displayContent} 
                          activeModule={activeModule}
                          isGenerating={isGenerating && isLastAssistant}
                          cadBusyState={cadBusyState}
                          onSendToCad={async (code) => {
                            try {
                              const res = await sendCode(code);
                              let newOutput = '';
                              if (typeof res === 'string' && res.trim()) {
                                newOutput = `[Manual Execution Output]:\n${res.trim()}\n`;
                              } else {
                                newOutput = `[Manual Execution]: ✅ Executed successfully.\n`;
                              }
                              setMessages(prev => {
                                const next = prev.map(m => m.id === msg.id ? { ...m, cadOutput: (m.cadOutput ? m.cadOutput + '\n' : '') + newOutput.trim() } : m);
                                messagesRef.current = next;
                                if (currentSessionId) {
                                  updateSessionMessages(currentSessionId, next);
                                }
                                return next;
                              });
                              return res;
                            } catch (err: any) {
                              const newOutput = `[Manual Execution Error]:\n${err.message}\n`;
                              setMessages(prev => {
                                const next = prev.map(m => m.id === msg.id ? { ...m, cadOutput: (m.cadOutput ? m.cadOutput + '\n' : '') + newOutput.trim() } : m);
                                messagesRef.current = next;
                                if (currentSessionId) {
                                  updateSessionMessages(currentSessionId, next);
                                }
                                return next;
                              });
                              throw err;
                            }
                          }}
                          onSendToOffice={async (code) => {
                            try {
                              const res = await office.sendCode(code);
                              let newOutput = '';
                              if (typeof res === 'string' && res.trim()) {
                                newOutput = `[Office Execution Output]:\n${res.trim()}\n`;
                              } else {
                                newOutput = `[Office Execution]: ✅ Executed successfully.\n`;
                              }
                              setMessages(prev => {
                                const next = prev.map(m => m.id === msg.id ? { ...m, cadOutput: (m.cadOutput ? m.cadOutput + '\n' : '') + newOutput.trim() } : m);
                                messagesRef.current = next;
                                if (currentSessionId) {
                                  updateSessionMessages(currentSessionId, next);
                                }
                                return next;
                              });
                              return res;
                            } catch (err: any) {
                              const newOutput = `[Office Execution Error]:\n${err.message}\n`;
                              setMessages(prev => {
                                const next = prev.map(m => m.id === msg.id ? { ...m, cadOutput: (m.cadOutput ? m.cadOutput + '\n' : '') + newOutput.trim() } : m);
                                messagesRef.current = next;
                                if (currentSessionId) {
                                  updateSessionMessages(currentSessionId, next);
                                }
                                return next;
                              });
                              throw err;
                            }
                          }}
                          onBookmark={(code, language) => {
                            const index = messages.findIndex(m => m.id === msg.id);
                            const history = messages.slice(0, index + 1).map(m => ({ role: m.role, content: m.content }));
                            setSaveBookmarkData({ isOpen: true, code, language, history });
                          }}
                          onQuickPrompt={(prompt) => handleSendMessage(prompt)}
                        />
                        {isPlan && !isGenerating && (
                          <div className="mt-4 pt-4 border-t border-purple-100 flex gap-2">
                             <button 
                               onClick={() => {
                                 const confirmMsg: ChatMessage = {
                                   id: crypto.randomUUID(),
                                   role: 'user',
                                   content: '方案看起来不错，请执行该计划并生成对应的 AutoCAD 代码。',
                                   timestamp: Date.now()
                                 };
                                 const next = [...messages, confirmMsg];
                                 syncMessages(next);
                                 runAI(next);
                               }}
                               className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 shadow-sm"
                             >
                               <CheckCircle2 size={16} /> 确认并执行计划
                             </button>
                             <button 
                               onClick={() => setInput('计划还需要改进：')}
                               className="px-3 py-1.5 bg-white border border-purple-200 text-purple-600 rounded-lg text-sm font-medium hover:bg-purple-50"
                             >
                               纠偏/修改建议
                             </button>
                          </div>
                        )}
                        {canSaveAsSkill && !isGenerating && (
                           <div className="mt-4 pt-4 border-t border-blue-100 flex items-center justify-between">
                             <button 
                               onClick={() => {
                                 const lispPart = /```lisp\n([\s\S]*?)```/.exec(msg.content)?.[1] || '';
                                 const jsonPart = /```json\n([\s\S]*?)```/.exec(msg.content)?.[1] || '';
                                 let parsedParams = null;
                                 if (jsonPart) {
                                   try {
                                     parsedParams = JSON.parse(jsonPart);
                                   } catch (e) {
                                     console.error('Failed to parse params json');
                                   }
                                 }
                                 setSkillAddLogic(lispPart);
                                 setSkillAddParams(parsedParams);
                                 setIsSkillLibraryOpen(true);
                               }}
                               className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-100"
                             >
                               <Book size={14} /> 保存为新技能
                             </button>
                             
                             {isConnected && (
                               <button 
                                 onClick={async () => {
                                   try {
                                     await autoCad.sendUndo();
                                     alert('已执行 CAD 撤销 (Undo)');
                                   } catch (e: any) {
                                     alert('撤销失败: ' + e.message);
                                   }
                                 } }
                                 className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-red-500 text-xs font-medium"
                               >
                                 <RefreshCw size={14} /> 一键撤销操作
                               </button>
                             )}
                           </div>
                        )}
                        {!displayContent && isGenerating && (
                          <div className="flex items-center justify-between gap-3 text-gray-500 text-sm py-1 bg-gray-50/80 px-3 py-2 rounded-xl border border-gray-100 animate-pulse">
                            <div className="flex items-center gap-2">
                              <Loader2 size={16} className={`animate-spin ${activeModule === 'OFFICE' ? 'text-emerald-500' : 'text-blue-500'}`} />
                              <span className="font-medium text-gray-700">AI 正在思考分析与生成回复...</span>
                            </div>
                            <button
                              type="button"
                              onClick={handleStopGeneration}
                              className="flex items-center gap-1.5 px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-semibold transition-all hover:scale-105 cursor-pointer shadow-sm"
                              title="停止生成 (Stop)"
                            >
                              <Square size={11} className="fill-red-500 text-red-500" />
                              <span>停止</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {msg.cadOutput && (
                    <div className={`mt-1 flex flex-col gap-1 w-full max-w-full ${msg.role === 'user' ? 'mr-12' : 'ml-0'}`}>
                       <details className="bg-gray-800 text-gray-200 rounded-xl border border-gray-700 overflow-hidden text-xs shadow-md animate-in fade-in slide-in-from-top-2">
                         <summary className="px-3 py-2 cursor-pointer hover:bg-gray-700 font-medium select-none flex items-center justify-between group">
                           <div className="flex items-center gap-2 text-gray-300 group-hover:text-white transition-colors">
                             <TerminalSquare size={14} className="flex-none" />
                             <span>{activeModule === 'OFFICE' ? 'Office/WPS 执行日志追踪' : 'CAD 执行日志追踪'}</span>
                           </div>
                           <button 
                             onClick={(e) => {
                               e.preventDefault();
                               setMessages(prev => {
                                 const next = prev.map(m => m.id === msg.id ? { ...m, cadOutput: undefined } : m);
                                 messagesRef.current = next;
                                 if (currentSessionId) {
                                   updateSessionMessages(currentSessionId, next);
                                 }
                                 return next;
                               });
                             }}
                             className="p-1 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
                             title="清除日志 (不再提供给AI上下文)"
                           >
                              <X size={14} />
                           </button>
                         </summary>
                         <div className="p-3 bg-gray-900 overflow-x-auto max-h-64 overflow-y-auto custom-scrollbar">
                           <pre className="text-gray-400 font-mono whitespace-pre-wrap break-words">{msg.cadOutput}</pre>
                         </div>
                       </details>
                    </div>
                  )}

                  {/* Message Actions */}
                  <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity px-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <button
                      onClick={() => handleCopyMessage(displayContent)}
                      className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200/50 rounded-md transition-colors"
                      title="复制"
                    >
                      <Copy size={13} />
                    </button>
                    {msg.role === 'user' && (
                      <button
                        onClick={() => handleEditMessage(msg.id, displayContent)}
                        className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200/50 rounded-md transition-colors"
                        title="编辑"
                      >
                        <Edit3 size={13} />
                      </button>
                    )}
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => handleRegenerateMessage(msg.id)}
                        disabled={isGenerating}
                        className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200/50 rounded-md transition-colors disabled:opacity-50"
                        title="重新生成"
                      >
                        <RefreshCw size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      disabled={isGenerating}
                      className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-200/50 rounded-md transition-colors disabled:opacity-50"
                      title="删除"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
              );
            })
          )}

          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm mx-auto max-w-2xl shadow-sm">
              <AlertCircle size={18} className="flex-none mt-0.5 text-red-500" />
              <div className="flex-1 space-y-1">
                <p className="leading-relaxed font-medium">{error}</p>
                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                  {(error.includes('Office') || error.includes('Word') || error.includes('COM') || error.includes('代理') || error.includes('CAD')) && (
                    <button
                      type="button"
                      onClick={() => setIsAgentGuideOpen(true)}
                      className="font-medium text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                    >
                      打开代理配置 / 下载最新 office_agent.py
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(true)}
                    className="text-gray-500 hover:text-gray-700 underline"
                  >
                    API 配置
                  </button>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="text-gray-400 hover:text-gray-600 ml-auto"
                  >
                    关闭提示
                  </button>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Form */}
      <footer className="flex-none w-full p-4 sm:p-6 bg-white border-t border-gray-200 z-10 relative">
        <form
          onSubmit={handleSubmit}
          className="max-w-4xl mx-auto relative flex flex-col gap-2"
        >
          {isReceivingData && receiveProgress && (
            <div className="w-full bg-blue-50 border border-blue-100 rounded-xl p-3 px-4 text-sm flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 shadow-sm relative pr-10">
              <button 
                type="button" 
                title="取消读取" 
                onClick={cancelSelection}
                className="absolute right-3 top-3 p-1 rounded-md text-blue-500 hover:text-red-500 hover:bg-white/50 transition-colors"
                >
                <X size={16} />
              </button>
              <div className="flex justify-between items-center text-blue-700 font-medium">
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-blue-500" /> 
                  正在读取 AutoCAD 数据 ({receiveProgress.total} 个对象)...
                </span>
                <span className="tabular-nums pr-2">{Math.round((receiveProgress.current / receiveProgress.total) * 100)}%</span>
              </div>
              <div className="w-full bg-blue-200/50 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-blue-500 h-1.5 transition-all duration-300 rounded-full ease-out" 
                  style={{ width: `${Math.max(2, (receiveProgress.current / receiveProgress.total) * 100)}%` }}
                ></div>
              </div>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 w-full animate-in fade-in slide-in-from-bottom-2">
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-200 text-sm shadow-sm transition-all hover:shadow">
                  <Bookmark size={14} className="text-blue-500 flex-none" />
                  <span className="font-medium truncate max-w-[400px] sm:max-w-[600px]">{att.name}</span>
                  <button 
                    type="button"
                    onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                    className="p-0.5 ml-1 hover:bg-blue-200 rounded-md transition-colors text-blue-600 hover:text-blue-800"
                    title="移除附件"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {imageAttachments.length > 0 && (
             <div className="flex flex-wrap gap-2 w-full animate-in fade-in slide-in-from-bottom-2">
               {imageAttachments.map((img, i) => (
                 <div key={i} className="relative group">
                    <img src={img} alt="attachment" className="h-16 w-16 object-cover rounded-lg border border-gray-200 shadow-sm" />
                    <button
                      type="button"
                      onClick={() => setImageAttachments(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1.5 -right-1.5 bg-white rounded-full p-0.5 shadow-md text-gray-500 hover:text-red-500 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X size={14} />
                    </button>
                 </div>
               ))}
             </div>
          )}
          {isGenerating && (
            <div className="flex justify-center -mt-1 mb-1 animate-in fade-in zoom-in-95 duration-200">
              <button
                type="button"
                onClick={handleStopGeneration}
                className="flex items-center gap-2 px-4 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 hover:border-red-300 rounded-full shadow-sm text-xs font-semibold backdrop-blur-sm transition-all hover:scale-105 group cursor-pointer"
                title="停止生成 (Stop)"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <Square size={12} className="fill-red-500 text-red-500 group-hover:scale-110 transition-transform" />
                <span>停止生成</span>
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            {activeModule === 'OFFICE' && (
              <button
                type="button"
                onClick={handleGenerateFormula}
                disabled={(!input.trim() && attachments.length === 0 && imageAttachments.length === 0) || isGenerating}
                className="flex-none h-[52px] px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium rounded-xl flex items-center gap-1.5 transition-all shadow-md disabled:shadow-none text-sm whitespace-nowrap cursor-pointer"
                title="只生成 Excel 满足要求的公式，不生成 VBA"
              >
                <Sigma size={18} />
                <span>生成公式</span>
              </button>
            )}
            <div className="flex-1 relative">
              <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                const text = e.clipboardData.getData('text');
                
                if (activeModule === 'OFFICE') {
                  if (text && (text.includes('Sub ') || text.includes('Function ') || text.includes('End Sub') || text.includes('End Function'))) {
                    const subMatches = text.match(/(?:^|\n)\s*(?:Sub|Function)[\s\S]*?(?=(?:^|\n)\s*(?:Sub|Function)|$)/gi);
                    if (subMatches && subMatches.length > 1) {
                      e.preventDefault();
                      if (window.confirm(`检测到粘贴了 ${subMatches.length} 个 VBA 函数/过程。是否将它们提取为单独的代码附件参与对话？\n\n点击"确定"提取为附件，点击"取消"则作为普通文本输入。`)) {
                        const newAttachments = subMatches.map((code, i) => {
                           const m = code.match(/(?:Sub|Function)\s+([^\s\()]+)/i);
                           const name = m ? m[1] : `函数_${i+1}`;
                           return { name: `${name}.bas`, code: code.trim(), language: 'vba' };
                        });
                        setAttachments(prev => [...prev, ...newAttachments]);
                      } else {
                         const textarea = e.target as HTMLTextAreaElement;
                         const start = textarea.selectionStart;
                         const end = textarea.selectionEnd;
                         setInput(prev => prev.substring(0, start) + text + prev.substring(end));
                         setTimeout(() => {
                           textarea.selectionStart = textarea.selectionEnd = start + text.length;
                         }, 0);
                      }
                      return;
                    }
                  }
                } else {
                  if (text && text.includes('(defun')) {
                    const defunMatches = text.match(/(?:^|\n)\s*\(defun[\s\S]*?(?=(?:^|\n)\s*\(defun|$)/gi);
                    if (defunMatches && defunMatches.length > 1) {
                      e.preventDefault();
                      if (window.confirm(`检测到粘贴了 ${defunMatches.length} 个 LISP 函数。是否将它们提取为单独的代码附件参与对话？\n\n点击"确定"提取为附件，点击"取消"则作为普通文本输入。`)) {
                        const newAttachments = defunMatches.map((code, i) => {
                           const m = code.match(/\(defun\s+(c:[^\s\()]+)/i) || code.match(/\(defun\s+([^\s\()]+)/i);
                           const name = m ? m[1] : `函数_${i+1}`;
                           return { name: `${name}.lsp`, code: code.trim(), language: 'lisp' };
                        });
                        setAttachments(prev => [...prev, ...newAttachments]);
                      } else {
                         const textarea = e.target as HTMLTextAreaElement;
                         const start = textarea.selectionStart;
                         const end = textarea.selectionEnd;
                         setInput(prev => prev.substring(0, start) + text + prev.substring(end));
                         setTimeout(() => {
                           textarea.selectionStart = textarea.selectionEnd = start + text.length;
                         }, 0);
                      }
                      return;
                    }
                  }
                }

                if (!items) return;
                
                let hasImage = false;
                for (const item of Array.from(items)) {
                    if (item.type.indexOf('image') === 0) {
                        hasImage = true;
                        const file = item.getAsFile();
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                                const base64 = event.target?.result as string;
                                setImageAttachments(prev => [...prev, base64]);
                            };
                            reader.readAsDataURL(file);
                        }
                    }
                }
              }}
              placeholder={activeModule === 'OFFICE' ? "描述您的办公自动化需求（支持 Excel/Word/PPT 宏，支持 Ctrl+V 粘贴截图）..." : "描述您的绘图需求（支持 Ctrl+V 粘贴截图）..."}
              className={`w-full bg-gray-100 border border-gray-200 rounded-xl pl-4 pr-12 py-3.5 text-gray-800 focus:outline-none focus:ring-2 focus:border-transparent resize-none overflow-hidden placeholder:text-gray-400 shadow-inner min-h-[52px] max-h-32 transition-all ${
                activeModule === 'OFFICE' ? 'focus:ring-emerald-500/50' : 'focus:ring-blue-500/50'
              }`}
              rows={1}
              style={{ height: 'auto', minHeight: '52px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = target.scrollHeight + 'px';
              }}
             />
            </div>
             <button
              type="button"
              onClick={() => setAutoExecute(!autoExecute)}
              title={autoExecute ? "关闭自动执行" : "点击开启自动执行"}
              className={`flex-none w-[52px] h-[52px] border rounded-xl flex items-center justify-center transition-all shadow-sm ${
                autoExecute 
                  ? (activeModule === 'OFFICE'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-emerald-100'
                      : 'bg-blue-50 border-blue-200 text-blue-600 shadow-blue-100')
                  : 'bg-white border-gray-200 text-gray-400 grayscale'
              }`}
            >
              <Zap size={20} fill={autoExecute ? "currentColor" : "none"} />
            </button>
             <button
              type="button"
              onClick={handleReadSelection}
              disabled={isReadingSelection}
              title={activeModule === 'OFFICE' ? "读取 Office 活动应用中的当前选择或全部数据" : "读取 CAD 当前选中的对象"}
              className={`flex-none w-[52px] h-[52px] bg-white border border-gray-200 disabled:bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center transition-all shadow-sm ${
                activeModule === 'OFFICE' ? 'hover:bg-emerald-50 hover:text-emerald-600' : 'hover:bg-blue-50 hover:text-blue-600'
              }`}
            >
              {isReadingSelection ? <Loader2 size={20} className="animate-spin text-gray-400" /> : <Crosshair size={20} />}
            </button>
             <button
              type="button"
              onClick={() => setIsBookmarksOpen(true)}
              title="代码片段收藏夹"
              className={`flex-none w-[52px] h-[52px] bg-white border border-gray-200 text-gray-600 rounded-xl flex items-center justify-center transition-all shadow-sm ${
                activeModule === 'OFFICE' ? 'hover:bg-emerald-50 hover:text-emerald-600' : 'hover:bg-blue-50 hover:text-blue-600'
              }`}
            >
              <Code2 size={20} />
            </button>
            {isGenerating ? (
              <button
                type="button"
                onClick={handleStopGeneration}
                title="停止生成 (Stop)"
                className="flex-none w-[52px] h-[52px] bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-xl flex items-center justify-center transition-all shadow-md shadow-red-500/20 hover:scale-105 cursor-pointer group"
              >
                <Square size={20} className="fill-white group-hover:scale-90 transition-transform" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() && attachments.length === 0 && imageAttachments.length === 0}
                className={`flex-none w-[52px] h-[52px] disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl flex items-center justify-center transition-all shadow-md disabled:shadow-none ${
                  activeModule === 'OFFICE'
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'
                    : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'
                }`}
              >
                <Send size={20} className="ml-1" />
              </button>
            )}
          </div>
        </form>
        <div className="text-center mt-3 flex items-center justify-center gap-4">
          <p className="text-[10px] text-gray-400 font-mono uppercase tracking-widest">
            {activeModule === 'OFFICE' ? "请务必先在备份文档中测试生成的宏代码。" : "请务必先在空白图纸中测试生成的脚本。"}
          </p>
          <button 
            onClick={() => setIsAgentGuideOpen(true)}
            className={`text-[10px] underline uppercase tracking-widest transition-colors ${
              activeModule === 'OFFICE' ? 'text-emerald-500 hover:text-emerald-400' : 'text-blue-500 hover:text-blue-400'
            }`}
          >
            {activeModule === 'OFFICE' ? "如何配置本地 Office 一键运行？" : "如何配置本地 CAD 一键运行？"}
          </button>
        </div>
      </footer>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={updateSettings}
        chatHistory={chatHistory}
      />
      
      <LocalAgentGuide 
        isOpen={isAgentGuideOpen}
        onClose={() => setIsAgentGuideOpen(false)}
      />

      <BookmarksModal
        isOpen={isBookmarksOpen}
        onClose={() => setIsBookmarksOpen(false)}
        onInsertContext={(bookmark) => {
          setAttachments(prev => {
            if (prev.some(a => a.code === bookmark.code)) return prev;
            return [...prev, bookmark];
          });
          setIsBookmarksOpen(false);
          document.querySelector('textarea')?.focus();
        }}
        bookmarksState={bookmarksState}
        autoCad={autoCad}
        office={office}
        activeModule={activeModule}
      />

      <DrawingLibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        autoCad={autoCad}
        onAttachToChat={(attachment) => {
          setAttachments(prev => [...prev, attachment]);
          setIsLibraryOpen(false); // Optionally close library after attach
        }}
      />

      <SaveBookmarkModal
        isOpen={saveBookmarkData.isOpen}
        onClose={() => setSaveBookmarkData(prev => ({ ...prev, isOpen: false }))}
        code={saveBookmarkData.code}
        language={saveBookmarkData.language}
        history={saveBookmarkData.history}
        bookmarksState={bookmarksState}
      />

      <ArchiveModal
        isOpen={isArchiveOpen}
        onClose={() => setIsArchiveOpen(false)}
        sessions={sessions}
        onRestore={(id) => toggleArchive(id)}
        onDelete={(id) => deleteSession(id)}
        activeModule={activeModule}
      />

      <SkillLibraryModal 
        isOpen={isSkillLibraryOpen}
        onClose={() => setIsSkillLibraryOpen(false)}
        skills={skillLibrary.skills}
        onAdd={skillLibrary.addSkill}
        onUpdate={skillLibrary.updateSkill}
        onDelete={skillLibrary.deleteSkill}
        initialAddLogic={skillAddLogic}
        initialAddParams={skillAddParams}
        onClearInitialAddLogic={() => {
          setSkillAddLogic(null);
          setSkillAddParams(null);
        }}
        onRunSkill={async (skill) => {
          if (!isConnected) {
            alert('CAD未连接，请先连接CAD。');
            return;
          }
          try {
            await autoCad.sendCode(skill.logic);
            alert(`已成功发送技能 "${skill.name}" 到CAD执行！`);
          } catch (e: any) {
            alert(`执行失败: ${e.message}`);
          }
        }}
        onTrainSkill={(skill) => {
          setIsSkillLibraryOpen(false);
          setAttachments(prev => [...prev, {
            name: `技能模型 - ${skill.name}`,
            code: skill.logic,
            language: 'lisp'
          }]);
          setInput(prev => prev ? prev + `\n\n请帮我优化/完善这个技能代码：${skill.name}` : `请帮我优化/完善这个技能代码：${skill.name}`);
          document.querySelector('textarea')?.focus();
        }}
      />

      {(showTour || !settings.hasSeenOnboarding) && (
        <OnboardingTour onClose={() => {
          updateSettings({ hasSeenOnboarding: true });
          setShowTour(false);
        }} />
      )}

      <FeatureGuideModal
        isOpen={isFeatureGuideOpen}
        onClose={() => setIsFeatureGuideOpen(false)}
        activeModule={activeModule}
        onSelectPrompt={(promptText, autoSend) => {
          if (autoSend) {
            handleSendMessage(promptText);
          } else {
            setInput(promptText);
            document.querySelector('textarea')?.focus();
          }
        }}
        onOpenAgentGuide={() => setIsAgentGuideOpen(true)}
        onOpenSkillLibrary={() => setIsSkillLibraryOpen(true)}
        onOpenBookmarks={() => setIsBookmarksOpen(true)}
      />
      </div>
    </div>
  );
}


