import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChatMessage } from '../services/ai';
import { get, set as idbSet, del } from 'idb-keyval';

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
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'error' | 'disconnected' | 'needs_permission'>('disconnected');

  // Background load from file handle
  useEffect(() => {
    const loadFromHandle = async () => {
      try {
        const handle = await get<any>(FILE_HANDLE_KEY);
        if (handle) {
          setFileHandle(handle);
          const permission = await handle.queryPermission({ mode: 'readwrite' });
          if (permission === 'granted') {
            const file = await handle.getFile();
            const text = await file.text();
            if (text) {
              const data = JSON.parse(text);
              const rawList = Array.isArray(data) ? data : (data.sessions || []);
              if (Array.isArray(rawList)) {
                // Sort by order first, then fallback to updatedAt
                rawList.sort((a, b) => {
                  if (a.isPinned !== b.isPinned) {
                    return a.isPinned ? -1 : 1;
                  }
                  if (a.order !== b.order && a.order !== undefined && b.order !== undefined) {
                    return a.order - b.order;
                  }
                  return b.updatedAt - a.updatedAt;
                });
                
                const sanitizedData = sanitizeSessions(rawList);
                setSessions(sanitizedData);
                await idbSet(STORAGE_KEY, sanitizedData); // update local backup
              }
            }
            setHandleNeedsPermission(false);
            setLastSyncTime(Date.now());
            setSyncStatus('synced');
          } else {
            setHandleNeedsPermission(true);
            setSyncStatus('needs_permission');
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

  const isWritingRef = useRef(false);
  const pendingDataRef = useRef<ChatSession[] | null>(null);

  const saveToDisk = useCallback(async (data: ChatSession[], handle: FileSystemFileHandle | null) => {
    if (!handle) return;
    if (isWritingRef.current) {
      pendingDataRef.current = data;
      return;
    }
    isWritingRef.current = true;
    setIsSyncing(true);
    try {
      const perm = await (handle as any).queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        const writable = await (handle as any).createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
        setLastSyncTime(Date.now());
        setSyncStatus('synced');
      } else {
        setHandleNeedsPermission(true);
        setSyncStatus('needs_permission');
      }
    } catch (err) {
      console.error("Failed to write to file handle", err);
      setSyncStatus('error');
    } finally {
      isWritingRef.current = false;
      setIsSyncing(false);
      if (pendingDataRef.current) {
        const nextData = pendingDataRef.current;
        pendingDataRef.current = null;
        saveToDisk(nextData, handle);
      }
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

  const reconnectFile = async (): Promise<boolean> => {
    try {
      const handle = await get<any>(FILE_HANDLE_KEY);
      if (handle) {
        const perm = await handle.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          const file = await handle.getFile();
          const text = await file.text();
          if (text) {
             const data = JSON.parse(text);
             const rawList = Array.isArray(data) ? data : (data.sessions || []);
             if (Array.isArray(rawList)) {
               rawList.sort((a, b) => {
                  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
                  if (a.order !== b.order && a.order !== undefined && b.order !== undefined) return a.order - b.order;
                  return b.updatedAt - a.updatedAt;
               });
               const sanitized = sanitizeSessions(rawList);
               setSessions(sanitized);
               await idbSet(STORAGE_KEY, sanitized);
             }
          }
          setFileHandle(handle);
          setHandleNeedsPermission(false);
          setLastSyncTime(Date.now());
          setSyncStatus('synced');
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error("恢复连接失败", err);
      return false;
    }
  };

  // Export current chat history to a file and establish persistent sync
  const exportChatFile = async (): Promise<{ success: boolean; message?: string }> => {
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `autocad_ai_chat_data.json`,
          types: [{
            description: 'JSON 聊天记录 (*.json)',
            accept: { 'application/json': ['.json'] },
          }],
        });
        
        // Write current sessions to it first
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(sessions, null, 2));
        await writable.close();
        
        // Save handle for persistent sync
        await idbSet(FILE_HANDLE_KEY, handle);
        setFileHandle(handle);
        setHandleNeedsPermission(false);
        setLastSyncTime(Date.now());
        setSyncStatus('synced');
        return {
          success: true,
          message: `已导出 ${sessions.length} 个会话至【${handle.name}】并建立持久热同步！后续所有聊天更新都将实时同步到此文件。`
        };
      } else {
        // Fallback for browsers without File System Access API
        const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `autocad_ai_chat_data_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        return {
          success: true,
          message: '当前浏览器不支持本地持久文件句柄，已通过下载完成导出。'
        };
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, message: '用户已取消导出' };
      }
      console.error("File export failed", err);
      return { success: false, message: `导出失败: ${err.message || '未知错误'}` };
    }
  };

  // Import chat history from a file and establish persistent sync
  const importChatFile = async (fallbackFile?: File, preferredMode?: 'replace' | 'merge'): Promise<{ success: boolean; message?: string; count?: number }> => {
    try {
      let fileText = '';
      let handle: FileSystemFileHandle | null = null;
      let fileName = '';

      if (fallbackFile) {
        fileText = await fallbackFile.text();
        fileName = fallbackFile.name;
      } else if ('showOpenFilePicker' in window) {
        const [pickedHandle] = await (window as any).showOpenFilePicker({
          types: [{
            description: 'JSON 聊天记录 (*.json)',
            accept: { 'application/json': ['.json'] },
          }],
        });
        handle = pickedHandle;
        fileName = pickedHandle.name;

        // Ensure readwrite permission
        let perm = await (pickedHandle as any).queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          perm = await (pickedHandle as any).requestPermission({ mode: 'readwrite' });
        }

        const file = await pickedHandle.getFile();
        fileText = await file.text();
      } else {
        throw new Error('当前浏览器不支持文件选择器，请使用文件上传模式');
      }

      if (!fileText.trim()) {
        throw new Error('选中的文件为空');
      }

      let parsedData: any;
      try {
        parsedData = JSON.parse(fileText);
      } catch {
        throw new Error('文件不是合法的 JSON 格式');
      }

      let rawList: any[] = [];
      if (Array.isArray(parsedData)) {
        rawList = parsedData;
      } else if (parsedData && Array.isArray(parsedData.sessions)) {
        rawList = parsedData.sessions;
      } else if (parsedData && Array.isArray(parsedData.chatHistory)) {
        rawList = parsedData.chatHistory;
      } else if (parsedData && parsedData.id && parsedData.messages) {
        rawList = [parsedData];
      } else {
        throw new Error('未能识别到有效的聊天记录格式');
      }

      const importedSessions = sanitizeSessions(rawList.map((item, idx) => ({
        id: item.id || crypto.randomUUID(),
        title: item.title || '导入会话',
        messages: Array.isArray(item.messages) ? item.messages : [],
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
        isPinned: Boolean(item.isPinned),
        isArchived: Boolean(item.isArchived),
        order: typeof item.order === 'number' ? item.order : idx,
        module: item.module === 'OFFICE' ? 'OFFICE' : 'CAD',
      })));

      if (importedSessions.length === 0) {
        throw new Error('文件中没有有效的聊天会话');
      }

      // Check current sessions to decide merge vs replace
      const currentValidSessions = sessions.filter(s => s.messages && s.messages.length > 0);
      let finalMode = preferredMode;
      if (!finalMode) {
        if (currentValidSessions.length === 0) {
          finalMode = 'replace';
        } else {
          const replace = window.confirm(
            `检测到当前已有 ${currentValidSessions.length} 个非空会话：\n\n` +
            `【确定】：替换当前记录（仅载入导入文件中的 ${importedSessions.length} 个会话）\n` +
            `【取消】：合并导入（将导入的会话与现有会话合并保留）`
          );
          finalMode = replace ? 'replace' : 'merge';
        }
      }

      let mergedSessions: ChatSession[] = [];
      if (finalMode === 'replace') {
        mergedSessions = importedSessions;
      } else {
        const importedMap = new Map(importedSessions.map(s => [s.id, s]));
        const existingMerged = sessions.map(s => importedMap.has(s.id) ? importedMap.get(s.id)! : s);
        const existingIds = new Set(sessions.map(s => s.id));
        const newSessionsFromImport = importedSessions.filter(s => !existingIds.has(s.id));
        mergedSessions = [...newSessionsFromImport, ...existingMerged];
      }

      mergedSessions.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        if (a.order !== b.order && a.order !== undefined && b.order !== undefined) return a.order - b.order;
        return b.updatedAt - a.updatedAt;
      });

      setSessions(mergedSessions);
      await idbSet(STORAGE_KEY, mergedSessions);

      if (handle) {
        await idbSet(FILE_HANDLE_KEY, handle);
        setFileHandle(handle);
        const perm = await (handle as any).queryPermission({ mode: 'readwrite' });
        setHandleNeedsPermission(perm !== 'granted');
        setLastSyncTime(Date.now());
        setSyncStatus('synced');

        // If user chose merge and permission is granted, persist merged content back to the file
        if (finalMode === 'merge' && perm === 'granted') {
          await saveToDisk(mergedSessions, handle);
        }
      }

      // Update currentSessionId if lost
      if (!mergedSessions.some(s => s.id === currentSessionId)) {
        const firstActive = mergedSessions.find(s => !s.isArchived && (s.module || 'CAD') === activeModule) || mergedSessions[0];
        if (firstActive) {
          setCurrentSessionId(firstActive.id);
        }
      }

      return {
        success: true,
        count: importedSessions.length,
        message: handle 
          ? `成功导入 ${importedSessions.length} 个会话，并与【${fileName}】建立了持久热同步！后续所有聊天更新将实时同步至此文件。`
          : `成功导入 ${importedSessions.length} 个会话（数据已保存在本地数据库中）。`
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, message: '用户已取消导入' };
      }
      console.error("Import chat file failed", err);
      return { success: false, message: err.message || '导入失败，请检查文件格式' };
    }
  };

  // Disconnect file sync
  const disconnectFile = useCallback(async () => {
    try {
      await del(FILE_HANDLE_KEY);
      setFileHandle(null);
      setHandleNeedsPermission(false);
      setLastSyncTime(null);
      setSyncStatus('disconnected');
      return true;
    } catch (err) {
      console.error("Disconnect file failed", err);
      return false;
    }
  }, []);

  // Trigger manual sync immediately
  const manualSync = useCallback(async () => {
    if (!fileHandle) {
      alert('未关联同步文件，请先通过【导入】或【导出】建立同步连接。');
      return false;
    }
    try {
      let perm = await (fileHandle as any).queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        perm = await (fileHandle as any).requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          setHandleNeedsPermission(true);
          setSyncStatus('needs_permission');
          alert('未获得该文件的写入权限');
          return false;
        }
      }
      setHandleNeedsPermission(false);
      await saveToDisk(sessions, fileHandle);
      alert(`已成功将当前所有聊天记录立即同步保存至【${fileHandle.name}】！`);
      return true;
    } catch (err: any) {
      console.error("Manual sync failed", err);
      alert(`同步失败: ${err.message || '未知错误'}`);
      return false;
    }
  }, [fileHandle, saveToDisk, sessions]);

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
    fileHandle,
    handleNeedsPermission,
    lastSyncTime,
    isSyncing,
    syncStatus,
    reconnectFile,
    exportChatFile,
    importChatFile,
    exportChatHistory: exportChatFile,
    importChatHistory: importChatFile,
    disconnectFile,
    manualSync,
    setupFileConnection: exportChatFile
  };
}

