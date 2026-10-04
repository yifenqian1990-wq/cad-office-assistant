import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChatMessage } from '../services/ai';
import { get, set as idbSet } from 'idb-keyval';

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  isPinned: boolean;
  isArchived: boolean;
  order: number;
  module?: 'CAD' | 'OFFICE';
}

const STORAGE_KEY = 'autocad_ai_chat_history';
const FILE_HANDLE_KEY = 'autocad_ai_chat_history_handle';

const sanitizeSessions = (sessionsList: ChatSession[]): ChatSession[] => {
  return sessionsList.map(session => ({
    ...session,
    messages: (session.messages || []).filter(m => {
      if (m.role === 'assistant' && (!m.content || !m.content.trim())) {
        return false;
      }
      return true;
    })
  }));
};

export function useChatHistory(activeModule: 'CAD' | 'OFFICE' = 'CAD') {
  const [rawSessions, setRawSessions] = useState<ChatSession[]>([]);

  const sessions = useMemo(() => {
    const seen = new Set<string>();
    return rawSessions.filter(s => {
      if (!s || !s.id) return false;
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }, [rawSessions]);

  const setSessions = useCallback((val: ChatSession[] | ((prev: ChatSession[]) => ChatSession[])) => {
    setRawSessions(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      const seen = new Set<string>();
      return next.filter(s => {
        if (!s || !s.id) return false;
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
    });
  }, []);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [handleNeedsPermission, setHandleNeedsPermission] = useState(false);

  // Background load from file handle
  useEffect(() => {
    const loadFromHandle = async () => {
      try {
        const handle = await get<any>(FILE_HANDLE_KEY);
        if (handle) {
          const permission = await handle.queryPermission({ mode: 'readwrite' });
          if (permission === 'granted') {
            const file = await handle.getFile();
            const text = await file.text();
            if (text) {
              const data = JSON.parse(text);
              if (Array.isArray(data)) {
                
                // Sort by order first, then fallback to updatedAt
                data.sort((a, b) => {
                  if (a.isPinned !== b.isPinned) {
                    return a.isPinned ? -1 : 1;
                  }
                  if (a.order !== b.order && a.order !== undefined && b.order !== undefined) {
                    return a.order - b.order;
                  }
                  return b.updatedAt - a.updatedAt;
                });
                
                const sanitizedData = sanitizeSessions(data);
                setSessions(sanitizedData);
                await idbSet(STORAGE_KEY, sanitizedData); // update local backup
              }
            }
            setFileHandle(handle);
          } else {
            setHandleNeedsPermission(true);
            // Fallback to load from indexedDB
            const stored = await get<ChatSession[]>(STORAGE_KEY);
            if (stored && stored.length > 0) {
              stored.sort((a, b) => {
                if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
                if (a.order !== b.order && a.order !== undefined && b.order !== undefined) return a.order - b.order;
                return b.updatedAt - a.updatedAt;
              });
              setSessions(sanitizeSessions(stored));
            } else {
              initDefaultSession();
            }
          }
        } else {
          // No handle, load from IDB
          const stored = await get<ChatSession[]>(STORAGE_KEY);
          if (stored && stored.length > 0) {
            stored.sort((a, b) => {
              if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
              if (a.order !== b.order && a.order !== undefined && b.order !== undefined) return a.order - b.order;
              return b.updatedAt - a.updatedAt;
            });
            setSessions(sanitizeSessions(stored));
          } else {
            initDefaultSession();
          }
        }
      } catch (err) {
        console.error('Failed to load chat history', err);
        // Fallback to load from indexedDB
        const stored = await get<ChatSession[]>(STORAGE_KEY);
        if (stored && stored.length > 0) {
           stored.sort((a, b) => {
            if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
            if (a.order !== b.order && a.order !== undefined && b.order !== undefined) return a.order - b.order;
            return b.updatedAt - a.updatedAt;
          });
          setSessions(sanitizeSessions(stored));
        } else {
          initDefaultSession();
        }
      } finally {
        setIsLoaded(true);
      }
    };
    loadFromHandle();
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initDefaultSession = () => {
    const initialSession: ChatSession = {
      id: crypto.randomUUID(),
      title: '新对话',
      messages: [],
      updatedAt: Date.now(),
      isPinned: false,
      isArchived: false,
      order: 0,
      module: 'CAD',
    };
    setSessions([initialSession]);
    setCurrentSessionId(initialSession.id);
  };

  const reconnectFile = async () => {
    try {
      const handle = await get<any>(FILE_HANDLE_KEY);
      if (handle) {
        const perm = await handle.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          const file = await handle.getFile();
          const text = await file.text();
          if (text) {
             const data = JSON.parse(text);
             if (Array.isArray(data)) {
               data.sort((a, b) => {
                  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
                  if (a.order !== b.order && a.order !== undefined && b.order !== undefined) return a.order - b.order;
                  return b.updatedAt - a.updatedAt;
               });
               setSessions(data);
               await idbSet(STORAGE_KEY, data);
             }
          }
          setFileHandle(handle);
          setHandleNeedsPermission(false);
          alert('恢复聊天数据连接成功');
        }
      }
    } catch (err) {
      console.error("恢复连接失败", err);
      alert('恢复连接失败');
    }
  };
  
  const setupFileConnection = async () => {
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `autocad_ai_chat_data.json`,
          types: [{
            description: 'JSON File',
            accept: { 'application/json': ['.json'] },
          }],
        });
        
        // Write current setting to it first
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(sessions, null, 2));
        await writable.close();
        
        await idbSet(FILE_HANDLE_KEY, handle);
        setFileHandle(handle);
        alert('聊天数据已保存并建立热连接');
      } else {
        alert('您的浏览器不支持 File System Access API');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error("File connection setup failed", err);
        alert('建立连接失败');
      }
    }
  };

  const saveToDisk = useCallback(async (data: ChatSession[], handle: FileSystemFileHandle | null) => {
    if (!handle) return;
    try {
      if ((await (handle as any).queryPermission({ mode: 'readwrite' })) === 'granted') {
        const writable = await (handle as any).createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
      }
    } catch (err) {
      console.error("Failed to write to file handle", err);
    }
  }, []);

  // Save changes wrapper
  const saveAndSync = useCallback((newSessions: ChatSession[]) => {
    setSessions(newSessions);
    idbSet(STORAGE_KEY, newSessions).catch(e => console.error(e));
    if (fileHandle) {
      saveToDisk(newSessions, fileHandle);
    }
  }, [fileHandle, saveToDisk]);

  const saveSessions = useCallback(async (newSessions: ChatSession[]) => {
    saveAndSync(newSessions);
  }, [saveAndSync]);

  const createSession = useCallback((module: 'CAD' | 'OFFICE' = 'CAD') => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: '新对话',
      messages: [],
      updatedAt: Date.now(),
      isPinned: false,
      isArchived: false,
      order: 0,
      module,
    };
    
    setSessions(prev => {
      const updated = [newSession, ...prev.map(s => ({ ...s, order: (s.order || 0) + 1 }))];
      saveAndSync(updated);
      return updated;
    });
    setCurrentSessionId(newSession.id);
    return newSession.id;
  }, [saveAndSync]);

  const updateSession = useCallback((id: string, updates: Partial<ChatSession>) => {
    setSessions(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, ...updates, updatedAt: updates.messages ? Date.now() : s.updatedAt } : s);
      saveAndSync(updated);
      return updated;
    });
  }, [saveAndSync]);

  const updateSessionMessages = useCallback((sessionId: string, messages: ChatMessage[]) => {
    if (!sessionId) return;
    const sanitizedMessages = (messages || []).filter(m => m.role !== 'assistant' || (m.content && m.content.trim().length > 0));
    setSessions(prev => {
      const updated = prev.map(s => {
        if (s.id === sessionId) {
          let title = s.title;
          if ((title === '新对话' || title === 'New Chat') && sanitizedMessages.length > 0) {
            const firstUserMsg = sanitizedMessages.find(m => m.role === 'user');
            if (firstUserMsg && firstUserMsg.rawContent) {
              title = firstUserMsg.rawContent.slice(0, 30) + (firstUserMsg.rawContent.length > 30 ? '...' : '');
            }
          }
          return { ...s, messages: sanitizedMessages, title, updatedAt: Date.now() };
        }
        return s;
      });
      saveAndSync(updated);
      return updated;
    });
  }, [saveAndSync]);

  const updateCurrentSessionMessages = useCallback((messages: ChatMessage[]) => {
    if (currentSessionId) {
      updateSessionMessages(currentSessionId, messages);
    }
  }, [currentSessionId, updateSessionMessages]);

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id);
      saveAndSync(updated);
      return updated;
    });
    if (currentSessionId === id) {
      setCurrentSessionId(null);
    }
  }, [currentSessionId, saveAndSync]);

  const togglePin = useCallback((id: string) => {
    setSessions(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, isPinned: !s.isPinned } : s);
      saveAndSync(updated);
      return updated;
    });
  }, [saveAndSync]);

  const toggleArchive = useCallback((id: string) => {
    setSessions(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, isArchived: !s.isArchived } : s);
      saveAndSync(updated);
      return updated;
    });
    if (currentSessionId === id) {
      setCurrentSessionId(null);
    }
  }, [currentSessionId, saveAndSync]);

  const reorderSessions = useCallback((activeId: string, overId: string) => {
    setSessions(prev => {
      const activeItem = prev.find(s => s.id === activeId);
      const overItem = prev.find(s => s.id === overId);
      if (!activeItem || !overItem) return prev;
      
      const activeIndex = prev.findIndex(s => s.id === activeId);
      const overIndex = prev.findIndex(s => s.id === overId);
      
      const newSessions = [...prev];
      newSessions.splice(activeIndex, 1);
      newSessions.splice(overIndex, 0, activeItem);
      
      const finalSessions = newSessions.map((s, index) => ({ ...s, order: index }));
      saveAndSync(finalSessions);
      return finalSessions;
    });
  }, [saveAndSync]);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  useEffect(() => {
    if (isLoaded && !currentSessionId) {
      const activeSessions = sessions.filter(s => !s.isArchived && (s.module || 'CAD') === activeModule);
      if (activeSessions.length > 0) {
        const top = [...activeSessions].sort((a, b) => {
            if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
            if (a.order !== b.order && a.order !== undefined && b.order !== undefined) return a.order - b.order;
            return b.updatedAt - a.updatedAt;
        })[0];
        setCurrentSessionId(top.id);
      } else {
        createSession(activeModule);
      }
    }
  }, [isLoaded, currentSessionId, sessions, createSession, activeModule]);

  return {
    sessions,
    currentSessionId,
    currentSession,
    isLoaded,
    setCurrentSessionId,
    createSession,
    updateSession,
    updateSessionMessages,
    updateCurrentSessionMessages,
    deleteSession,
    togglePin,
    toggleArchive,
    reorderSessions,
    saveSessions,
    fileHandleName: fileHandle?.name,
    handleNeedsPermission,
    reconnectFile,
    setupFileConnection
  };
}

