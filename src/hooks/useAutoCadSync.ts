import { useState, useEffect, useCallback, useRef } from 'react';

export interface CadBusyState {
  isWaiting: boolean;
  reason?: string;
  message?: string;
  elapsed?: number;
}

export function useAutoCadSync() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [documents, setDocuments] = useState<string[]>([]);
  const [activeDocument, setActiveDocument] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [cadInstances, setCadInstances] = useState<{pid: number, connected: boolean, is_top: boolean, docs: string[], active_doc: string | null}[]>([]);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [isReceivingData, setIsReceivingData] = useState(false);
  const [receiveProgress, setReceiveProgress] = useState<{current: number, total: number} | null>(null);
  const [cadBusyState, setCadBusyState] = useState<CadBusyState | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastActiveRef = useRef<number>(Date.now());

  useEffect(() => {
    if (cadInstances && cadInstances.length > 0 && selectedPid) {
       const currentApp = cadInstances.find(a => a.pid === selectedPid);
       if (currentApp) {
          setDocuments(currentApp.docs || []);
          setActiveDocument(currentApp.active_doc || null);
       }
    }
  }, [selectedPid, cadInstances]);

  const handleJsonMessage = useCallback((event: MessageEvent) => {
    lastActiveRef.current = Date.now();
    try {
      if (event.data.startsWith('{')) {
        const payload = JSON.parse(event.data);
        if (payload.type === 'documents') {
          if (payload.apps) {
            setCadInstances(payload.apps);
            
            // Determine active/selected PID
            let newPid = null;
            if (payload.apps.length > 0) {
                const topApp = payload.apps.find((a: any) => a.is_top) || payload.apps[0];
                newPid = topApp.pid;
            }

            // Only update selected PID if we don't have one, or if ours is no longer present
            const currentPidStatus = payload.apps.find((a: any) => a.pid === selectedPid);
            
            let finalPid = selectedPid;
            if (!selectedPid || !currentPidStatus) {
                finalPid = newPid;
                setSelectedPid(finalPid);
            }

            const currentApp = payload.apps.find((a: any) => a.pid === finalPid) || payload.apps[0];
            if (currentApp) {
                setDocuments(currentApp.docs || []);
                setActiveDocument(currentApp.active_doc || null);
                if (currentApp.active_doc && !selectedDocument) {
                    setSelectedDocument(currentApp.active_doc);
                }
            } else {
                setDocuments([]);
                setActiveDocument(null);
            }
          } else {
             // fallback for older agent version
             setDocuments(payload.data || []);
             setActiveDocument(payload.active || null);
             if (payload.active) {
                setSelectedDocument(payload.active);
             }
          }
        }
      }
    } catch (e) {
      console.warn("Could not parse WS message:", e);
    }
  }, [selectedPid, selectedDocument]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;
    
    setIsConnecting(true);
    let wsUrl = 'ws://127.0.0.1:8765';
    try {
      const savedSettings = localStorage.getItem('autocad_ai_settings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed.agentAddress) {
          wsUrl = parsed.agentAddress;
        }
      }
    } catch(e) {}
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      setIsConnected(true);
      setIsConnecting(false);
      lastActiveRef.current = Date.now();
      // Request document list on connect
      ws.send(JSON.stringify({ action: 'get_documents' }));
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        setIsConnected(false);
        setIsConnecting(false);
        setCadBusyState(null);
        setDocuments([]);
        wsRef.current = null;
      }
    };

    ws.onerror = () => {
      if (wsRef.current === ws) {
        setIsConnected(false);
        setIsConnecting(false);
        setCadBusyState(null);
      }
    };

    ws.onmessage = handleJsonMessage;

    wsRef.current = ws;
  }, [handleJsonMessage]);

  // Handle runtime replacement of message handler
  useEffect(() => {
    if (wsRef.current) {
      wsRef.current.onmessage = handleJsonMessage;
    }
  }, [handleJsonMessage]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
  }, []);

  const refreshDocuments = useCallback(() => {
     if (wsRef.current?.readyState === WebSocket.OPEN) {
       wsRef.current.send(JSON.stringify({ action: 'get_documents' }));
     }
  }, []);

  const sendCode = useCallback(async (code: string, targetDoc?: string): Promise<boolean | string> => {
    let finalCode = code;
    
    // Auto-execute the last defined Lisp command (C:xxx) if not already called
    const pattern = /\(defun\s+[cC]:([^\s\(\)]+)/ig;
    let match;
    let lastCmd = null;
    while ((match = pattern.exec(finalCode)) !== null) {
      lastCmd = match[1];
    }
    
    if (lastCmd) {
      const escapedCmd = lastCmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const callPattern = new RegExp(`\\([cC]:${escapedCmd}\\s*\\)`, 'i');
      if (!callPattern.test(finalCode)) {
        finalCode += `\n(c:${lastCmd})\n`;
      }
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connect();
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        throw new Error("本地代理未连接 (Local Agent not connected)，此时 AutoCAD 可能未运行，或本地脚本代理未开启。请检查并重试。");
      }
    }
    
    setCadBusyState(null);
    return new Promise((resolve, reject) => {
      if (!wsRef.current) return reject(new Error("No connection"));
      
      let timeoutId: number;
      const resetTimeout = (ms = 30000) => {
        clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
          wsRef.current?.removeEventListener('message', handleExecutionResponse);
          setCadBusyState(null);
          // If CAD is waiting for interactive prompt / command execution, consider it dispatched
          resolve(true);
        }, ms);
      };

      const handleExecutionResponse = (event: MessageEvent) => {
        try {
          // Handle old string format if old python script is used
          if (event.data === 'Success') {
            clearTimeout(timeoutId);
            setCadBusyState(null);
            wsRef.current?.removeEventListener('message', handleExecutionResponse);
            resolve(true);
            return;
          }
          if (typeof event.data === 'string' && event.data.startsWith('Error:')) {
            clearTimeout(timeoutId);
            setCadBusyState(null);
            wsRef.current?.removeEventListener('message', handleExecutionResponse);
            reject(new Error(event.data));
            return;
          }

          if (event.data.startsWith('{')) {
            const payload = JSON.parse(event.data);

            // Handle CAD user-busy notification from Local Agent
            if (payload.type === 'cad_busy') {
              if (payload.status === 'waiting') {
                setCadBusyState({
                  isWaiting: true,
                  reason: payload.reason,
                  message: payload.message || 'CAD 正在被用户使用，等待操作结束后自动发送...',
                  elapsed: payload.elapsed
                });
                // Keep extending timeout while CAD is busy with user interaction
                resetTimeout(45000);
              } else if (payload.status === 'resumed') {
                setCadBusyState({
                  isWaiting: false,
                  message: payload.message || '用户操作已结束，正在发送代码...'
                });
                resetTimeout(15000);
              }
              return;
            }

            if (payload.type === 'status' && payload.data === 'Success') {
               clearTimeout(timeoutId);
               setCadBusyState(null);
               wsRef.current?.removeEventListener('message', handleExecutionResponse);
               resolve(payload.output || true);
            } else if (payload.type === 'error') {
               clearTimeout(timeoutId);
               setCadBusyState(null);
               wsRef.current?.removeEventListener('message', handleExecutionResponse);
               let errMsg = payload.message || "执行失败";
               if (payload.output) errMsg += `\nOutput: ${payload.output}`;
               reject(new Error(errMsg));
            }
          }
        } catch (e) {
          // parse error
        }
      };
      
      wsRef.current.addEventListener('message', handleExecutionResponse);
      const docToSend = targetDoc || selectedDocument || activeDocument || null;
      wsRef.current.send(JSON.stringify({ action: 'execute', code: finalCode, document: docToSend, pid: selectedPid }));
      
      // Default execution timeout: 30s (extended dynamically when cad_busy event arrives)
      resetTimeout(30000);
    });
  }, [connect, selectedDocument, activeDocument]);

  const cancelSelectionRef = useRef<(() => void) | null>(null);

  const cancelSelection = useCallback(() => {
    if (cancelSelectionRef.current) {
      cancelSelectionRef.current();
    }
  }, []);

  const getSelection = useCallback(async (targetDoc?: string): Promise<any[]> => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connect();
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        throw new Error("本地代理未连接 (Local Agent not connected)，此时 AutoCAD 可能未运行，或本地脚本代理未开启。请检查并重试。");
      }
    }
    
    return new Promise((resolve, reject) => {
      if (!wsRef.current) return reject(new Error("No connection"));
      
      setIsReceivingData(true);
      setReceiveProgress(null);
      let timeoutId: number;
      
      const resetTimeout = () => {
        clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
          wsRef.current?.removeEventListener('message', handleSelectionResponse);
          setIsReceivingData(false);
          cancelSelectionRef.current = null;
          reject(new Error("读取超时，可能是由于 AutoCAD 正处于命令执行中。"));
        }, 15000);
      };

      const handleSelectionResponse = (event: MessageEvent) => {
        try {
          if (event.data.startsWith('{')) {
            const payload = JSON.parse(event.data);
            if (payload.type === 'selection_data') {
               clearTimeout(timeoutId);
               wsRef.current?.removeEventListener('message', handleSelectionResponse);
               setIsReceivingData(false);
               cancelSelectionRef.current = null;
               resolve(payload.data || []);
            } else if (payload.type === 'progress') {
               resetTimeout();
               setReceiveProgress({ current: payload.current, total: payload.total });
            } else if (payload.type === 'error') {
               clearTimeout(timeoutId);
               wsRef.current?.removeEventListener('message', handleSelectionResponse);
               setIsReceivingData(false);
               cancelSelectionRef.current = null;
               reject(new Error(payload.message || "读取选择对象失败 (如果您使用的是旧版代理脚本，请重新下载)"));
            }
          }
        } catch (e) {
          // parse error
        }
      };

      cancelSelectionRef.current = () => {
         clearTimeout(timeoutId);
         wsRef.current?.removeEventListener('message', handleSelectionResponse);
         setIsReceivingData(false);
         setReceiveProgress(null);
         reject(new Error("已手动取消对象读取"));
         cancelSelectionRef.current = null;
         
         // disconnect and reconnect to abort the python script's read process
         disconnect();
         setTimeout(() => connect(), 100);
      };
      
      wsRef.current.addEventListener('message', handleSelectionResponse);
      const docToSend = targetDoc || selectedDocument || activeDocument || null;
      wsRef.current.send(JSON.stringify({ action: 'get_selection', document: docToSend, pid: selectedPid }));
      
      resetTimeout();
    });
  }, [connect, selectedDocument, activeDocument, disconnect]);

  // Try connecting on mount and manage stable connection
  useEffect(() => {
    connect();
    
    let pingInterval: number | null = null;
    
    // Ping to keep NAT/firewalls alive without dropping the connection
    pingInterval = window.setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        connect();
      } else if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ action: 'ping' }));
        } catch (e) {
          // Ignore transient socket write errors
        }
      }
    }, 10000);
    
    return () => {
      if (pingInterval) clearInterval(pingInterval);
    };
  }, [connect]);

  const sendUndo = useCallback(async () => {
    return sendCode('(command "undo" 1)');
  }, [sendCode]);

  return { 
    isConnected, 
    isConnecting, 
    connect, 
    disconnect, 
    sendCode, 
    sendUndo, 
    getSelection, 
    cancelSelection,
    documents, 
    selectedDocument, 
    setSelectedDocument, 
    cadInstances,
    selectedPid,
    setSelectedPid,
    refreshDocuments,
    isReceivingData,
    receiveProgress,
    cadBusyState
  };
}
