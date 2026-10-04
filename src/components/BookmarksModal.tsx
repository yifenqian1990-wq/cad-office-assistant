import React, { useState } from 'react';
import { BookmarkCategory, Bookmark, useBookmarks } from '../hooks/useBookmarks';
import { X, Folder, Plus, Trash2, Search, Code2, PlusCircle, Check, MessageSquare, Copy, Send, Edit2, Play, Download } from 'lucide-react';
import { useAutoCadSync } from '../hooks/useAutoCadSync';
import { useOfficeSync } from '../hooks/useOfficeSync';
import { downloadAsAnsi } from '../lib/downloadAnsi';

interface BookmarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertContext: (bookmark: { name: string, code: string, language: string }) => void;
  bookmarksState: ReturnType<typeof useBookmarks>;
  autoCad: ReturnType<typeof useAutoCadSync>;
  office: ReturnType<typeof useOfficeSync>;
  activeModule: 'CAD' | 'OFFICE';
}

export function BookmarksModal({ isOpen, onClose, onInsertContext, bookmarksState, autoCad, office, activeModule }: BookmarksModalProps) {
  const { categories, bookmarks, addCategory, deleteCategory, updateCategory, deleteBookmark, updateBookmark, addBookmark, exportBookmarks, importBookmarks, handleNeedsPermission, reconnectFile, fileHandleName, markAsUsed } = bookmarksState;
  const { sendCode, isConnected } = autoCad;
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [viewingContextId, setViewingContextId] = useState<string | null>(null);
  const [editingBookmarkData, setEditingBookmarkData] = useState<{ id?: string, name: string, code: string, description: string, categoryId: string, language: string } | null>(null);
  const [viewMode, setViewMode] = useState<'compact' | 'preview' | 'full'>('preview');

  React.useEffect(() => {
    if (activeCategory !== 'all' && !categories.some(c => c.id === activeCategory)) {
      setActiveCategory('all');
    }
  }, [categories, activeCategory]);

  if (!isOpen) return null;

  const filteredByModuleBookmarks = bookmarks;

  const filteredBookmarks = filteredByModuleBookmarks.filter(b => 
    (activeCategory === 'all' || b.categoryId === activeCategory) &&
    (b.name.toLowerCase().includes(searchQuery.toLowerCase()) || b.code.toLowerCase().includes(searchQuery.toLowerCase()))
  ).sort((a, b) => {
    if (sortBy === 'date') return b.createdAt - a.createdAt;
    return a.name.localeCompare(b.name);
  });

  const handleCopy = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadLsp = (bookmark: Bookmark) => {
    try {
      let fileName = bookmark.name.trim() || 'script';
      const isPython = (bookmark.language || '').toLowerCase() === 'python';
      const isVba = (bookmark.language || '').toLowerCase() === 'vba' || (bookmark.language || '').toLowerCase() === 'vb';
      const ext = isVba ? '.bas' : (isPython ? '.py' : '.lsp');
      
      if (!fileName.toLowerCase().endsWith(ext)) {
        fileName += ext;
      }
      
      if (ext === '.lsp' || ext === '.bas') {
        downloadAsAnsi(bookmark.code, fileName);
      } else {
        const blob = new Blob([bookmark.code], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      alert('下载文件失败: ' + err.message);
    }
  };

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      const id = addCategory(newCategoryName.trim());
      setActiveCategory(id);
    }
    setNewCategoryName('');
    setIsAddingCategory(false);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importBookmarks(file);
      e.target.value = ''; // Reset
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-[64px] sm:top-[72px] z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white border border-gray-200 w-full max-w-6xl h-[85vh] max-h-full rounded-2xl shadow-2xl flex overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-200 transition-colors z-10"
        >
          <X size={20} />
        </button>

        {/* Sidebar */}
        <div className="w-64 border-r border-gray-200 bg-gray-100 flex flex-col pt-16">
          <div className="px-4 pb-4">
            <h2 className="text-lg font-bold text-gray-900 mb-4">收藏库</h2>
            <div className="space-y-1">
              <button
                onClick={() => setActiveCategory('all')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeCategory === 'all' ? 'bg-blue-600/20 text-blue-600' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200/50'
                }`}
              >
                <Folder size={16} />
                全部代码 ({filteredByModuleBookmarks.length})
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {handleNeedsPermission && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800 mb-2 font-medium">需要恢复本地数据文件连接</p>
                <button
                  onClick={reconnectFile}
                  className="w-full px-3 py-1.5 text-xs font-medium bg-amber-100 hover:bg-amber-200 text-amber-900 rounded transition-colors"
                >
                  点击恢复自动同步
                </button>
              </div>
            )}
            {!handleNeedsPermission && fileHandleName && (
               <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
                 <div className="flex items-center gap-1.5 text-green-700 text-xs font-medium mb-1">
                   <Check size={12} /> 已连接本地同步文件
                 </div>
                 <p className="text-[10px] text-green-600 truncate" title={fileHandleName}>{fileHandleName}</p>
               </div>
            )}

            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">分类</span>
              <button 
                onClick={() => setIsAddingCategory(true)}
                className="text-gray-600 hover:text-gray-900"
              >
                <Plus size={14} />
              </button>
            </div>
            
            {isAddingCategory && (
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  autoFocus
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                  onBlur={() => handleAddCategory()}
                  placeholder="分类名称..."
                  className="flex-1 bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            <div className="space-y-1">
              {categories.map(cat => {
                const count = filteredByModuleBookmarks.filter(b => b.categoryId === cat.id).length;
                return (
                  <div key={cat.id} className="group flex items-center justify-between">
                    {editingCategoryId === cat.id ? (
                        <div className="flex-1 flex items-center px-3 py-2">
                             <input
                                autoFocus
                                value={cat.name}
                                onChange={e => updateCategory(cat.id, e.target.value)}
                                onBlur={() => setEditingCategoryId(null)}
                                onKeyDown={e => e.key === 'Enter' && setEditingCategoryId(null)}
                                className="flex-1 bg-white border border-blue-500 rounded px-2 py-0.5 text-sm text-gray-800 outline-none w-full"
                             />
                        </div>
                    ) : (
                        <button
                          onClick={() => setActiveCategory(cat.id)}
                          onDoubleClick={() => setEditingCategoryId(cat.id)}
                          className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            activeCategory === cat.id ? 'bg-blue-600/20 text-blue-600' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200/50'
                          }`}
                        >
                          <span className="truncate">{cat.name}</span>
                          <span className="text-xs text-gray-500 opacity-50 ml-auto">{count}</span>
                        </button>
                    )}
                    {editingCategoryId !== cat.id && (
                      <div className="flex items-center gap-1 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingCategoryId(cat.id)}
                          className="p-1.5 text-gray-500 hover:text-blue-600"
                          title="编辑分类"
                        >
                          <Edit2 size={12} />
                        </button>
                        {cat.id !== 'default' && (
                          <button
                            onClick={() => deleteCategory(cat.id)}
                            className="p-1.5 text-gray-500 hover:text-red-400"
                            title="删除分类"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col bg-gray-50 pt-16 pr-12">
          <div className="px-6 pb-4 flex flex-col gap-4 border-b border-gray-200">
            <div className="relative w-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="搜索收藏的代码..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-800 focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-stone-600 shadow-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm w-full">
                <button
                    onClick={() => setEditingBookmarkData({ name: '', code: '', description: '', categoryId: 'default', language: activeModule === 'OFFICE' ? 'vba' : 'lisp' })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white border border-transparent rounded transition-colors"
                >
                    <Plus size={14} />
                    手动录入
                </button>
                <div className="w-px h-6 bg-gray-300 mx-2"></div>
                <button
                    onClick={exportBookmarks}
                    className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded transition-colors"
                >
                    另存/创建同步数据
                </button>
                {'showOpenFilePicker' in window ? (
                  <button
                      onClick={() => importBookmarks()}
                      className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded transition-colors"
                  >
                      连接本地数据文件
                  </button>
                ) : (
                  <label className="px-3 py-1.5 text-xs font-medium bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded transition-colors cursor-pointer">
                      导入数据
                      <input type="file" accept=".json" className="hidden" onChange={handleFileImport} />
                  </label>
                )}
              <div className="w-px h-6 bg-gray-300 mx-2"></div>
              <span className="text-gray-500">显示:</span>
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as 'compact' | 'preview' | 'full')}
                className="bg-white border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none focus:border-gray-400"
              >
                <option value="compact">仅名称</option>
                <option value="preview">名称和描述</option>
                <option value="full">全部</option>
              </select>
              <div className="w-px h-6 bg-gray-300 mx-2"></div>
              <span className="text-gray-500">排序:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'date' | 'name')}
                className="bg-white border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none focus:border-gray-400"
              >
                <option value="date">按日期</option>
                <option value="name">按名称</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {filteredBookmarks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500">
                <Code2 size={48} className="mb-4 opacity-20" />
                <p>暂无收藏的代码</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredBookmarks.map(bookmark => {
                  const category = categories.find(c => c.id === bookmark.categoryId);
                  const date = new Date(bookmark.createdAt).toLocaleDateString();
                  const description = bookmark.description !== undefined ? bookmark.description : (bookmark.history?.find(h => h.role === 'user')?.content || bookmark.code.split('\n').slice(0, 2).join('\n'));
                  
                  return (
                    <div key={bookmark.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col group/card shadow-sm hover:shadow-md transition-shadow">
                      <div className={`px-3 py-2 flex flex-col gap-1.5 bg-gray-100/30 ${viewMode !== 'compact' ? 'border-b border-gray-200/50' : ''}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 overflow-hidden">
                                <h3 className="font-medium text-gray-800 truncate flex-1 flex items-center gap-2 text-sm">
                                  {bookmark.name}
                                  {viewMode === 'full' && bookmark.history && bookmark.history.length > 0 && (
                                    <button 
                                      onClick={() => setViewingContextId(viewingContextId === bookmark.id ? null : bookmark.id)}
                                      className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${viewingContextId === bookmark.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}
                                      title="查看上下文"
                                    >
                                      <MessageSquare size={12} />
                                      {viewingContextId === bookmark.id ? '隐藏上下文' : '上下文'}
                                    </button>
                                  )}
                                </h3>
                          </div>
                          
                          <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity ml-2">
                            <button
                                onClick={() => handleCopy(bookmark.id, bookmark.code)}
                                className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded transition-colors"
                                title="复制"
                            >
                                {copiedId === bookmark.id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                            </button>
                            <button
                                onClick={() => handleDownloadLsp(bookmark)}
                                className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded transition-colors"
                                title="下载LSP文件"
                            >
                                <Download size={14} />
                            </button>
                            <button
                                onClick={async () => {
                                  try {
                                    if (activeModule === 'OFFICE') {
                                      await office.sendCode(bookmark.code);
                                    } else {
                                      await sendCode(bookmark.code);
                                    }
                                    markAsUsed(bookmark.id);
                                  } catch (err: any) {
                                    alert(err.message || '发送失败');
                                  }
                                }}
                                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title={activeModule === 'OFFICE' ? "发送到 Office/WPS" : "发送到 CAD"}
                            >
                                <Play size={14} />
                            </button>
                            <div className="w-px h-4 bg-gray-300 mx-1 border-r"></div>
                            <button
                                onClick={() => setEditingBookmarkData({
                                  id: bookmark.id,
                                  name: bookmark.name,
                                  code: bookmark.code,
                                  description: bookmark.description !== undefined ? bookmark.description : (bookmark.history?.find(h => h.role === 'user')?.content || bookmark.code.split('\n').slice(0, 2).join('\n')),
                                  categoryId: bookmark.categoryId || 'default',
                                  language: bookmark.language || 'lisp'
                                })}
                                className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded transition-colors"
                                title="编辑内容"
                            >
                                <Edit2 size={14} />
                            </button>
                            <button
                                onClick={() => deleteBookmark(bookmark.id)}
                                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-50 rounded transition-colors"
                                title="删除"
                            >
                                <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-0.5">
                           <span className="text-[9px] uppercase font-bold tracking-wider text-blue-600 bg-blue-100 px-1 py-0.5 rounded-sm">
                            {bookmark.language || 'code'}
                           </span>
                           <div className="flex items-center gap-1">
                             <select
                               className="text-xs text-gray-500 bg-transparent hover:bg-gray-200 py-0.5 px-0.5 rounded border-none outline-none cursor-pointer"
                               value={bookmark.categoryId || 'default'}
                               onChange={(e) => updateBookmark(bookmark.id, { categoryId: e.target.value })}
                             >
                               {categories.map(c => (
                                 <option key={c.id} value={c.id}>{c.name}</option>
                               ))}
                             </select>
                             <span className="text-[11px] text-gray-400">· {date}</span>
                           </div>
                        </div>
                      </div>

                      {viewMode === 'preview' && (
                        <div className="px-3 py-2 text-xs text-gray-600 leading-relaxed bg-white/50 border-b border-gray-50 flex-1 relative group/desc hover:bg-gray-50/50 transition-colors">
                               <p className="line-clamp-2 overflow-hidden text-ellipsis webkit-box cursor-pointer" style={{display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'}} onDoubleClick={() => setEditingBookmarkData({
                                  id: bookmark.id,
                                  name: bookmark.name,
                                  code: bookmark.code,
                                  description: bookmark.description !== undefined ? bookmark.description : (bookmark.history?.find(h => h.role === 'user')?.content || bookmark.code.split('\n').slice(0, 2).join('\n')),
                                  categoryId: bookmark.categoryId || 'default',
                                  language: bookmark.language || 'lisp'
                                })}>
                                 {description}
                               </p>
                               <button 
                                 onClick={() => setEditingBookmarkData({
                                  id: bookmark.id,
                                  name: bookmark.name,
                                  code: bookmark.code,
                                  description: bookmark.description !== undefined ? bookmark.description : (bookmark.history?.find(h => h.role === 'user')?.content || bookmark.code.split('\n').slice(0, 2).join('\n')),
                                  categoryId: bookmark.categoryId || 'default',
                                  language: bookmark.language || 'lisp'
                                 })}
                                 className="absolute top-1.5 right-1.5 p-1 text-gray-400 hover:text-blue-500 opacity-0 group-hover/desc:opacity-100 transition-opacity bg-white/80 rounded"
                                 title="编辑描述"
                               >
                                 <Edit2 size={12} />
                               </button>
                        </div>
                      )}

                      {viewMode === 'full' && viewingContextId === bookmark.id && bookmark.history && (
                        <div className="border-b border-gray-200 bg-gray-50 max-h-48 overflow-y-auto px-4 py-3 text-xs space-y-3">
                           {bookmark.history.filter(h => h.role !== 'system').map((h, i) => (
                               <div key={i} className={`flex flex-col gap-1 ${h.role === 'user' ? 'items-end' : 'items-start'}`}>
                                   <span className="font-semibold text-gray-400 text-[10px] uppercase">{h.role === 'user' ? 'You' : 'AI'}</span>
                                   <div className={`p-2 rounded max-w-[90%] whitespace-pre-wrap ${h.role === 'user' ? 'bg-blue-100 text-blue-900 rounded-tr-none' : 'bg-white border border-gray-200 text-gray-700 rounded-tl-none'}`}>
                                       {h.content || '(Code Block)'}
                                   </div>
                               </div>
                           ))}
                        </div>
                      )}

                      {viewMode === 'full' && (
                        <div className="flex-1 p-3 overflow-y-auto max-h-64 bg-gray-50/50">
                          <pre className="text-[12px] font-mono text-gray-700 leading-relaxed">
                            <code>{bookmark.code}</code>
                          </pre>
                        </div>
                      )}

                      {viewMode !== 'compact' && (
                        <div className="px-3 py-2 bg-white border-t border-gray-100 flex items-center justify-between gap-2">
                          <button
                            onClick={() => onInsertContext({ name: bookmark.name, code: bookmark.code, language: bookmark.language || 'code' })}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1 text-xs font-medium rounded text-gray-600 hover:bg-gray-100 border border-transparent transition-colors"
                          >
                            <PlusCircle size={13} />
                            作为附件添加到聊天
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {/* Add / Edit Overlay */}
        {editingBookmarkData && (
          <div className="absolute inset-0 z-20 flex bg-black/40 backdrop-blur-sm items-center justify-center p-6 animate-in fade-in" onClick={() => setEditingBookmarkData(null)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-full overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white text-gray-800">
                <div className="flex items-center gap-2 text-blue-600 font-semibold">
                  {editingBookmarkData.id ? <Edit2 size={18} /> : <PlusCircle size={18} />}
                  <h3>{editingBookmarkData.id ? '编辑代码片段' : '手动录入代码'}</h3>
                </div>
                <button
                  onClick={() => setEditingBookmarkData(null)}
                  className="p-1.5 text-gray-500 hover:text-gray-900 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-6 flex-1 overflow-y-auto bg-gray-50/50 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">名称 / 作用</label>
                  <input
                    type="text"
                    value={editingBookmarkData.name}
                    onChange={e => setEditingBookmarkData({ ...editingBookmarkData, name: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="给这段代码起个名字"
                  />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">语言</label>
                    <input
                      type="text"
                      value={editingBookmarkData.language}
                      onChange={e => setEditingBookmarkData({ ...editingBookmarkData, language: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="e.g. lisp, python, javascript"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                    <select
                      value={editingBookmarkData.categoryId}
                      onChange={e => setEditingBookmarkData({ ...editingBookmarkData, categoryId: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">代码内容</label>
                  <textarea
                    value={editingBookmarkData.code}
                    onChange={e => setEditingBookmarkData({ ...editingBookmarkData, code: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[200px]"
                    placeholder="将收集到的代码粘贴在这里..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">描述 (可选)</label>
                  <textarea
                    value={editingBookmarkData.description}
                    onChange={e => setEditingBookmarkData({ ...editingBookmarkData, description: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="添加更多细节说明..."
                    rows={2}
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 bg-white flex justify-end gap-3">
                <button
                  onClick={() => setEditingBookmarkData(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    if (!editingBookmarkData.name || !editingBookmarkData.code) {
                      alert('请填写名称和代码内容');
                      return;
                    }
                    if (editingBookmarkData.id) {
                      updateBookmark(editingBookmarkData.id, {
                        name: editingBookmarkData.name,
                        code: editingBookmarkData.code,
                        description: editingBookmarkData.description,
                        categoryId: editingBookmarkData.categoryId,
                        language: editingBookmarkData.language
                      });
                    } else {
                      addBookmark({
                        name: editingBookmarkData.name,
                        code: editingBookmarkData.code,
                        description: editingBookmarkData.description,
                        categoryId: editingBookmarkData.categoryId,
                        language: editingBookmarkData.language
                      });
                    }
                    setEditingBookmarkData(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Check size={16} />
                  保存修改
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
