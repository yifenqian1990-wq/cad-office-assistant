import { useState, useEffect, useCallback, useRef } from 'react';

export interface OfficeAppInfo {
  name: string;
  workbooks?: {
    name: string;
    sheets: string[];
    active_sheet: string | null;
  }[];
  active_workbook?: string | null;
  documents?: string[];
  active_document?: string | null;
}

export function useOfficeSync() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [runningApps, setRunningApps] = useState<OfficeAppInfo[]>([]);
  const [selectedApp, setSelectedApp] = useState<string>('Excel');
  const [selectedWorkbook, setSelectedWorkbook] = useState<string | null>(null);
  const [selectedWorksheet, setSelectedWorksheet] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastActiveRef = useRef<number>(Date.now());

  const handleJsonMessage = useCallback((event: MessageEvent) => {
    lastActiveRef.current = Date.now();
    try {
      if (event.data.startsWith('{')) {
        const payload = JSON.parse(event.data);
        if (payload.type === 'apps') {
          const apps = payload.data || [];
          setRunningApps(apps);
        }
      }
    } catch (e) {
      console.warn("Could not parse WS message:", e);
    }
  }, []);

  // Handle cascading selection updates when runningApps or selectedApp changes
  useEffect(() => {
    if (runningApps.length > 0) {
      let currentApp = runningApps.find(app => app.name === selectedApp);
      if (!currentApp) {
        // Auto-select first running app if current selection isn't running
        setSelectedApp(runningApps[0].name);
        currentApp = runningApps[0];
      }

      if (currentApp) {
        if (currentApp.workbooks && currentApp.workbooks.length > 0) {
          const prevAvailable = currentApp.workbooks.some(w => w.name === selectedWorkbook);
          if (!prevAvailable) {
            const nextWb = currentApp.active_workbook || currentApp.workbooks[0].name;
            setSelectedWorkbook(nextWb);
          }
        } else {
          setSelectedWorkbook(null);
          setSelectedWorksheet(null);
        }

        if (currentApp.documents && currentApp.documents.length > 0) {
          const prevAvailable = currentApp.documents.includes(selectedDocument || '');
          if (!prevAvailable) {
            const nextDoc = currentApp.active_document || currentApp.documents[0];
            setSelectedDocument(nextDoc);
          }
        } else {
          setSelectedDocument(null);
        }
      }
    }
  }, [runningApps, selectedApp, selectedWorkbook, selectedDocument]);

  // Handle worksheet cascade selection when selectedWorkbook changes
  useEffect(() => {
    const currentApp = runningApps.find(app => app.name === selectedApp);
    if (currentApp && currentApp.workbooks) {
      const wb = currentApp.workbooks.find(w => w.name === selectedWorkbook);
      if (wb && wb.sheets && wb.sheets.length > 0) {
        const prevAvailable = wb.sheets.includes(selectedWorksheet || '');
        if (!prevAvailable) {
          setSelectedWorksheet(wb.active_sheet || wb.sheets[0]);
        }
      } else {
        setSelectedWorksheet(null);
      }
    }
  }, [selectedWorkbook, runningApps, selectedApp, selectedWorksheet]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;
    
    setIsConnecting(true);
    const wsUrl = 'ws://127.0.0.1:8767';
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      setIsConnected(true);
      setIsConnecting(false);
      lastActiveRef.current = Date.now();
      // Query running office applications on connect
      ws.send(JSON.stringify({ action: 'get_apps' }));
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        setIsConnected(false);
        setIsConnecting(false);
        setRunningApps([]);
        wsRef.current = null;
      }
    };

    ws.onerror = () => {
      if (wsRef.current === ws) {
        setIsConnected(false);
        setIsConnecting(false);
      }
    };

    ws.onmessage = handleJsonMessage;
    wsRef.current = ws;
  }, [handleJsonMessage]);

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

  const refreshApps = useCallback(() => {
     if (wsRef.current?.readyState === WebSocket.OPEN) {
       wsRef.current.send(JSON.stringify({ action: 'get_apps' }));
     }
  }, []);

  const sendCode = useCallback(async (code: string, appName?: string): Promise<boolean | string> => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connect();
      await new Promise(resolve => setTimeout(resolve, 1500));
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        throw new Error("Office 本地代理未连接 (Office Local Agent not connected)，请确保已运行 office_agent.py 中转代理，且对应的 Office/WPS 软件处于开启状态。");
      }
    }
    
    return new Promise((resolve, reject) => {
      if (!wsRef.current) return reject(new Error("No connection"));
      
      let timeoutId: number;
      const handleExecutionResponse = (event: MessageEvent) => {
        try {
          if (event.data.startsWith('{')) {
            const payload = JSON.parse(event.data);
            if (payload.type === 'status' && payload.data === 'Success') {
               clearTimeout(timeoutId);
               wsRef.current?.removeEventListener('message', handleExecutionResponse);
               resolve(payload.output || true);
            } else if (payload.type === 'error') {
               clearTimeout(timeoutId);
               wsRef.current?.removeEventListener('message', handleExecutionResponse);
               let errMsg = payload.message || "执行失败";
               reject(new Error(errMsg));
            }
          }
        } catch (e) {
          // parse error
        }
      };
      
      wsRef.current.addEventListener('message', handleExecutionResponse);
      const targetApp = appName || selectedApp;
      wsRef.current.send(JSON.stringify({ 
        action: 'execute_vba', 
        code, 
        app: targetApp,
        workbook: selectedWorkbook,
        worksheet: selectedWorksheet,
        document: selectedDocument
      }));
      
      // Timeout
      timeoutId = window.setTimeout(() => {
        wsRef.current?.removeEventListener('message', handleExecutionResponse);
        resolve(true); // default resolve on slow macro triggers
      }, 5000);
    });
  }, [connect, selectedApp, selectedWorkbook, selectedWorksheet, selectedDocument]);

  const getSelection = useCallback(async (): Promise<any> => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connect();
      await new Promise(resolve => setTimeout(resolve, 1500));
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        throw new Error("Office 本地代理未连接 (Office Local Agent not connected)，请确保已运行 office_agent.py 中转代理，且对应的 Office/WPS 软件处于开启状态。");
      }
    }
    
    return new Promise((resolve, reject) => {
      if (!wsRef.current) return reject(new Error("No connection"));
      
      let timeoutId: number;
      const handleSelectionResponse = (event: MessageEvent) => {
        try {
          if (event.data.startsWith('{')) {
            const payload = JSON.parse(event.data);
            if (payload.type === 'office_data') {
               clearTimeout(timeoutId);
               wsRef.current?.removeEventListener('message', handleSelectionResponse);
               if (payload.app && payload.app !== selectedApp) {
                 setSelectedApp(payload.app);
               }
               resolve(payload);
            } else if (payload.type === 'error') {
               clearTimeout(timeoutId);
               wsRef.current?.removeEventListener('message', handleSelectionResponse);
               let errMsg = payload.message || "获取Office数据失败";
               if (errMsg.includes('-2147221021') || errMsg.includes('操作无法使用') || errMsg.includes('0x800401e3')) {
                 errMsg = `获取 ${selectedApp} 数据失败: 未检测到运行中的对应软件实例（COM错误: 操作无法使用）。请确保已打开 Word/WPS 且至少有一份打开的文档；若使用 WPS，请在顶部切换为 WPS 对应软件；若刚刚启动 Word，请点击一下 Word 界面激活窗口。`;
               }
               reject(new Error(errMsg));
            }
          }
        } catch (e) {
          // parse error
        }
      };
      
      wsRef.current.addEventListener('message', handleSelectionResponse);
      wsRef.current.send(JSON.stringify({ 
        action: 'get_office_data', 
        app: selectedApp,
        workbook: selectedWorkbook,
        worksheet: selectedWorksheet,
        document: selectedDocument
      }));
      
      timeoutId = window.setTimeout(() => {
        wsRef.current?.removeEventListener('message', handleSelectionResponse);
        reject(new Error("获取Office数据超时，请确保您的Office软件处于响应状态且活动工作簿/文档可编辑。"));
      }, 8000);
    });
  }, [connect, selectedApp, selectedWorkbook, selectedWorksheet, selectedDocument]);

  useEffect(() => {
    connect();
    
    let pingInterval: number | null = null;
    
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

  return { 
    isConnected, 
    isConnecting, 
    connect, 
    disconnect, 
    sendCode, 
    getSelection,
    runningApps, 
    selectedApp, 
    setSelectedApp, 
    selectedWorkbook,
    setSelectedWorkbook,
    selectedWorksheet,
    setSelectedWorksheet,
    selectedDocument,
    setSelectedDocument,
    refreshApps 
  };
}
