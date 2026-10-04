import React, { useState, useMemo } from 'react';
import { X, Book, Trash2, Edit2, Play, Search, Plus, Save, Tag, ArrowDownAZ, ArrowDownZA, Clock, BrainCircuit, Copy, Check, Download } from 'lucide-react';
import { Skill } from '../hooks/useSkillLibrary';
import { downloadAsAnsi } from '../lib/downloadAnsi';

interface SkillLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  skills: Skill[];
  onAdd: (skill: Omit<Skill, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, updates: Partial<Skill>) => void;
  onDelete: (id: string) => void;
  onRunSkill: (skill: Skill) => void;
  onTrainSkill?: (skill: Skill) => void;
  initialAddLogic?: string | null;
  initialAddParams?: object[] | null;
  onClearInitialAddLogic?: () => void;
}

type SortOption = 'newest' | 'oldest' | 'nameAsc' | 'nameDesc';

export function injectParamsToLisp(logic: string, parameters: Skill['parameters'], values: Record<string, string>): string {
  if (!parameters || parameters.length === 0) return logic;
  
  let injectionLines = '';
  parameters.forEach(p => {
    let valStr = values[p.name] ?? p.default ?? '';
    if (p.type === 'string') {
      valStr = `"${valStr}"`;
    } else if (p.type === 'boolean') {
      valStr = valStr === 'true' ? 'T' : 'nil';
    } else {
      valStr = valStr === '' ? '0' : valStr; // numbers
    }
    injectionLines += `(setq ${p.name} ${valStr})\n`;
  });
  
  return `;--- Parameters Injected by AI Studio ---\n${injectionLines};----------------------------------------\n\n${logic}`;
}

