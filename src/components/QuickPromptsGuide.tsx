import React, { useState, useMemo } from 'react';
import { 
  Sparkles, Search, Copy, Check, ArrowRight, Zap, 
  HelpCircle, Lightbulb, BookOpen, Layers, PenTool, 
  Scissors, Tag, Table, FileSpreadsheet, FileText, 
  Presentation, RefreshCw, Bookmark
} from 'lucide-react';
import { 
  CAD_FEATURE_PROMPTS, 
  OFFICE_FEATURE_PROMPTS, 
  CAD_PROMPT_CATEGORIES, 
  OFFICE_PROMPT_CATEGORIES,
  FeaturePromptItem 
} from '../data/featurePrompts';

interface QuickPromptsGuideProps {
  activeModule: 'CAD' | 'OFFICE';
  onSelectPrompt: (promptText: string, autoSend?: boolean) => void;
  onOpenAgentGuide?: () => void;
  onOpenSkillLibrary?: () => void;
  onOpenBookmarks?: () => void;
  compact?: boolean;
}

export function QuickPromptsGuide({
  activeModule,
  onSelectPrompt,
  onOpenAgentGuide,
  onOpenSkillLibrary,
  onOpenBookmarks,
  compact = false,
}: QuickPromptsGuideProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categories = activeModule === 'CAD' ? CAD_PROMPT_CATEGORIES : OFFICE_PROMPT_CATEGORIES;
  const allPrompts = activeModule === 'CAD' ? CAD_FEATURE_PROMPTS : OFFICE_FEATURE_PROMPTS;

  const filteredPrompts = useMemo(() => {
    return allPrompts.filter((item) => {
      const matchCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.prompt.toLowerCase().includes(q) ||
        item.tags.some(t => t.toLowerCase().includes(q))
      );
      return matchCategory && matchSearch;
    });
  }, [allPrompts, selectedCategory, searchQuery]);

  const handleCopy = (id: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const tips = activeModule === 'CAD' ? [
    { title: '💡 图元感知', text: '先在 AutoCAD 中框选图元，再点击输入框下方的【读取选中图元】，AI 将直接获取其坐标/图层并精准写代码。' },
    { title: '⚡ 中文防乱码', text: '保存导出的 .lsp 文件时，系统已自动转为 ANSI/GBK 编码，完美兼容 AutoCAD 2004~2026 中文命令。' },
    { title: '🧠 技能模式', text: '切换至【技能模式】，AI 会先出方案架构，您可以逐步指导打磨，并一键将其收录至您的专属【技能书】。' },
    { title: '🔄 目标进程切换', text: '当您在本地开启了多个 CAD 窗口时，可在顶部下拉栏中秒级切换目标图纸与 PID 进程。' },
  ] : [
    { title: '📊 选区直读', text: '在 Excel 中选择要处理的数据区域，点击【读取选中数据】，AI 即可感知表格结构并生成精准宏代码。' },
    { title: '⚡ 一键执行', text: '连接本地 Office 代理后，点击代码框的【发送至 Office 执行】按钮，无需打开 VBA 编辑器即可自动运行。' },
    { title: '📝 跨软件联动', text: '支持将 Excel 坐标表批量绘制到 AutoCAD，或将 CAD 图纸属性统计直接输出为 Excel 报表。' },
    { title: '📑 WPS 完全兼容', text: '全面支持 WPS Office (表格/文字/演示) 与微软 Office 双引擎，代码无缝通用。' },
  ];

  return (
    <div className="w-full space-y-6">
      {/* Search & Category Filter Header */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${activeModule === 'CAD' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                {activeModule === 'CAD' ? 'AutoCAD 常用功能与经典提示词百宝箱' : 'Office/WPS 自动化经典功能百宝箱'}
              </h3>
              <p className="text-xs text-gray-500">点击任意卡片即可一键填入需求或直接生成代码</p>
            </div>
          </div>

          {/* Quick Search */}
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索功能/关键词..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                selectedCategory === cat.id
                  ? (activeModule === 'CAD'
                      ? 'bg-blue-600 text-white shadow-sm font-semibold'
                      : 'bg-emerald-600 text-white shadow-sm font-semibold')
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Prompts Grid */}
      {filteredPrompts.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 border border-dashed border-gray-200 rounded-2xl">
          <p className="text-sm text-gray-500">未找到与 &quot;{searchQuery}&quot; 相关的提示词模板</p>
          <button
            onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
            className="mt-2 text-xs text-blue-600 hover:underline"
          >
            清除搜索条件
          </button>
        </div>
      ) : (
        <div className={`grid gap-3.5 ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
          {filteredPrompts.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectPrompt(item.prompt, false)}
              className="group relative bg-white border border-gray-200/90 hover:border-blue-400 hover:shadow-md rounded-xl p-4 transition-all duration-200 flex flex-col justify-between text-left cursor-pointer"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-bold text-gray-800 text-sm group-hover:text-blue-600 transition-colors line-clamp-1">
                    {item.title}
                  </h4>
                  {item.difficulty && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                      item.difficulty === '入门' ? 'bg-green-50 text-green-700 border border-green-200' :
                      item.difficulty === '进阶' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      'bg-purple-50 text-purple-700 border border-purple-200'
                    }`}>
                      {item.difficulty}
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1 pt-1">
                  {item.tags.map((tag, i) => (
                    <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-3.5 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] text-blue-600 font-medium flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                  <span>填入需求</span>
                  <ArrowRight size={12} />
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => handleCopy(item.id, item.prompt, e)}
                    title="复制提示词内容"
                    className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  >
                    {copiedId === item.id ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPrompt(item.prompt, true);
                    }}
                    title="立即发送并生成代码"
                    className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                      activeModule === 'CAD'
                        ? 'bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white'
                        : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'
                    }`}
                  >
                    <Zap size={11} />
                    <span>立即生成</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pro Tips Section */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb size={16} className="text-amber-500" />
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            高效操作与提效小贴士 (Pro Tips)
          </h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tips.map((tip, idx) => (
            <div key={idx} className="p-3 bg-amber-50/50 border border-amber-200/60 rounded-xl text-left">
              <span className="font-semibold text-xs text-amber-950 block mb-1">{tip.title}</span>
              <p className="text-[11px] text-amber-900/80 leading-relaxed">{tip.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
