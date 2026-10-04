import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useSettings } from './useSettings';
import { saveDirectoryHandle, getDirectoryHandle, verifyDirectoryPermission } from '../lib/dirStorage';

export type LibraryCategory = {
  id: string;
  name: string;
  order: number;
};

export type LibraryItem = {
  id: string;
  categoryId: string; // 'uncategorized' for default
  name: string;
  description: string;
  thumbnail: string; // base64 or object URL
  data: any; 
  createdAt: number;
};

const DEFAULT_CATEGORIES: LibraryCategory[] = [
  { id: 'cat_1', name: '常用图块', order: 0 },
  { id: 'cat_2', name: '门窗/符号', order: 1 }
];

interface DrawingLibraryContextType {
  categories: LibraryCategory[];
  items: LibraryItem[];
  dirHandle: any | null;
  hasDirPermission: boolean;
  requestDirHandle: () => Promise<boolean>;
  addCategory: (name: string, autoCad?: any) => void;
  updateCategory: (id: string, name: string, autoCad?: any) => void;
  deleteCategory: (id: string, autoCad?: any) => void;
  reorderCategory: (id: string, direction: 'up' | 'down', autoCad?: any) => void;
  addItem: (item: Omit<LibraryItem, 'id' | 'createdAt'>, autoCad?: any) => void;
  updateItem: (id: string, updates: Partial<LibraryItem>, autoCad?: any) => void;
  deleteItem: (id: string, autoCad?: any) => void;
  syncWithFile: () => Promise<void>;
  saveToFile: (cats: LibraryCategory[], itms: LibraryItem[]) => Promise<void>;
  importFromFile: (file: File) => Promise<boolean>;
  readThumbnail: (itemName: string) => Promise<string | null>;
  writeThumbnail: (itemName: string, base64: string) => Promise<boolean>;
  deleteThumbnail: (itemName: string) => Promise<boolean>;
}

const DrawingLibraryContext = createContext<DrawingLibraryContextType | null>(null);

