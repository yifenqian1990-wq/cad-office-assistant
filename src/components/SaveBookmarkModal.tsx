import React, { useState, useEffect } from 'react';
import { useBookmarks } from '../hooks/useBookmarks';
import { X, Save } from 'lucide-react';

interface SaveBookmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  language: string;
  history?: { role: string; content: string }[];
  bookmarksState: ReturnType<typeof useBookmarks>;
}

export function SaveBookmarkModal({ isOpen, onClose, code, language, history, bookmarksState }: SaveBookmarkModalProps) {
  const { categories, addBookmark, addCategory } = bookmarksState;
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('default');
  const [newCatName, setNewCatName] = useState('');
  const [isNewCat, setIsNewCat] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setCategoryId('default');
      setIsNewCat(false);
      setNewCatName('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name.trim()) return;
    
    let targetCatId = categoryId;
    if (isNewCat && newCatName.trim()) {
      targetCatId = addCategory(newCatName.trim());
    }

    addBookmark({
      name: name.trim(),
      categoryId: targetCatId,
      code,
      language,
      history
    });
    
    onClose();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-[64px] sm:top-[72px] z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white border border-gray-200 w-full max-w-md rounded-2xl shadow-2xl relative max-h-[calc(100%-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Save size={18} className="text-blue-500" />
            收藏代码片段
          </h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-900 p-1 rounded-lg hover:bg-gray-200">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">代码名称</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如: 画矩形助手"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">选择分类</label>
            {!isNewCat ? (
              <div className="flex items-center gap-2">
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button 
                  onClick={() => setIsNewCat(true)}
                  className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:text-gray-900 hover:bg-gray-200"
                >
                  新分类
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  placeholder="输入新分类名称..."
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button 
                  onClick={() => setIsNewCat(false)}
                  className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:text-gray-900 hover:bg-gray-200"
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-100/50 border-t border-gray-200 flex items-center justify-end gap-3 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            取消
          </button>
          <button 
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            保存收藏
          </button>
        </div>
      </div>
    </div>
  );
}
