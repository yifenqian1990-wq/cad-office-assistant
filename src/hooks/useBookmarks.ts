import { useState, useEffect, useCallback } from 'react';
import * as idb from 'idb-keyval';

export interface BookmarkCategory {
  id: string;
  name: string;
}

export interface Bookmark {
  id: string;
  name: string;
  categoryId: string;
  code: string;
  language: string;
  createdAt: number;
  lastUsed?: number;
  history?: { role: string; content: string }[];
  description?: string;
}

export function useBookmarks(activeModule: 'CAD' | 'OFFICE' = 'CAD') {
  // --- CAD STATES ---
  const [cadCategories, setCadCategories] = useState<BookmarkCategory[]>(() => {
    const saved = localStorage.getItem('autocad_ai_bookmark_categories');
    return saved ? JSON.parse(saved) : [{ id: 'default', name: '默认分类' }];
  });

  const [cadBookmarks, setCadBookmarks] = useState<Bookmark[]>(() => {
    const saved = localStorage.getItem('autocad_ai_bookmarks');
    return saved ? JSON.parse(saved) : [];
  });

  const [cadFileHandle, setCadFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [cadHandleNeedsPermission, setCadHandleNeedsPermission] = useState(false);

  // --- OFFICE STATES ---
  const [officeCategories, setOfficeCategories] = useState<BookmarkCategory[]>(() => {
    const saved = localStorage.getItem('office_ai_bookmark_categories');
    return saved ? JSON.parse(saved) : [{ id: 'default', name: '默认分类' }];
  });

  const [officeBookmarks, setOfficeBookmarks] = useState<Bookmark[]>(() => {
    const saved = localStorage.getItem('office_ai_bookmarks');
    return saved ? JSON.parse(saved) : [];
  });

  const [officeFileHandle, setOfficeFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [officeHandleNeedsPermission, setOfficeHandleNeedsPermission] = useState(false);

  // --- Derived current active states ---
  const categories = activeModule === 'OFFICE' ? officeCategories : cadCategories;
  const bookmarks = activeModule === 'OFFICE' ? officeBookmarks : cadBookmarks;
  const fileHandle = activeModule === 'OFFICE' ? officeFileHandle : cadFileHandle;
  const handleNeedsPermission = activeModule === 'OFFICE' ? officeHandleNeedsPermission : cadHandleNeedsPermission;

  const markAsUsed = useCallback((id: string) => {
    if (activeModule === 'OFFICE') {
      setOfficeBookmarks(prev => prev.map(b => b.id === id ? { ...b, lastUsed: Date.now() } : b));
    } else {
      setCadBookmarks(prev => prev.map(b => b.id === id ? { ...b, lastUsed: Date.now() } : b));
    }
  }, [activeModule]);

  const recentBookmarks = [...bookmarks]
    .filter(b => b.lastUsed)
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
    .slice(0, 10);

  // --- Load CAD file handle on mount ---
  useEffect(() => {
    const loadFromHandle = async () => {
      try {
        const handle = await idb.get<any>('autocad_ai_bookmarks_handle');
        if (handle) {
          const permission = await handle.queryPermission({ mode: 'readwrite' });
          if (permission === 'granted') {
            const file = await handle.getFile();
            const text = await file.text();
            const data = JSON.parse(text);
            if (data.categories && data.bookmarks) {
              setCadCategories(data.categories);
              setCadBookmarks(data.bookmarks);
              setCadFileHandle(handle);
            }
          } else {
            setCadHandleNeedsPermission(true);
          }
        }
      } catch (err) {
        console.error("Failed to load CAD handle", err);
      }
    };
    loadFromHandle();
  }, []);

  // --- Load Office file handle on mount ---
  useEffect(() => {
    const loadFromHandle = async () => {
      try {
        const handle = await idb.get<any>('office_ai_bookmarks_handle');
        if (handle) {
          const permission = await handle.queryPermission({ mode: 'readwrite' });
          if (permission === 'granted') {
            const file = await handle.getFile();
            const text = await file.text();
            const data = JSON.parse(text);
            if (data.categories && data.bookmarks) {
              setOfficeCategories(data.categories);
              setOfficeBookmarks(data.bookmarks);
              setOfficeFileHandle(handle);
            }
          } else {
            setOfficeHandleNeedsPermission(true);
          }
        }
      } catch (err) {
        console.error("Failed to load Office handle", err);
      }
    };
    loadFromHandle();
  }, []);

  const reconnectFile = async () => {
    try {
      const handleKey = activeModule === 'OFFICE' ? 'office_ai_bookmarks_handle' : 'autocad_ai_bookmarks_handle';
      const handle = await idb.get<any>(handleKey);
      if (handle) {
        const perm = await handle.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          const file = await handle.getFile();
          const text = await file.text();
          const data = JSON.parse(text);
          if (data.categories && data.bookmarks) {
            if (activeModule === 'OFFICE') {
              setOfficeCategories(data.categories);
              setOfficeBookmarks(data.bookmarks);
              setOfficeFileHandle(handle);
              setOfficeHandleNeedsPermission(false);
            } else {
              setCadCategories(data.categories);
              setCadBookmarks(data.bookmarks);
              setCadFileHandle(handle);
              setCadHandleNeedsPermission(false);
            }
          }
        }
      }
    } catch (err) {
      console.error("恢复连接失败", err);
    }
  };

  const saveToDisk = useCallback(async (cats: BookmarkCategory[], bmarks: Bookmark[], handle: FileSystemFileHandle | null) => {
    if (!handle) return;
    try {
      if ((await (handle as any).queryPermission({ mode: 'readwrite' })) === 'granted') {
        const writable = await (handle as any).createWritable();
        await writable.write(JSON.stringify({ categories: cats, bookmarks: bmarks }, null, 2));
        await writable.close();
      }
    } catch (err) {
      console.error("Failed to write to file handle", err);
    }
  }, []);

  // --- Combined Auto-Save CAD ---
  useEffect(() => {
    localStorage.setItem('autocad_ai_bookmark_categories', JSON.stringify(cadCategories));
    if (cadFileHandle) saveToDisk(cadCategories, cadBookmarks, cadFileHandle);
  }, [cadCategories, cadBookmarks, cadFileHandle, saveToDisk]);

  useEffect(() => {
    localStorage.setItem('autocad_ai_bookmarks', JSON.stringify(cadBookmarks));
  }, [cadBookmarks]);

  // --- Combined Auto-Save Office ---
  useEffect(() => {
    localStorage.setItem('office_ai_bookmark_categories', JSON.stringify(officeCategories));
    if (officeFileHandle) saveToDisk(officeCategories, officeBookmarks, officeFileHandle);
  }, [officeCategories, officeBookmarks, officeFileHandle, saveToDisk]);

  useEffect(() => {
    localStorage.setItem('office_ai_bookmarks', JSON.stringify(officeBookmarks));
  }, [officeBookmarks]);

  const addCategory = (name: string) => {
    const id = crypto.randomUUID();
    if (activeModule === 'OFFICE') {
      setOfficeCategories(prev => [...prev, { id, name }]);
    } else {
      setCadCategories(prev => [...prev, { id, name }]);
    }
    return id;
  };

  const deleteCategory = (id: string) => {
    if (id === 'default') return; // protect default
    if (activeModule === 'OFFICE') {
      setOfficeCategories(prev => prev.filter(c => c.id !== id));
      setOfficeBookmarks(prev => prev.map(b => b.categoryId === id ? { ...b, categoryId: 'default' } : b));
    } else {
      setCadCategories(prev => prev.filter(c => c.id !== id));
      setCadBookmarks(prev => prev.map(b => b.categoryId === id ? { ...b, categoryId: 'default' } : b));
    }
  };

  const addBookmark = (bookmark: Omit<Bookmark, 'id' | 'createdAt'>) => {
    const newBookmark = {
      ...bookmark,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    if (activeModule === 'OFFICE') {
      setOfficeBookmarks(prev => [...prev, newBookmark]);
    } else {
      setCadBookmarks(prev => [...prev, newBookmark]);
    }
  };

  const deleteBookmark = (id: string) => {
    if (activeModule === 'OFFICE') {
      setOfficeBookmarks(prev => prev.filter(b => b.id !== id));
    } else {
      setCadBookmarks(prev => prev.filter(b => b.id !== id));
    }
  };

  const updateBookmark = (id: string, updates: Partial<Bookmark>) => {
    if (activeModule === 'OFFICE') {
      setOfficeBookmarks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    } else {
      setCadBookmarks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    }
  };

  const updateCategory = (id: string, name: string) => {
    if (activeModule === 'OFFICE') {
      setOfficeCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
    } else {
      setCadCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
    }
  };

  const exportBookmarks = async () => {
    const data = { categories, bookmarks };
    const prefix = activeModule === 'OFFICE' ? 'office_ai' : 'autocad_ai';
    const suggestedName = `${prefix}_bookmarks_${new Date().toISOString().slice(0, 10)}.json`;
    const handleKey = activeModule === 'OFFICE' ? 'office_ai_bookmarks_handle' : 'autocad_ai_bookmarks_handle';
    
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName,
          types: [{
            description: 'JSON File',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
        
        await idb.set(handleKey, handle);
        if (activeModule === 'OFFICE') {
          setOfficeFileHandle(handle);
        } else {
          setCadFileHandle(handle);
        }
        alert('文件已保存并建立热连接');
      } else {
        // Fallback
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = suggestedName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error("Export failed", err);
      }
    }
  };

  const importBookmarks = async (file?: File) => {
    const handleKey = activeModule === 'OFFICE' ? 'office_ai_bookmarks_handle' : 'autocad_ai_bookmarks_handle';
    if (file) {
      // Legacy or drag-and-drop fallback
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (data.categories && data.bookmarks) {
            if (activeModule === 'OFFICE') {
              setOfficeCategories(data.categories);
              setOfficeBookmarks(data.bookmarks);
            } else {
              setCadCategories(data.categories);
              setCadBookmarks(data.bookmarks);
            }
          }
        } catch (err) {
          alert('导入失败，文件格式不正确');
        }
      };
      reader.readAsText(file);
      return;
    }

    try {
      if ('showOpenFilePicker' in window) {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{
            description: 'JSON File',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const openedFile = await handle.getFile();
        const text = await openedFile.text();
        const data = JSON.parse(text);
        if (data.categories && data.bookmarks) {
          if (activeModule === 'OFFICE') {
            setOfficeCategories(data.categories);
            setOfficeBookmarks(data.bookmarks);
            setOfficeFileHandle(handle);
          } else {
            setCadCategories(data.categories);
            setCadBookmarks(data.bookmarks);
            setCadFileHandle(handle);
          }
          await idb.set(handleKey, handle);
          alert('导入成功并建立热连接');
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error("Import failed", err);
        alert('导入失败，文件格式不正确');
      }
    }
  };

  return {
    categories,
    bookmarks,
    addCategory,
    deleteCategory,
    updateCategory,
    addBookmark,
    deleteBookmark,
    updateBookmark,
    exportBookmarks,
    importBookmarks,
    recentBookmarks,
    markAsUsed,
    handleNeedsPermission,
    reconnectFile,
    fileHandleName: fileHandle?.name
  };
}