export function SkillLibraryModal({ 
  isOpen, onClose, skills, onAdd, onUpdate, onDelete, onRunSkill, onTrainSkill,
  initialAddLogic, initialAddParams, onClearInitialAddLogic 
}: SkillLibraryModalProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  
  const [isAdding, setIsAdding] = useState(!!initialAddLogic);
  const [newSkill, setNewSkill] = useState<{
    name: string;
    description: string;
    logic: string;
    category: string;
    parameters: NonNullable<Skill['parameters']>;
  }>({ 
    name: '', 
    description: '', 
    logic: initialAddLogic || '',
    category: '',
    parameters: []
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Skill>>({});
  
  const [runningSkillId, setRunningSkillId] = useState<string | null>(null);
  const [runParamValues, setRunParamValues] = useState<Record<string, string>>({});

  // Sync initialAddLogic when modal opens with it
  React.useEffect(() => {
    if (initialAddLogic) {
      setIsAdding(true);
      setNewSkill(prev => ({ 
        ...prev, 
        logic: initialAddLogic,
        parameters: (initialAddParams as any) || []
      }));
    }
  }, [initialAddLogic, initialAddParams]);

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set(skills.map(s => s.category).filter(Boolean) as string[]);
    return Array.from(cats);
  }, [skills]);

  const filteredAndSortedSkills = useMemo(() => {
    let result = skills.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || 
                            s.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || s.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest': return b.createdAt - a.createdAt;
        case 'oldest': return a.createdAt - b.createdAt;
        case 'nameAsc': return a.name.localeCompare(b.name);
        case 'nameDesc': return b.name.localeCompare(a.name);
        default: return 0;
      }
    });

    return result;
  }, [skills, search, categoryFilter, sortBy]);

  const handleClose = () => {
    setIsAdding(false);
    setNewSkill({ name: '', description: '', logic: '', category: '', parameters: [] });
    setEditingId(null);
    if (onClearInitialAddLogic) onClearInitialAddLogic();
    onClose();
  };

  const startEditing = (skill: Skill) => {
    setEditingId(skill.id);
    setEditForm({ name: skill.name, description: skill.description, category: skill.category, logic: skill.logic, parameters: skill.parameters || [] });
  };

  const saveEdit = (id: string) => {
    onUpdate(id, editForm);
    setEditingId(null);
  };

  const handleCopy = (skill: Skill) => {
    navigator.clipboard.writeText(skill.logic);
    setCopiedId(skill.id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const handleDownloadLsp = (skill: Skill) => {
    try {
      let fileName = skill.name.trim() || 'skill_script';
      const isPython = skill.logic.includes('def ') || skill.logic.includes('import ');
      const ext = isPython ? '.py' : '.lsp';
      
      if (!fileName.toLowerCase().endsWith(ext)) {
        fileName += ext;
      }

      if (ext === '.lsp') {
        downloadAsAnsi(skill.logic, fileName);
      } else {
        const blob = new Blob([skill.logic], { type: 'text/plain;charset=utf-8' });
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 top-[64px] sm:top-[72px] bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Book className="text-blue-600" size={20} />
            <h2 className="text-lg font-semibold">技能库 (Skill Library)</h2>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded-md">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-4 border-b bg-gray-50 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-1 min-w-[200px] gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="搜索技能..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <select 
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">所有分类</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="newest">最新添加</option>
              <option value="oldest">最早添加</option>
              <option value="nameAsc">名称 A-Z</option>
              <option value="nameDesc">名称 Z-A</option>
            </select>

            <button 
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 shadow-sm"
            >
              <Plus size={16} /> 新增
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
          {isAdding && (
            <div className="border border-blue-200 rounded-lg p-5 bg-white shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2 relative">
              <div className="absolute top-0 right-0 px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-bl-lg rounded-tr-lg">
                新增技能
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">技能名称 <span className="text-red-500">*</span></label>
                  <input 
                    placeholder="例如: 批量生成铝板折边线" 
                    className="w-full p-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                    value={newSkill.name}
                    onChange={e => setNewSkill({...newSkill, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">分类 (可选)</label>
                  <input 
                    placeholder="例如: 排版, 标注, 绘图" 
                    className="w-full p-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                    value={newSkill.category}
                    onChange={e => setNewSkill({...newSkill, category: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">技能描述</label>
                <textarea 
                  placeholder="简单描述这个技能的作用和使用场景" 
                  className="w-full p-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm h-16 resize-none"
                  value={newSkill.description}
                  onChange={e => setNewSkill({...newSkill, description: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">AI 逻辑指令 (AutoLISP) <span className="text-red-500">*</span></label>
                <textarea 
                  placeholder="AI 执行的逻辑片段" 
                  className="w-full p-3 border border-gray-300 rounded bg-gray-50 font-mono text-xs h-32 outline-none focus:ring-1 focus:ring-blue-500"
                  value={newSkill.logic}
                  onChange={e => setNewSkill({...newSkill, logic: e.target.value})}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-gray-700">技能参数 (可选)</label>
                  <button 
                    onClick={() => setNewSkill({...newSkill, parameters: [...(newSkill.parameters || []), { name: '', description: '', type: 'string' }]})}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <Plus size={12} /> 添加参数
                  </button>
                </div>
                {newSkill.parameters?.map((param, index) => (
                  <div key={index} className="flex items-start gap-2 mb-2">
                    <input 
                      placeholder="变量名(如: len)"
                      className="flex-1 p-1.5 border border-gray-300 rounded text-xs"
                      value={param.name}
                      onChange={e => {
                        const newParams = [...(newSkill.parameters || [])];
                        newParams[index].name = e.target.value;
                        setNewSkill({...newSkill, parameters: newParams});
                      }}
                    />
                    <input 
                      placeholder="参数说明"
                      className="flex-1 p-1.5 border border-gray-300 rounded text-xs"
                      value={param.description}
                      onChange={e => {
                        const newParams = [...(newSkill.parameters || [])];
                        newParams[index].description = e.target.value;
                        setNewSkill({...newSkill, parameters: newParams});
                      }}
                    />
                    <select
                      className="w-24 p-1.5 border border-gray-300 rounded text-xs bg-white"
                      value={param.type}
                      onChange={e => {
                        const newParams = [...(newSkill.parameters || [])];
                        newParams[index].type = e.target.value as any;
                        setNewSkill({...newSkill, parameters: newParams});
                      }}
                    >
                      <option value="string">文本</option>
                      <option value="number">数字</option>
                      <option value="boolean">布尔</option>
                    </select>
                    <input 
                      placeholder="默认值"
                      className="w-24 p-1.5 border border-gray-300 rounded text-xs"
                      value={param.default || ''}
                      onChange={e => {
                        const newParams = [...(newSkill.parameters || [])];
                        newParams[index].default = e.target.value;
                        setNewSkill({...newSkill, parameters: newParams});
                      }}
                    />
                    <button 
                      onClick={() => {
                        const newParams = [...(newSkill.parameters || [])];
                        newParams.splice(index, 1);
                        setNewSkill({...newSkill, parameters: newParams});
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t mt-4">
                <button 
                  onClick={() => {
                    setIsAdding(false);
                    if (onClearInitialAddLogic) onClearInitialAddLogic();
                  }} 
                  className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md font-medium"
                >
                  取消
                </button>
                <button 
                  disabled={!newSkill.name || !newSkill.logic}
                  onClick={() => {
                    const skillToSave = {
                      ...newSkill,
                      parameters: newSkill.parameters || []
                    };
                    onAdd(skillToSave);
                    setIsAdding(false);
                    setNewSkill({ name: '', description: '', logic: '', category: '', parameters: [] });
                    if (onClearInitialAddLogic) onClearInitialAddLogic();
                  }}
                  className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  保存技能
                </button>
              </div>
            </div>
          )}

          {filteredAndSortedSkills.length === 0 && !isAdding ? (
            <div className="text-center py-16 text-gray-400">
              <Book size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">没找到相关的技能</p>
              <p className="text-sm mt-1">您可以尝试更改搜索条件，或新建一个技能。</p>
            </div>
          ) : (
            filteredAndSortedSkills.map(skill => (
              <div key={skill.id} className={`group border border-gray-200 rounded-xl bg-white p-4 transition-all hover:shadow-md ${editingId === skill.id ? 'ring-2 ring-blue-500 border-transparent' : 'hover:border-blue-300'}`}>
                {editingId === skill.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input 
                        className="p-2 border rounded text-sm font-medium"
                        value={editForm.name || ''}
                        onChange={e => setEditForm({...editForm, name: e.target.value})}
                        placeholder="技能名称"
                      />
                      <input 
                        className="p-2 border rounded text-sm"
                        value={editForm.category || ''}
                        onChange={e => setEditForm({...editForm, category: e.target.value})}
                        placeholder="分类"
                      />
                    </div>
                    <textarea 
                      className="w-full p-2 border rounded text-sm h-16 resize-none"
                      value={editForm.description || ''}
                      onChange={e => setEditForm({...editForm, description: e.target.value})}
                      placeholder="技能描述"
                    />
                     <textarea 
                      className="w-full p-2 border rounded font-mono text-xs h-32 bg-gray-50"
                      value={editForm.logic || ''}
                      onChange={e => setEditForm({...editForm, logic: e.target.value})}
                      placeholder="AI 逻辑"
                    />
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-medium text-gray-700">技能参数</label>
                        <button 
                          onClick={() => setEditForm({...editForm, parameters: [...(editForm.parameters || []), { name: '', description: '', type: 'string' }]})}
                          className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <Plus size={12} /> 添加参数
                        </button>
                      </div>
                      {editForm.parameters?.map((param, index) => (
                        <div key={index} className="flex items-start gap-2 mb-2">
                          <input 
                            placeholder="变量名"
                            className="flex-1 p-1.5 border rounded text-xs"
                            value={param.name}
                            onChange={e => {
                              const newParams = [...(editForm.parameters || [])];
                              newParams[index].name = e.target.value;
                              setEditForm({...editForm, parameters: newParams});
                            }}
                          />
                          <input 
                            placeholder="说明"
                            className="flex-1 p-1.5 border rounded text-xs"
                            value={param.description}
                            onChange={e => {
                              const newParams = [...(editForm.parameters || [])];
                              newParams[index].description = e.target.value;
                              setEditForm({...editForm, parameters: newParams});
                            }}
                          />
                          <select
                            className="w-20 p-1.5 border rounded text-xs bg-white"
                            value={param.type}
                            onChange={e => {
                              const newParams = [...(editForm.parameters || [])];
                              newParams[index].type = e.target.value as any;
                              setEditForm({...editForm, parameters: newParams});
                            }}
                          >
                            <option value="string">文本</option>
                            <option value="number">数字</option>
                            <option value="boolean">布尔</option>
                          </select>
                          <input 
                            placeholder="默认值"
                            className="w-20 p-1.5 border rounded text-xs"
                            value={param.default || ''}
                            onChange={e => {
                              const newParams = [...(editForm.parameters || [])];
                              newParams[index].default = e.target.value;
                              setEditForm({...editForm, parameters: newParams});
                            }}
                          />
                          <button 
                            onClick={() => {
                              const newParams = [...(editForm.parameters || [])];
                              newParams.splice(index, 1);
                              setEditForm({...editForm, parameters: newParams});
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                       <button 
                        onClick={() => setEditingId(null)} 
                        className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded"
                       >
                         取消
                       </button>
                       <button 
                        onClick={() => saveEdit(skill.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                       >
                         <Save size={14} /> 保存
                       </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors truncate">{skill.name}</h3>
                          {skill.category && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] uppercase font-bold tracking-wider rounded-full flex-shrink-0">
                              <Tag size={10} /> {skill.category}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">{skill.description}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {deletingId === skill.id ? (
                          <div className="flex items-center gap-1 bg-red-50 text-red-600 px-2 py-1 rounded-lg text-xs">
                            <span className="font-medium mr-1">确定删除?</span>
                            <button 
                              onClick={() => {
                                onDelete(skill.id);
                                setDeletingId(null);
                              }}
                              className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                              是
                            </button>
                            <button 
                              onClick={() => setDeletingId(null)}
                              className="px-2 py-1 border border-red-200 rounded hover:bg-red-100"
                            >
                              否
                            </button>
                          </div>
                        ) : (
                          <>
                            <button 
                              onClick={() => {
                                if (skill.parameters && skill.parameters.length > 0) {
                                  const defaultVals: Record<string, string> = {};
                                  skill.parameters.forEach(p => {
                                    if (p.default !== undefined) {
                                      defaultVals[p.name] = String(p.default);
                                    }
                                  });
                                  setRunParamValues(defaultVals);
                                  setRunningSkillId(skill.id);
                                } else {
                                  onRunSkill(skill);
                                }
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-xs font-semibold transition-colors" 
                              title="直接发送到 CAD 运行"
                            >
                              <Play size={14} className="fill-green-700/20" /> 运行
                            </button>
                            <button 
                              onClick={() => onTrainSkill?.(skill)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-xs font-semibold transition-colors" 
                              title="在聊天中进行二次训练完善"
                            >
                              <BrainCircuit size={14} /> 训练
                            </button>
                            <button 
                              onClick={() => handleCopy(skill)}
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="复制代码"
                            >
                              {copiedId === skill.id ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                            </button>
                            <button 
                              onClick={() => handleDownloadLsp(skill)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="下载LSP文件"
                            >
                              <Download size={16} />
                            </button>
                            <button 
                              onClick={() => startEditing(skill)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="编辑"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => setDeletingId(skill.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="删除"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center text-[10px] text-gray-400 font-medium">
                       <Clock size={12} className="mr-1" />
                       更新于 {new Date(skill.updatedAt).toLocaleString()}
                    </div>
                    {runningSkillId === skill.id && skill.parameters && (
                      <div className="mt-3 pt-3 border-t space-y-3 bg-gray-50/50 -mx-4 -mb-4 p-4 rounded-b-xl border-blue-100">
                        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 justify-between">
                          <span>输入执行参数</span>
                          <button onClick={() => setRunningSkillId(null)} className="text-gray-400 hover:text-gray-600"><X size={14}/></button>
                        </h4>
                        <div className="space-y-2">
                          {skill.parameters.map((p, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <label className="text-xs font-medium text-gray-600 w-1/4 truncate" title={p.description || p.name}>
                                {p.name}
                                {p.description && <span className="block text-[10px] text-gray-400 font-normal">{p.description}</span>}
                              </label>
                              {p.type === 'boolean' ? (
                                <select 
                                  className="flex-1 p-2 border rounded-md text-sm bg-white"
                                  value={runParamValues[p.name] || 'false'}
                                  onChange={e => setRunParamValues(prev => ({...prev, [p.name]: e.target.value}))}
                                >
                                  <option value="true">是 (True)</option>
                                  <option value="false">否 (False)</option>
                                </select>
                              ) : (
                                <input 
                                  type={p.type === 'number' ? 'number' : 'text'}
                                  className="flex-1 p-2 border rounded-md text-sm"
                                  placeholder={`输入 ${p.name}`}
                                  value={runParamValues[p.name] || ''}
                                  onChange={e => setRunParamValues(prev => ({...prev, [p.name]: e.target.value}))}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-end pt-1">
                          <button 
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1"
                            onClick={() => {
                              onRunSkill({...skill, logic: injectParamsToLisp(skill.logic, skill.parameters, runParamValues)});
                              setRunningSkillId(null);
                            }}
                          >
                            <Play size={14} className="fill-white" /> 确认执行
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
