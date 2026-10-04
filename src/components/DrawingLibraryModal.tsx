import React, { useState, useEffect } from 'react';
import { 
  X, Folder, Image as ImageIcon, LayoutGrid, List, LayoutList, 
  Plus, Edit2, Trash2, ArrowUp, ArrowDown, Search, ArrowRightCircle, DownloadCloud, PenLine, Settings2, MessageSquarePlus, FolderOpen
} from 'lucide-react';
import { useDrawingLibrary, LibraryCategory, LibraryItem } from '../hooks/useDrawingLibrary';
import { useSettings } from '../hooks/useSettings';
import { ZoomableThumbnail } from './ZoomableThumbnail';

type ViewMode = 'NAME_ONLY' | 'NAME_DESC' | 'FULL';

function AsyncThumbnail({ item, useZoom = false }: { item: LibraryItem, useZoom?: boolean }) {
  const library = useDrawingLibrary();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const loadThumb = async () => {
      if (!library.hasDirPermission || !item.name) return;
      setLoading(true);
      
      try {
        const url = await library.readThumbnail(item.name);
        if (active && url) {
           setDataUrl(url);
        }
      } catch (e) {
        console.warn("Failed to load thumbnail", e);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadThumb();
    return () => { 
      active = false;
      if (dataUrl && dataUrl.startsWith('blob:')) {
         URL.revokeObjectURL(dataUrl);
      }
    };
  }, [item.name, library.hasDirPermission]);

  if (!library.hasDirPermission) {
    return <div className="flex flex-col items-center justify-center gap-2 w-full h-full p-2"><ImageIcon size={24} className="text-gray-300" /><span className="text-xs text-gray-400 text-center">文件夹未授权</span></div>;
  }

  if (loading && !dataUrl) {
    return <div className="animate-pulse w-full h-full bg-gray-200 flex items-center justify-center"><span className="text-gray-400 text-xs">加载中</span></div>;
  }
  
  if (!dataUrl) {
    return <div className="flex flex-col items-center justify-center gap-2 w-full h-full"><ImageIcon size={32} className="text-gray-300" /><span className="text-xs text-gray-400">无缩略图</span></div>;
  }

  if (useZoom) {
    return <ZoomableThumbnail src={dataUrl} />;
  }

  return <img src={dataUrl} alt="" className="w-full h-full object-contain" />;
}

interface DrawingLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  autoCad: any;
  onAttachToChat?: (attachment: {name: string, code: string, language: string}) => void;
}