export function DrawingLibraryProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<LibraryCategory[]>([]);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [dirHandle, setDirHandle] = useState<any | null>(null);
  const [hasDirPermission, setHasDirPermission] = useState(false);
  const { settings } = useSettings();

  useEffect(() => {
    const savedCategories = localStorage.getItem('cadai_library_cats');
    const savedItems = localStorage.getItem('cadai_library_items');
    
    if (savedCategories) {
      setCategories(JSON.parse(savedCategories));
    } else {
      setCategories(DEFAULT_CATEGORIES);
    }
    
    if (savedItems) {
      setItems(JSON.parse(savedItems));
    }

    // Try to load dir handle
    getDirectoryHandle().then(async handle => {
      if (handle) {
        setDirHandle(handle);
        // Do not request permission automatically on load to avoid abrupt popups, 
        // wait for action. However, we can check if we already have it.
        const state = await (handle as any).queryPermission({ mode: 'readwrite' });
        if (state === 'granted') {
          setHasDirPermission(true);
        }
      }
    });

  }, []);

  const requestDirHandle = async () => {
    try {
      if (dirHandle && await verifyDirectoryPermission(dirHandle, 'readwrite')) {
         setHasDirPermission(true);
         return true;
      }
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      await saveDirectoryHandle(handle);
      setDirHandle(handle);
      setHasDirPermission(true);
      return true;
    } catch (e) {
      console.warn("Failed to get directory handle", e);
      return false;
    }
  };

  const saveToFile = async (newCats: LibraryCategory[], newItems: LibraryItem[]) => {
    if (!dirHandle || !(await verifyDirectoryPermission(dirHandle, 'readwrite'))) return;
    
    // We don't save thumbnails or CAD binary data in the JSON
    const itemsWithoutData = newItems.map(i => {
      const { data, thumbnail, ...rest } = i;
      return rest;
    });
    
    try {
      const payload = JSON.stringify({ categories: newCats, items: itemsWithoutData });
      const fileHandle = await dirHandle.getFileHandle('cadai_library_data.json', { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(payload);
      await writable.close();
    } catch(e) {
      console.warn("Failed to save JSON to disk via Fs API", e);
    }
  };

  const importFromFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.categories && parsed.items) {
        setCategories(parsed.categories);
        setItems(parsed.items);
        localStorage.setItem('cadai_library_cats', JSON.stringify(parsed.categories));
        localStorage.setItem('cadai_library_items', JSON.stringify(parsed.items));
        return true;
      }
      return false;
    } catch (e) {
      console.warn("Failed to parse JSON file", e);
      return false;
    }
  };

  const syncWithFile = async () => {
    if (!dirHandle || !(await verifyDirectoryPermission(dirHandle, 'readwrite'))) return;
    
    try {
      // Clean up any old .txt files from previous faulty versions
      for await (const entry of (dirHandle as any).values()) {
         if (entry.kind === 'file' && entry.name.startsWith('cadai_library_temp') && entry.name.endsWith('.txt')) {
             await (dirHandle as any).removeEntry(entry.name).catch(() => {});
         }
      }

      const fileHandle = await dirHandle.getFileHandle('cadai_library_data.json', { create: false });
      const file = await fileHandle.getFile();
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.categories && parsed.items) {
        setCategories(parsed.categories);
        setItems(parsed.items);
        localStorage.setItem('cadai_library_cats', JSON.stringify(parsed.categories));
        localStorage.setItem('cadai_library_items', JSON.stringify(parsed.items));
      }
    } catch (e) {
      console.warn("Failed to sync JSON from disk via Fs API", e);
    }
  };

  const writeThumbnail = async (itemName: string, base64: string) => {
    if (!dirHandle || !(await verifyDirectoryPermission(dirHandle, 'readwrite'))) return false;
    try {
      const safeName = itemName.replace(/[/\\?%*:|"<>]/g, '_');
      const fileHandle = await dirHandle.getFileHandle(`${safeName}.png`, { create: true });
      const writable = await fileHandle.createWritable();
      
      const b64Data = base64.split(',')[1] || base64;
      const bstr = atob(b64Data);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while(n--){
          u8arr[n] = bstr.charCodeAt(n);
      }
      
      await writable.write(u8arr);
      await writable.close();
      return true;
    } catch(e) {
      console.warn("Failed to write thumbnail", e);
      return false;
    }
  };

  const readThumbnail = async (itemName: string) => {
    if (!dirHandle || !(await verifyDirectoryPermission(dirHandle, 'readwrite'))) return null;
    try {
      const safeName = itemName.replace(/[/\\?%*:|"<>]/g, '_');
      const fileHandle = await dirHandle.getFileHandle(`${safeName}.png`, { create: false });
      const file = await fileHandle.getFile();
      return URL.createObjectURL(file);
    } catch (e) {
      return null;
    }
  };

  const deleteThumbnail = async (itemName: string) => {
    if (!dirHandle || !(await verifyDirectoryPermission(dirHandle, 'readwrite'))) return false;
    try {
      const safeName = itemName.replace(/[/\\?%*:|"<>]/g, '_');
      await dirHandle.removeEntry(`${safeName}.png`);
      return true;
    } catch (e) {
      return false;
    }
  };


  const saveCats = (newCats: LibraryCategory[], autoCad?: any) => {
    setCategories(newCats);
    localStorage.setItem('cadai_library_cats', JSON.stringify(newCats));
    if (autoCad) saveToFile(newCats, items);
  };

  const saveItems = (newItems: LibraryItem[], autoCad?: any) => {
    setItems(newItems);
    const itemsWithoutData = newItems.map(i => {
      const { data, ...rest } = i;
      return rest;
    });
    localStorage.setItem('cadai_library_items', JSON.stringify(itemsWithoutData));
    if (autoCad) saveToFile(categories, newItems);
  };

  const addCategory = (name: string, autoCad?: any) => {
    const newCategory: LibraryCategory = {
      id: `cat_${crypto.randomUUID()}`,
      name,
      order: categories.length
    };
    saveCats([...categories, newCategory], autoCad);
  };

  const updateCategory = (id: string, name: string, autoCad?: any) => {
    saveCats(categories.map(c => c.id === id ? { ...c, name } : c), autoCad);
  };

  const deleteCategory = (id: string, autoCad?: any) => {
    saveCats(categories.filter(c => c.id !== id), autoCad);
    saveItems(items.map(i => i.categoryId === id ? { ...i, categoryId: 'uncategorized' } : i), autoCad);
  };

  const reorderCategory = (id: string, direction: 'up' | 'down', autoCad?: any) => {
    const index = categories.findIndex(c => c.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === categories.length - 1) return;

    const newCats = [...categories];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Swap orders
    const tempOrder = newCats[index].order;
    newCats[index].order = newCats[targetIndex].order;
    newCats[targetIndex].order = tempOrder;

    // Swap positions
    const temp = newCats[index];
    newCats[index] = newCats[targetIndex];
    newCats[targetIndex] = temp;

    saveCats(newCats, autoCad);
  };

  const addItem = (item: Omit<LibraryItem, 'id' | 'createdAt'>, autoCad?: any) => {
    const newItem: LibraryItem = {
      ...item,
      id: `item_${crypto.randomUUID()}`,
      createdAt: Date.now()
    };
    saveItems([...items, newItem], autoCad);
  };

  const updateItem = (id: string, updates: Partial<LibraryItem>, autoCad?: any) => {
    saveItems(items.map(i => i.id === id ? { ...i, ...updates } : i), autoCad);
  };

  const deleteItem = (id: string, autoCad?: any) => {
    saveItems(items.filter(i => i.id !== id), autoCad);
  };

  return (
    <DrawingLibraryContext.Provider value={{
      categories, items,
      dirHandle, hasDirPermission, requestDirHandle,
      addCategory, updateCategory, deleteCategory, reorderCategory,
      addItem, updateItem, deleteItem,
      syncWithFile, saveToFile, importFromFile, readThumbnail, writeThumbnail, deleteThumbnail
    }}>
      {children}
    </DrawingLibraryContext.Provider>
  );
}

export function useDrawingLibrary() {
  const context = useContext(DrawingLibraryContext);
  if (!context) {
    throw new Error('useDrawingLibrary must be used within DrawingLibraryProvider');
  }
  return context;
}

