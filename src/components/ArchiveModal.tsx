import React, { useMemo, useState } from 'react';
import { X, ArchiveRestore, Trash2, MessageSquare, Search } from 'lucide-react';
import { ChatSession } from '../hooks/useChatHistory';

interface ArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  activeModule?: 'CAD' | 'OFFICE';
}

export function ArchiveModal({ isOpen, onClose, sessions, onRestore, onDelete, activeModule }: ArchiveModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const archivedSessions = useMemo(() => {
    return sessions.filter(s => s.isArchived && (!activeModule || (s.module || 'CAD') === activeModule));
  }, [sessions, activeModule]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return archivedSessions;
    const q = searchQuery.toLowerCase();
    return archivedSessions.filter(s => 
      s.title.toLowerCase().includes(q) || 
      s.messages.some(m => typeof m.content === 'string' && m.content.toLowerCase().includes(q))
    );
  }, [archivedSessions, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 top-[64px] sm:top-[72px] bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[calc(100%-2rem)] flex flex-col animate-in zoom-in-95">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">已归档对话</h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>
        
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="搜索已归档的对话..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {filtered.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {searchQuery ? '没有找到匹配的归档对话' : '暂无归档对话'}
            </div>
          ) : (
            filtered.map(session => (
              <div 
                key={session.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                    <MessageSquare size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-gray-800 truncate text-sm">
                      {session.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {session.messages.length} 条消息 • 更新于 {new Date(session.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <button
                    onClick={() => onRestore(session.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 hover:border-blue-500 hover:text-blue-600 rounded shadow-sm transition-colors"
                  >
                    <ArchiveRestore size={14} /> 取消归档
                  </button>
                  <button
                    onClick={() => {
                      if(confirm('确定要永久删除此对话吗？无法恢复！')) {
                        onDelete(session.id);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 hover:border-red-500 hover:text-red-600 hover:bg-red-50 rounded shadow-sm transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
