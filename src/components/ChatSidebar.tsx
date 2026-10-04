import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  MessageSquare, Plus, Search, MoreVertical, Edit2, 
  Trash2, Pin, Archive, HelpCircle, FileText, ChevronLeft, ChevronRight, X, Sparkles
} from 'lucide-react';
import { ChatSession } from '../hooks/useChatHistory';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ChatSidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onUpdate: (id: string, updates: Partial<ChatSession>) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onOpenArchived: () => void;
  onRunTour: () => void;
  onOpenToolbox?: () => void;
  activeModule?: 'CAD' | 'OFFICE';
  onSwitchModule?: (module: 'CAD' | 'OFFICE') => void;
}

// Sortable item wrapper
function SortableSessionItem({ 
  session, 
  isActive, 
  onSelect,
  onUpdate,
  onDelete,
  onTogglePin,
  onToggleArchive
}: { 
  session: ChatSession; 
  isActive: boolean;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ChatSession>) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleArchive: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: session.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [showOptions, setShowOptions] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setShowOptions(false);
      }
    };
    if (showOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showOptions]);

  const handleSaveTitle = () => {
    if (editTitle.trim()) {
      onUpdate(session.id, { title: editTitle.trim() });
    } else {
      setEditTitle(session.title);
    }
    setIsEditing(false);
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`group relative flex items-center justify-between rounded-md p-2 cursor-pointer transition-colors ${isActive ? 'bg-blue-100 text-blue-900' : 'hover:bg-gray-100 text-gray-700'} ${isDragging ? 'shadow-md border border-blue-200' : ''}`}
    >
      <div 
        className="flex items-center gap-2 flex-1 min-w-0" 
        onClick={() => !isEditing && onSelect(session.id)}
        {...(isEditing ? {} : listeners)}
        {...attributes}
      >
        {session.isPinned ? (
          <Pin size={14} className={isActive ? 'text-blue-600' : 'text-gray-400'} />
        ) : (
          <MessageSquare size={14} className={isActive ? 'text-blue-600' : 'text-gray-400'} />
        )}
        
        {isEditing ? (
          <input
            autoFocus
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveTitle();
              if (e.key === 'Escape') {
                setEditTitle(session.title);
                setIsEditing(false);
              }
            }}
            className="flex-1 min-w-0 bg-white border border-blue-300 rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : (
          <span className="truncate text-sm flex-1">{session.title}</span>
        )}
      </div>

      {!isEditing && (
        <div className={`flex items-center ${showOptions ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
          <div className="relative">
            <button 
              ref={buttonRef}
              onClick={(e) => { 
                e.stopPropagation(); 
                if (!showOptions) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMenuPos({ top: rect.bottom, right: window.innerWidth - rect.right });
                }
                setShowOptions(!showOptions); 
              }}
              className="p-1 hover:bg-gray-200 rounded text-gray-500"
              title="选项"
            >
              <MoreVertical size={14} />
            </button>
            
            {showOptions && createPortal(
              <div 
                ref={menuRef}
                style={{ top: menuPos.top + 4, right: menuPos.right }}
                className="fixed w-32 bg-white rounded-md shadow-lg border border-gray-200 z-[9999] py-1 text-sm"
              >
                <button 
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2"
                  onClick={(e) => { e.stopPropagation(); setIsEditing(true); setShowOptions(false); }}
                >
                  <Edit2 size={12} /> 重命名
                </button>
                <button 
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2"
                  onClick={(e) => { e.stopPropagation(); onTogglePin(session.id); setShowOptions(false); }}
                >
                  <Pin size={12} /> {session.isPinned ? '取消置顶' : '置顶'}
                </button>
                <button 
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2"
                  onClick={(e) => { e.stopPropagation(); onToggleArchive(session.id); setShowOptions(false); }}
                >
                  <Archive size={12} /> 归档
                </button>
                <div className="h-px bg-gray-200 my-1" />
                <button 
                  className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 flex items-center gap-2"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if(confirm('确定要删除此对话吗？')) {
                      onDelete(session.id); 
                    }
                    setShowOptions(false); 
                  }}
                >
                  <Trash2 size={12} /> 删除
                </button>
              </div>,
              document.body
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatSidebar({
  sessions,
  currentSessionId,
  onSelect,
  onNew,
  onUpdate,
  onDelete,
  onTogglePin,
  onToggleArchive,
  onReorder,
  isOpen,
  setIsOpen,
  onOpenArchived,
  onRunTour,
  onOpenToolbox,
  activeModule = 'CAD',
  onSwitchModule
}: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeSessions = useMemo(() => {
    return sessions.filter(s => !s.isArchived);
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    let result = activeSessions;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => 
        s.title.toLowerCase().includes(q) || 
        s.messages.some(m => typeof m.content === 'string' && m.content.toLowerCase().includes(q)) ||
        s.messages.some(m => m.rawContent && m.rawContent.toLowerCase().includes(q))
      );
    }
    return result;
  }, [activeSessions, searchQuery]);

  const pinnedSessions = useMemo(() => filteredSessions.filter(s => s.isPinned), [filteredSessions]);
  const unpinnedSessions = useMemo(() => filteredSessions.filter(s => !s.isPinned), [filteredSessions]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(active.id as string, over.id as string);
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-20 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Toggle Button for collapsed state */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-20 left-0 z-10 p-2 bg-white border border-l-0 border-gray-200 rounded-r-md shadow-sm hover:bg-gray-50 text-gray-600 transition-transform"
          title="展开侧边栏"
        >
          <ChevronRight size={18} />
        </button>
      )}

      <div 
        className={`fixed md:relative top-0 left-0 h-full bg-gray-50 border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out z-30
          ${isOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full overflow-hidden'}`}
      >
        {isOpen && (
          <div className="w-64 flex flex-col h-full shrink-0">
            {/* 模块选择标签页 */}
            {onSwitchModule && (
              <div className="px-3 pt-3 pb-1 flex gap-1 bg-gray-100/30 border-b border-gray-200/50">
                <button
                  onClick={() => onSwitchModule('CAD')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border text-center transition-all flex items-center justify-center gap-1.5 ${
                    activeModule === 'CAD'
                      ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <MessageSquare size={12} />
                  CAD 助手
                </button>
                <button
                  onClick={() => onSwitchModule('OFFICE')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border text-center transition-all flex items-center justify-center gap-1.5 ${
                    activeModule === 'OFFICE'
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <FileText size={12} />
                  Office/WPS
                </button>
              </div>
            )}

            {/* Header */}
            <div className="p-3 border-b border-gray-200 flex items-center justify-between">
              <button
                onClick={onNew}
                className={`flex items-center justify-center gap-2 text-white rounded-md py-2 px-3 text-sm font-medium transition-colors flex-1 mr-2 ${
                  activeModule === 'OFFICE'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <Plus size={16} /> 新对话
              </button>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 text-gray-500 hover:bg-gray-200 rounded-md transition-colors md:hidden"
              >
                <X size={18} />
              </button>
               <button 
                onClick={() => setIsOpen(false)}
                className="p-2 text-gray-500 hover:bg-gray-200 rounded-md transition-colors hidden md:block border border-gray-200 bg-white shadow-sm"
                title="收起侧边栏"
              >
                <ChevronLeft size={16} />
              </button>
            </div>

            {/* Search */}
            <div className="p-3 border-b border-gray-200">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索对话..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-md py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-gray-300">
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                {pinnedSessions.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-500 mb-2 px-2">置顶</div>
                    <SortableContext 
                      items={pinnedSessions.map(s => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="flex flex-col gap-0.5">
                        {pinnedSessions.map(session => (
                          <SortableSessionItem
                            key={session.id}
                            session={session}
                            isActive={session.id === currentSessionId}
                            onSelect={onSelect}
                            onUpdate={onUpdate}
                            onDelete={onDelete}
                            onTogglePin={onTogglePin}
                            onToggleArchive={onToggleArchive}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                )}

                {unpinnedSessions.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 mb-2 px-2">最近</div>
                    <SortableContext 
                      items={unpinnedSessions.map(s => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="flex flex-col gap-0.5">
                        {unpinnedSessions.map(session => (
                          <SortableSessionItem
                            key={session.id}
                            session={session}
                            isActive={session.id === currentSessionId}
                            onSelect={onSelect}
                            onUpdate={onUpdate}
                            onDelete={onDelete}
                            onTogglePin={onTogglePin}
                            onToggleArchive={onToggleArchive}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                )}

                {filteredSessions.length === 0 && (
                  <div className="text-center text-sm text-gray-400 mt-6">
                    {searchQuery ? '没有找到相关对话' : '暂无对话'}
                  </div>
                )}
              </DndContext>
            </div>

            {/* Footer Options */}
            <div className="p-3 border-t border-gray-200 mt-auto flex flex-col gap-1">
              {onOpenToolbox && (
                <button 
                  onClick={onOpenToolbox}
                  className="flex items-center gap-2 text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-700 p-2 rounded-md transition-colors w-full font-medium"
                >
                  <Sparkles size={16} className="text-amber-500" /> 百宝箱
                </button>
              )}
              <button 
                onClick={onRunTour}
                className="flex items-center gap-2 text-sm text-gray-600 hover:bg-gray-200 p-2 rounded-md transition-colors w-full"
              >
                <HelpCircle size={16} /> 功能引导
              </button>
              <button 
                onClick={onOpenArchived}
                className="flex items-center gap-2 text-sm text-gray-600 hover:bg-gray-200 p-2 rounded-md transition-colors w-full"
              >
                <Archive size={16} /> 已归档对话
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