export function DrawingLibraryModal({ isOpen, onClose, autoCad, onAttachToChat }: DrawingLibraryModalProps) {
  const library = useDrawingLibrary();
  const { settings, updateSettings } = useSettings();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('FULL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Category Edit State
  const [isEditingCat, setIsEditingCat] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [isAddingCat, setIsAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Item Edit/Add State
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [itemForm, setItemForm] = useState({ name: '', description: '', categoryId: 'uncategorized', thumbnail: '', data: null as any });
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDataReimported, setIsDataReimported] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [catToDelete, setCatToDelete] = useState<string | null>(null);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!isAddingItem && !editingItem) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => setItemForm(prev => ({ ...prev, thumbnail: e.target?.result as string }));
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isAddingItem, editingItem]);

  const handleReimport = async () => {
    try {
      setIsExtracting(true);
      const data = await autoCad.getSelection();
      if (!data || data.length === 0) {
        showMessage('获取图形失败：未选中任何对象。请在CAD中选中对象后再尝试。');
        return;
      }
      setItemForm(prev => ({ ...prev, data }));
      setIsDataReimported(true);
      showMessage('重新获取 CAD 图形成功！保存后将替换原文件。');
    } catch (error: any) {
      showMessage('获取图形失败: ' + error.message);
    } finally {
      setIsExtracting(false);
    }
  };

  if (!isOpen) return null;

  const filteredItems = library.items.filter(item => {
    if (activeCategory !== 'all' && item.categoryId !== activeCategory) return false;
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase()) && !item.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleSaveCat = (id: string) => {
    if (editCatName.trim()) library.updateCategory(id, editCatName.trim(), autoCad);
    setIsEditingCat(null);
  };

  const handleAddCat = () => {
    if (newCatName.trim()) {
      library.addCategory(newCatName.trim(), autoCad);
      setNewCatName('');
      setIsAddingCat(false);
    }
  };

  const generateDefaultThumb = () => {
    // Generate a random gradient SVG as placeholder for CAD block thumbnail
    const colors = [
      ['#2563eb', '#1d4ed8'], ['#16a34a', '#15803d'], ['#d97706', '#b45309'], 
      ['#db2777', '#be185d'], ['#8b5cf6', '#7c3aed']
    ];
    const pair = colors[Math.floor(Math.random() * colors.length)];
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23${pair[0].slice(1)}"/><stop offset="100%" stop-color="%23${pair[1].slice(1)}"/></linearGradient></defs><rect width="200" height="150" fill="url(%23g)"/><path d="M 50 75 L 100 25 L 150 75 L 100 125 Z" fill="white" opacity="0.8"/><text x="100" y="80" font-family="sans-serif" font-size="16" fill="white" text-anchor="middle" dominant-baseline="middle">CAD Block</text></svg>`;
  };

  const generateThumbFromData = (data: any[]) => {
    if (!data || !Array.isArray(data) || data.length === 0) return generateDefaultThumb();

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const paths: string[] = [];
    
    data.forEach((ent: any) => {
       const entType = ent.type || ent.ObjectName || '';
       let pts: number[][] = [];
       
       if (entType.includes('Line')) {
          const start = ent.startPoint || ent.StartPoint || ent.Start|| [0,0];
          const end = ent.endPoint || ent.EndPoint || ent.End || [0,0];
          pts.push(start);
          pts.push(end);
          paths.push(`<line x1="${start[0]}" y1="${start[1]}" x2="${end[0]}" y2="${end[1]}" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>`);
       } else if (entType.includes('Circle')) {
          const center = ent.center || ent.Center || [0,0];
          const r = ent.radius || ent.Radius || 1;
          pts.push([center[0]-r, center[1]-r]);
          pts.push([center[0]+r, center[1]+r]);
          paths.push(`<circle cx="${center[0]}" cy="${center[1]}" r="${r}" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" fill="none"/>`);
       } else if (entType.includes('Arc')) {
          const center = ent.center || ent.Center || [0,0];
          const r = ent.radius || ent.Radius || 1;
          const startAngle = ent.startAngle || ent.StartAngle || 0;
          const endAngle = ent.endAngle || ent.EndAngle || Math.PI*2;
          
          const startX = center[0] + r * Math.cos(startAngle);
          const startY = center[1] + r * Math.sin(startAngle);
          const endX = center[0] + r * Math.cos(endAngle);
          const endY = center[1] + r * Math.sin(endAngle);
          
          let sweepFlag = endAngle > startAngle ? 1 : 0;
          let largeArcFlag = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;

          pts.push([center[0]-r, center[1]-r]);
          pts.push([center[0]+r, center[1]+r]);

          paths.push(`<path d="M ${startX} ${startY} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" fill="none"/>`);
       } else if (entType.includes('Polyline') || ent.coordinates || ent.Coordinates) {
          const coords = ent.coordinates || ent.Coordinates || [];
          if (coords.length >= 2) {
             let d = `M ${coords[0]} ${coords[1]} `;
             for(let i=0; i<coords.length; i+=2) {
               pts.push([coords[i], coords[i+1]]);
               if (i > 0) d += `L ${coords[i]} ${coords[i+1]} `;
             }
             paths.push(`<path d="${d}" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" fill="none" stroke-linejoin="round"/>`);
          }
       } else {
          // Generic fallback for any entity: try to find anything that looks like a point
          let hasPoints = false;
          for (const key in ent) {
             if (Array.isArray(ent[key]) && ent[key].length >= 2 && typeof ent[key][0] === 'number') {
                const pt = [ent[key][0], ent[key][1]];
                pts.push(pt);
                paths.push(`<circle cx="${pt[0]}" cy="${pt[1]}" r="2" vector-effect="non-scaling-stroke" fill="currentColor"/>`);
                hasPoints = true;
             }
          }
          if (hasPoints && pts.length >= 2) {
             // Draw a bounding box around points
             let x1=Infinity, y1=Infinity, x2=-Infinity, y2=-Infinity;
             pts.forEach(p => {
               if (p[0]<x1) x1=p[0]; if (p[0]>x2) x2=p[0];
               if (p[1]<y1) y1=p[1]; if (p[1]>y2) y2=p[1];
             });
             paths.push(`<rect x="${x1}" y="${y1}" width="${x2-x1}" height="${y2-y1}" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="4" fill="none"/>`);
          }
       }
       
       pts.forEach(p => {
          if (p[0] < minX) minX = p[0];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[1] > maxY) maxY = p[1];
       });
    });

    if (minX === Infinity || isNaN(minX)) {
      return generateDefaultThumb();
    }

    const padding = Math.max((maxX - minX) * 0.1, (maxY - minY) * 0.1, 10);
    const vbWidth = (maxX - minX) + padding * 2;
    const vbHeight = (maxY - minY) + padding * 2;
    const vbMinX = minX - padding;
    const vbMinY = -(maxY + padding); // Flipped Y

    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbMinX} ${vbMinY} ${vbWidth} ${vbHeight}" width="100%" height="100%" style="background-color: #f1f5f9; color: #3b82f6;">
      <g transform="scale(1, -1)">
        ${paths.join('\n        ')}
      </g>
    </svg>`;
    
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
  };

  const generateLispFromData = (data: any[]): string => {
    let lisp = `(defun c:cadai_insert_temp ( / ) \n`;
    data.forEach(ent => {
       const entType = ent.type || ent.ObjectName || '';
       let entmakeStr = ``;
       
       if (entType.includes('Line')) {
          const start = ent.startPoint || ent.StartPoint || ent.Start;
          const end = ent.endPoint || ent.EndPoint || ent.End;
          if (start && end) {
             entmakeStr = `(entmake (list '(0 . "LINE") (list 10 ${start[0]} ${start[1]} ${start[2]||0}) (list 11 ${end[0]} ${end[1]} ${end[2]||0})))`;
          }
       } else if (entType.includes('Circle')) {
          const center = ent.center || ent.Center;
          const radius = ent.radius || ent.Radius;
          if (center && radius) {
             entmakeStr = `(entmake (list '(0 . "CIRCLE") (list 10 ${center[0]} ${center[1]} ${center[2]||0}) (cons 40 ${radius})))`;
          }
       } else if (entType.includes('Text')) {
          const insert = ent.insertionPoint || ent.InsertionPoint || ent.TextPosition;
          const text = ent.textString || ent.TextString;
          const height = ent.height || ent.Height || 2.5;
          if (insert && text) {
             entmakeStr = `(entmake (list '(0 . "TEXT") (list 10 ${insert[0]} ${insert[1]} ${insert[2]||0}) (cons 40 ${height}) (cons 1 "${text.replace(/"/g, '\\"')}")))`;
          }
       } else if (entType.includes('Polyline') || entType.includes('LwPolyline')) {
          const coords = ent.coordinates || ent.Coordinates;
          if (coords && coords.length >= 2) {
             entmakeStr = `(entmake (list '(0 . "LWPOLYLINE") '(100 . "AcDbEntity") '(100 . "AcDbPolyline") (cons 90 ${coords.length/2}) '(70 . 0)\n`;
             for(let i=0; i<coords.length; i+=2) {
               entmakeStr += `  (list 10 ${coords[i]} ${coords[i+1]})\n`;
             }
             entmakeStr += `))`;
          }
       }
       
       if(entmakeStr) {
         lisp += `  ${entmakeStr}\n`;
       }
    });
    lisp += `  (princ "\\n图块已插入！")\n  (princ)\n)\n(c:cadai_insert_temp)`;
    return lisp;
  };

  const extractFromCad = async () => {
    setIsExtracting(true);
    try {
      const data = await autoCad.getSelection();
      if (!data || data.length === 0) {
        showMessage('未在 CAD 中检测到选中对象。请先在 CAD 中选中图纸/图块。');
        setIsExtracting(false);
        return;
      }
      
      setItemForm({
        name: `图块 ${new Date().toLocaleTimeString()}`,
        description: `包含 ${data.length} 个实体对象`,
        categoryId: activeCategory === 'all' ? 'uncategorized' : activeCategory,
        thumbnail: '',
        data: data
      });
      setIsAddingItem(true);
    } catch (e: any) {
      showMessage('提取失败: ' + e.message);
    } finally {
      setIsExtracting(false);
    }
  };

  const saveDwgToDisk = async (name: string, data: any) => {
    if (!settings.libraryPath) {
      showMessage('未设置图库本地保存路径。本次仅记录 JSON 并在浏览器管理。');
      return;
    }
    try {
      const basePath = settings.libraryPath.replace(/\\/g, '/');
      const safeName = name.replace(/[/\\?%*:|"<>]/g, '_');
      const dwgPath = `${basePath}/${safeName}.dwg`;
      
      const handles = data.map((e: any) => e.handle || e.Handle).filter((h: any) => typeof h === 'string' && h.trim().length > 0);
      
      let ssLogic = `
  (setq ss (cadr (ssgetfirst)))
  (if (not ss) (setq ss (ssget "_P")))
  (if (not ss) (setq ss (ssget "_I")))`;

      if (handles.length > 0) {
         const handlesLst = handles.map((h: string) => `"${h}"`).join(' ');
         ssLogic = `
  (setq ss (ssadd))
  (foreach h '(${handlesLst})
    (if (and (setq e (handent h)) (entget e))
      (ssadd e ss)
    )
  )
  (if (= (sslength ss) 0)
    (progn
      (setq ss (cadr (ssgetfirst)))
      (if (not ss) (setq ss (ssget "_P")))
    )
  )`;
      }

      const lispCode = `(defun c:cadai_save_block ( / fname_dwg ss h e pt )
  (setq fname_dwg "${dwgPath}")
  ${ssLogic}
  (if ss
    (progn
      (setq pt (getpoint "\\n请在图纸中指定保存的基点(插入点) <默认 0,0,0>: "))
      (if (not pt) (setq pt '(0 0 0)))
      (vl-load-com)
      (if (findfile fname_dwg) (vl-file-delete fname_dwg))
      (command "_.UNDO" "_Mark")
      (command "_.WBLOCK" fname_dwg "" "_non" pt ss "")
      (command "_.UNDO" "_Back")
      (princ "\\n图库文件保存成功！")
    )
    (princ "\\n保存失败: 未找到刚才选中的图形。")
  )
  (princ)
)(c:cadai_save_block)`;

      await autoCad.sendCode(lispCode);
    } catch (error: any) {
      console.error('保存文件到本地失败:', error);
      showMessage('保存本地DWG文件失败: ' + error.message);
    }
  };

  const handleSaveItem = async () => {
    if (!itemForm.name.trim()) return;
    
    const saveThumbnailToDisk = async () => {
        if (itemForm.thumbnail && itemForm.thumbnail.startsWith('data:image')) {
            await library.writeThumbnail(itemForm.name, itemForm.thumbnail);
        }
    };
    
    if (editingItem) {
      await saveThumbnailToDisk();
      if (isDataReimported) {
        await saveDwgToDisk(itemForm.name, itemForm.data);
      }
      library.updateItem(editingItem.id, {
          ...itemForm,
          thumbnail: ''
      }, autoCad);
      setEditingItem(null);
      setIsDataReimported(false);
    } else {
      const itemId = `item_${crypto.randomUUID()}`;
      await saveDwgToDisk(itemForm.name, itemForm.data);
      await saveThumbnailToDisk();
      library.addItem({
        ...itemForm,
        thumbnail: '',
        id: itemId
      } as any, autoCad);
      setIsAddingItem(false);
      setIsDataReimported(false);
    }
  };

  const handleInsert = async (item: LibraryItem) => {
    try {
      if (settings.libraryPath) {
        const basePath = settings.libraryPath.replace(/\\/g, '/');
        const safeName = item.name.replace(/[/\\?%*:|"<>]/g, '_');
        const dwgPath = `${basePath}/${safeName}.dwg`;
        // Use pause for user to pick insertion point, scale 1 1, rotation 0
        const lispCode = `(if (findfile "${dwgPath}")
  (progn
    (setq insPt (getpoint "\\n请在图纸中指定插入点: "))
    (if insPt
      (progn
        (command "_.-INSERT" "${dwgPath}" "_non" insPt 1 1 0)
        (if (entlast) (command "_.EXPLODE" (entlast)))
        (command "_.-PURGE" "_B" "${safeName}" "_N")
        (princ "\\n图形插入并分解成功，原图块定义已清除！")
      )
    )
  )
  (princ "\\n未找到对应DWG文件，请检查本地目录。")
)(princ)`;
        await autoCad.sendCode(lispCode);
      } else if (item.data && Array.isArray(item.data)) {
        const lispCode = generateLispFromData(item.data);
        await autoCad.sendCode(lispCode);
      } else {
        showMessage('数据为空或无法解析，无法插入。');
      }
    } catch(e: any) {
      showMessage('插入失败: ' + e.message);
    }
  };

  const handleAttachToChat = (item: LibraryItem) => {
    if (!onAttachToChat) return;
    
    let pathInfo = '';
    if (settings.libraryPath) {
      const basePath = settings.libraryPath.replace(/\\/g, '/');
      const safeName = item.name.replace(/[/\\?%*:|"<>]/g, '_');
      pathInfo = `\n// [系统信息] 本地DWG文件路径: ${basePath}/${safeName}.dwg`;
    }
    
    const code = JSON.stringify(item.data, null, 2) + pathInfo;
    onAttachToChat({
      name: item.name,
      code: code,
      language: 'json'
    });
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-[64px] sm:top-[72px] z-40 flex items-center justify-center p-4 sm:p-6 drop-shadow-2xl opacity-100 transition-opacity">
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-white rounded-2xl w-full max-w-6xl h-[85vh] max-h-full flex flex-col shadow-2xl overflow-hidden relative z-10 border border-gray-200">
        
        {/* Messages */}
        {message && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-xl text-sm max-w-lg text-center font-medium animate-in slide-in-from-top-4 fade-in">
            {message}
          </div>
        )}
        
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shadow-inner">
               <Folder size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">图库管理</h2>
              <p className="text-xs text-gray-500">管理从CAD提取的图纸片段，快速归类与复用</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {!library.hasDirPermission && (
               <button
                  onClick={async () => {
                     const success = await library.requestDirHandle();
                     if (success) {
                        library.syncWithFile();
                        showMessage("授权成功，已同步本地图库！");
                     } else {
                        showMessage("授权失败，这可能导致缩略图无法显示和写入");
                     }
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-sm font-bold transition-all border border-amber-200 shadow-sm"
               >
                  <FolderOpen size={16} />
                  点击授权保存目录 (必填)
               </button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 font-medium">本地保存目录:</span>
              <input
                type="text"
                value={settings.libraryPath || ''}
                onChange={(e) => updateSettings({ libraryPath: e.target.value })}
                placeholder="D:\CAD_Library"
                className="w-48 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <label className="ml-1 px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg text-sm font-medium transition-colors border border-emerald-200 cursor-pointer">
                导入数据文件
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const success = await library.importFromFile(file);
                    if (success) {
                      showMessage('导入成功！');
                    } else {
                      showMessage('导入失败，文件格式不正确');
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                onClick={() => {
                  if (!settings.libraryPath) {
                    showMessage("请先输入本地保存目录！");
                    return;
                  }
                  library.saveToFile(library.categories, library.items);
                  showMessage('数据文件已下发保存到本地！');
                }}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors border border-indigo-200"
              >
                保存本地数据文件
              </button>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200/50 rounded-xl transition-colors">
              <X size={20} />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-64 border-r border-gray-100 bg-gray-50/30 flex flex-col">
            <div className="h-full overflow-y-auto p-4 custom-scrollbar">
               <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 pl-2">分类夹</h3>
               <button 
                  onClick={() => setActiveCategory('all')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeCategory === 'all' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
               >
                 <LayoutGrid size={16} /> <span className="flex-1 text-left">全部图块</span>
                 <span className="text-xs opacity-60">{library.items.length}</span>
               </button>
               <button 
                  onClick={() => setActiveCategory('uncategorized')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeCategory === 'uncategorized' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
               >
                 <Folder size={16} /> <span className="flex-1 text-left">未分类</span>
                 <span className="text-xs opacity-60">{library.items.filter(i => i.categoryId === 'uncategorized').length}</span>
               </button>

               <div className="mt-4 space-y-1">
                 {library.categories.map((cat, index) => (
                    <div key={cat.id} className={`group flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors ${activeCategory === cat.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-gray-100 text-gray-600'}`}>
                      {isEditingCat === cat.id ? (
                        <input 
                          autoFocus
                          value={editCatName}
                          onChange={e => setEditCatName(e.target.value)}
                          onBlur={() => handleSaveCat(cat.id)}
                          onKeyDown={e => e.key === 'Enter' && handleSaveCat(cat.id)}
                          className="flex-1 min-w-0 bg-white border border-indigo-300 rounded px-2 py-1 text-sm focus:outline-none"
                        />
                      ) : (
                        <div 
                          className="flex-1 flex items-center gap-2 cursor-pointer min-w-0"
                          onClick={() => setActiveCategory(cat.id)}
                        >
                           <Folder size={14} className={`shrink-0 ${activeCategory === cat.id ? 'text-indigo-500' : 'text-gray-400'}`} />
                           <span className="truncate text-sm flex-1">{cat.name}</span>
                           <span className={`text-xs opacity-60 group-hover:hidden`}>{library.items.filter(i => i.categoryId === cat.id).length}</span>
                        </div>
                      )}
                      
                      {isEditingCat !== cat.id && (
                        <div className="hidden group-hover:flex items-center gap-0.5">
                          <button onClick={() => library.reorderCategory(cat.id, 'up', autoCad)} disabled={index === 0} className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowUp size={12} /></button>
                          <button onClick={() => library.reorderCategory(cat.id, 'down', autoCad)} disabled={index === library.categories.length - 1} className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowDown size={12} /></button>
                          <button onClick={() => { setEditCatName(cat.name); setIsEditingCat(cat.id); }} className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-700"><Edit2 size={12} /></button>
                          <button onClick={() => setCatToDelete(cat.id)} className="p-1 hover:bg-red-100 rounded text-gray-400 hover:text-red-600"><Trash2 size={12} /></button>
                        </div>
                      )}
                    </div>
                 ))}

                 {isAddingCat ? (
                    <div className="px-2 py-2">
                       <input 
                          autoFocus
                          value={newCatName}
                          onChange={e => setNewCatName(e.target.value)}
                          onBlur={handleAddCat}
                          onKeyDown={e => e.key === 'Enter' && handleAddCat()}
                          placeholder="新分类名称"
                          className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400"
                        />
                    </div>
                 ) : (
                    <button 
                      onClick={() => setIsAddingCat(true)}
                      className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
                    >
                      <Plus size={14} /> 添加分类
                    </button>
                 )}
               </div>
            </div>
          </div>

          {/* Main Area */}
          <div className="flex-1 flex flex-col bg-white">
             {/* Toolbar */}
             <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <div className="flex gap-2">
                   <button 
                     onClick={extractFromCad}
                     disabled={isExtracting}
                     className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition shadow-sm disabled:opacity-70"
                   >
                     {isExtracting ? <Settings2 className="animate-spin" size={16} /> : <DownloadCloud size={16} />}
                     从CAD选区提取/收藏
                   </button>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                      type="text"
                      placeholder="搜索图库..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-64 bg-gray-50"
                    />
                  </div>
                  <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200/50">
                    <button 
                      onClick={() => setViewMode('NAME_ONLY')}
                      title="仅名称"
                      className={`p-1.5 rounded-md transition ${viewMode === 'NAME_ONLY' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <List size={16} />
                    </button>
                    <button 
                      onClick={() => setViewMode('NAME_DESC')}
                      title="列表模式 (名称+描述)"
                      className={`p-1.5 rounded-md transition ${viewMode === 'NAME_DESC' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <LayoutList size={16} />
                    </button>
                    <button 
                      onClick={() => setViewMode('FULL')}
                      title="网格模式 (含缩略图)"
                      className={`p-1.5 rounded-md transition ${viewMode === 'FULL' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <LayoutGrid size={16} />
                    </button>
                  </div>
                </div>
             </div>

             {/* Items Container */}
             <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
               {filteredItems.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <ImageIcon size={48} className="mb-4 opacity-50" />
                    <p>当前分类暂无收藏的图纸/图块</p>
                 </div>
               ) : (
                 <div className={`
                    ${viewMode === 'FULL' ? 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6' : 'flex flex-col gap-3'}
                 `}>
                   {filteredItems.map(item => (
                     <div 
                        key={item.id} 
                        className={`group bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all ${
                          viewMode !== 'FULL' ? 'flex items-center px-4 py-3' : 'flex flex-col'
                        }`}
                      >
                        {viewMode === 'FULL' && (
                          <div className="relative aspect-[4/3] bg-gray-50 flex items-center justify-center border-b border-gray-100 overflow-hidden">
                              {item.thumbnail ? (
                               item.thumbnail.startsWith('data:image') || item.thumbnail.length > 50 ? (
                                 <img src={item.thumbnail} alt="" className="w-full h-full object-contain" />
                               ) : (
                                 <AsyncThumbnail item={item} />
                               )
                             ) : (
                               <AsyncThumbnail item={item} />
                             )}
                             <div className="absolute inset-0 bg-gray-900/0 group-hover:bg-gray-900/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                               <button 
                                  onClick={() => handleInsert(item)}
                                  className="mx-2 p-2 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-500 hover:scale-105 transition-all"
                                  title="一键插入到CAD"
                               >
                                 <ArrowRightCircle size={24} />
                               </button>
                             </div>
                          </div>
                        )}
                        <div className={`p-4 flex-1 min-w-0 ${viewMode !== 'FULL' ? 'pr-4 flex items-center gap-4' : ''}`}>
                           <div className="flex-1 min-w-0">
                             <div className="flex items-start justify-between">
                               <h4 className="text-sm font-bold text-gray-900 truncate" title={item.name}>{item.name}</h4>
                             </div>
                             {viewMode !== 'NAME_ONLY' && (
                               <p className="text-xs text-gray-500 mt-1 line-clamp-2" title={item.description}>{item.description}</p>
                             )}
                           </div>
                           
                           <div className={`flex items-center gap-2 ${viewMode !== 'FULL' ? 'min-w-[140px]' : ''}`}>
                             {viewMode !== 'FULL' && (
                               <button 
                                  onClick={() => handleInsert(item)}
                                  className="px-3 py-1.5 flex flex-1 items-center justify-center gap-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-lg text-sm font-medium transition-colors"
                               >
                                  <ArrowRightCircle size={16} /> 插入
                               </button>
                             )}
                           </div>

                           <div className={`flex items-center justify-between gap-2 ${viewMode === 'FULL' ? 'mt-3' : 'ml-4 border-l pl-4 border-gray-100'}`}>
                             <select
                               value={item.categoryId}
                               onChange={(e) => library.updateItem(item.id, { categoryId: e.target.value }, autoCad)}
                               className="text-xs text-gray-500 bg-transparent border border-transparent hover:border-gray-200 hover:bg-gray-50 rounded px-1 py-1 min-w-0 flex-1 cursor-pointer focus:outline-none transition-colors"
                               title="更改所属分类"
                               onClick={(e) => e.stopPropagation()}
                             >
                               <option value="uncategorized">未分类</option>
                               {library.categories.map(c => (
                                 <option key={c.id} value={c.id}>{c.name}</option>
                               ))}
                             </select>
                             <div className="flex items-center gap-1">
                               {onAttachToChat && (
                                 <button
                                   onClick={() => handleAttachToChat(item)}
                                   className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition"
                                   title="发送到聊天作为上下文"
                                 ><MessageSquarePlus size={14}/></button>
                               )}
                               <button
                                 onClick={() => { setEditingItem(item); setItemForm({ name: item.name, description: item.description, categoryId: item.categoryId, thumbnail: item.thumbnail, data: item.data }); setIsDataReimported(false); }}
                                 className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                                 title="编辑信息"
                               ><PenLine size={14}/></button>
                               <button
                                 onClick={() => setItemToDelete(item.id)}
                                 className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                 title="删除"
                               ><Trash2 size={14}/></button>
                             </div>
                           </div>
                        </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>
          </div>
        </div>
      </div>

      {/* Editor / Add Modal (overlaps inner) */}
      {(isAddingItem || editingItem) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm rounded-2xl" onClick={() => { setIsAddingItem(false); setEditingItem(null); setIsDataReimported(false); }}/>
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl relative p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">{editingItem ? '编辑属性' : '保存到图库'}</h3>
              {editingItem && (
                <button
                  onClick={handleReimport}
                  disabled={isExtracting}
                  className="text-indigo-600 hover:text-indigo-700 text-sm font-medium flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <DownloadCloud size={16} />
                  {isExtracting ? '获取中...' : '重新导入图形'}
                </button>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">缩略图</label>
                  <a href="ms-screenclip:" className="cursor-pointer text-indigo-600 hover:text-indigo-700 text-xs font-medium flex items-center gap-1 transition-colors">
                     <ImageIcon size={14}/>
                     调用截图工具 (快捷键 Win+Shift+S)
                  </a>
                </div>
                {itemForm.thumbnail || editingItem ? (
                  <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200 relative group">
                     {itemForm.thumbnail && (itemForm.thumbnail.startsWith('data:image') || itemForm.thumbnail.length > 50) ? (
                       <ZoomableThumbnail src={itemForm.thumbnail} />
                     ) : (
                       <AsyncThumbnail item={{ name: editingItem ? editingItem.name : itemForm.name } as LibraryItem} useZoom />
                     )}
                     <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                         <span className="text-white text-sm font-medium">Ctrl+V 粘贴以替换缩略图</span>
                     </div>
                  </div>
                ) : (
                  <div className="aspect-video bg-gray-50 flex items-center justify-center rounded-lg border border-gray-200 border-dashed relative group">
                     <div className="flex flex-col items-center gap-3">
                       <ImageIcon size={32} className="text-gray-300 group-hover:text-indigo-400 transition-colors" />
                       <span className="text-gray-400 text-sm group-hover:text-indigo-500 transition-colors">截图后在此页面按 Ctrl+V 粘贴</span>
                     </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                <input 
                  type="text" 
                  value={itemForm.name} 
                  onChange={e => setItemForm({...itemForm, name: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="如: 会议桌 A"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <textarea 
                  value={itemForm.description} 
                  onChange={e => setItemForm({...itemForm, description: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[80px]"
                  placeholder="该图块的详细描述..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">所属分类</label>
                <select 
                  value={itemForm.categoryId} 
                  onChange={e => setItemForm({...itemForm, categoryId: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="uncategorized">未分类</option>
                  {library.categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex gap-3 justify-end">
              <button 
                onClick={() => { setIsAddingItem(false); setEditingItem(null); setIsDataReimported(false); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
              >取消</button>
              <button 
                onClick={handleSaveItem}
                disabled={!itemForm.name.trim()}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modals */}
      {itemToDelete && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setItemToDelete(null)}/>
          <div className="bg-white rounded-xl shadow-2xl p-6 relative z-10 max-w-sm w-full animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-gray-900 mb-2">确认删除？</h3>
            <p className="text-gray-500 text-sm mb-6">此操作将移除图库中的该项目，且不可恢复。</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setItemToDelete(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">取消</button>
              <button onClick={async () => {
                const item = library.items.find(i => i.id === itemToDelete);
                if (item && settings.libraryPath) {
                  const safeName = item.name.replace(/[/\\?%*:|"<>]/g, '_');
                  const basePath = settings.libraryPath.replace(/\\/g, '/');
                  const dwgPath = `${basePath}/${safeName}.dwg`;
                  
                  const lispCode = `(progn
                    (vl-load-com)
                    (if (findfile "${dwgPath}") (vl-file-delete "${dwgPath}"))
                    (princ)
                  )`;
                  autoCad.sendCode(lispCode).catch(() => {});
                  
                  await library.deleteThumbnail(item.name);
                }
                library.deleteItem(itemToDelete, autoCad); 
                setItemToDelete(null); 
              }} className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg text-sm font-medium">确认删除</button>
            </div>
          </div>
        </div>
      )}

      {catToDelete && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setCatToDelete(null)}/>
          <div className="bg-white rounded-xl shadow-2xl p-6 relative z-10 max-w-sm w-full animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-gray-900 mb-2">删除分类？</h3>
            <p className="text-gray-500 text-sm mb-6">该分类下的所有图块将被移至"未分类"。</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setCatToDelete(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">取消</button>
              <button onClick={() => { library.deleteCategory(catToDelete, autoCad); setCatToDelete(null); }} className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg text-sm font-medium">确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
