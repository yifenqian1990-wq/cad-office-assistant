import React, { useState } from 'react';
import { 
  X, BookOpen, Sparkles, Terminal, Laptop, 
  BrainCircuit, ShieldCheck, Zap, Copy, Check, 
  ExternalLink, Layers, FileCode
} from 'lucide-react';
import { QuickPromptsGuide } from './QuickPromptsGuide';

interface FeatureGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeModule: 'CAD' | 'OFFICE';
  onSelectPrompt: (prompt: string, autoSend?: boolean) => void;
  onOpenAgentGuide: () => void;
  onOpenSkillLibrary: () => void;
  onOpenBookmarks: () => void;
}

export function FeatureGuideModal({
  isOpen,
  onClose,
  activeModule,
  onSelectPrompt,
  onOpenAgentGuide,
  onOpenSkillLibrary,
  onOpenBookmarks,
}: FeatureGuideModalProps) {
  const [activeTab, setActiveTab] = useState<'prompts' | 'cad_flow' | 'office_flow' | 'skills_guide' | 'model_tips'>('prompts');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-5xl h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-sm">
              <BookOpen size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>软件功能完整指南与百宝箱</span>
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  {activeModule === 'CAD' ? 'AutoCAD 引擎' : 'Office/WPS 引擎'}
                </span>
              </h2>
              <p className="text-xs text-gray-500">掌握 AI 智能绘图、自动化报表与长效技能复用的全部核心能力</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 py-2.5 border-b border-gray-200 bg-white overflow-x-auto text-xs font-semibold">
          <button
            onClick={() => setActiveTab('prompts')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'prompts'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Sparkles size={14} />
            <span>功能提示词百宝箱</span>
          </button>
          <button
            onClick={() => setActiveTab('cad_flow')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'cad_flow'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Terminal size={14} />
            <span>AutoCAD 核心交互工作流</span>
          </button>
          <button
            onClick={() => setActiveTab('office_flow')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'office_flow'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <FileCode size={14} />
            <span>Office/WPS 自动化工作流</span>
          </button>
          <button
            onClick={() => setActiveTab('skills_guide')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'skills_guide'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <BrainCircuit size={14} />
            <span>技能模式与技能书系统</span>
          </button>
          <button
            onClick={() => setActiveTab('model_tips')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'model_tips'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ShieldCheck size={14} />
            <span>模型配置与避坑说明</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
          {activeTab === 'prompts' && (
            <QuickPromptsGuide
              activeModule={activeModule}
              onSelectPrompt={(p, auto) => {
                onSelectPrompt(p, auto);
                onClose();
              }}
              onOpenAgentGuide={onOpenAgentGuide}
              onOpenSkillLibrary={onOpenSkillLibrary}
              onOpenBookmarks={onOpenBookmarks}
            />
          )}

          {activeTab === 'cad_flow' && (
            <div className="max-w-4xl mx-auto space-y-6 text-left">
              <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-4">
                <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                  <Terminal className="text-blue-600" size={18} />
                  <span>AutoCAD 极速互联与操作规范</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                    <h4 className="font-semibold text-sm text-gray-900">连接本地中转代理</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      启动本地 Python / C# 桥接脚本。CAD 运行 <code>STARTAI</code> 后，网页端即可秒级握手连接。
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                    <h4 className="font-semibold text-sm text-gray-900">图元一键读取与感知</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      在 CAD 中框选任意图元，点击输入框下方【读取选中图元】，图元图层、几何数据自动送入 AI。
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-2">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                    <h4 className="font-semibold text-sm text-gray-900">一键直发或保存 .lsp</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      生成的 AutoLISP 代码可一键注入 CAD 执行；也可下载以 ANSI/GBK 格式编码的 <code>.lsp</code> 脚本文件。
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-3">
                <h4 className="font-bold text-sm text-gray-800">📌 高效交互技巧</h4>
                <ul className="space-y-2.5 text-xs text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 font-bold">✓</span>
                    <span><strong>多开窗口管理：</strong>如果同时打开了多个 CAD 图纸，顶部栏会列出所有图纸 PID 与名称，切换后即可向指定图纸发送代码。</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 font-bold">✓</span>
                    <span><strong>撤销安全保障：</strong>所有发送至 CAD 的代码均包含独立的 <code>undo:group</code> 块，如需撤销只需在 CAD 中按一次 <code>Ctrl+Z</code> 或输入 <code>U</code> 即可恢复。</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'office_flow' && (
            <div className="max-w-4xl mx-auto space-y-6 text-left">
              <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-4">
                <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                  <FileCode className="text-emerald-600" size={18} />
                  <span>Office & WPS 自动化核心玩法</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                    <h4 className="font-semibold text-sm text-gray-900">选区即时感知</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      在 Excel 中选中表格区域，点击【读取选中数据】，AI 自动读取表头、字段和数据格式。
                    </p>
                  </div>
                  <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                    <h4 className="font-semibold text-sm text-gray-900">VBA 宏与现代公式</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      不仅生成全套高健壮性 VBA 自动化代码，还提供 XLOOKUP / LET / LAMBDA 等新一代公式解析。
                    </p>
                  </div>
                  <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                    <h4 className="font-semibold text-sm text-gray-900">跨软件数据联通</h4>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      轻松实现从 Excel 读取坐标在 CAD 自动画桩位，或提取 CAD 块属性自动汇总成 Excel 报表。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'skills_guide' && (
            <div className="max-w-4xl mx-auto space-y-6 text-left">
              <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-4">
                <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                  <BrainCircuit className="text-purple-600" size={18} />
                  <span>技能模式 (Skill Mode) 与技能书系统</span>
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  普通代码模式是“一问一答”式生成。而<strong>技能模式</strong>让 AI 具备“长效演化”的能力：
                </p>
                <div className="space-y-3 pt-2">
                  <div className="p-3.5 bg-purple-50/60 border border-purple-200 rounded-xl">
                    <h4 className="font-bold text-xs text-purple-950 mb-1">1. 感知 ➔ 方案决策 ➔ 执行</h4>
                    <p className="text-xs text-purple-900/80 leading-relaxed">
                      AI 会先列出详细的执行计划（包含前置条件、参数列表与推导逻辑），经您确认后再生成并执行。
                    </p>
                  </div>
                  <div className="p-3.5 bg-purple-50/60 border border-purple-200 rounded-xl">
                    <h4 className="font-bold text-xs text-purple-950 mb-1">2. 沉淀为【技能书】长期复用</h4>
                    <p className="text-xs text-purple-900/80 leading-relaxed">
                      当一个复杂任务被验证成功后，点击【存为技能】。下次只需简单呼叫技能名称或在技能库中点击【运行】，即可直接带参数复用！
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'model_tips' && (
            <div className="max-w-4xl mx-auto space-y-6 text-left">
              <div className="bg-white p-6 rounded-2xl border border-gray-200 space-y-4">
                <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                  <ShieldCheck className="text-blue-600" size={18} />
                  <span>主流大模型配置建议与避坑要点</span>
                </h3>
                <div className="space-y-3">
                  <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-blue-950">DeepSeek 官方 API</span>
                      <span className="text-[10px] bg-blue-200 text-blue-800 px-2 py-0.5 rounded font-medium">推荐</span>
                    </div>
                    <p className="text-xs text-blue-900/85 leading-relaxed">
                      <strong>推荐模型名：<code>deepseek-chat</code> (V3)</strong>。<br />
                      极速秒级响应、开门见山直出完整 AutoLISP / VBA 代码与操作卡片。如需 R1 深度推理请填 <code>deepseek-reasoner</code>。
                    </p>
                  </div>

                  <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-emerald-950">Google Gemini API</span>
                      <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-medium">极速推荐</span>
                    </div>
                    <p className="text-xs text-emerald-900/85 leading-relaxed">
                      <strong>推荐模型名：<code>gemini-2.5-flash</code> 或 <code>gemini-2.0-flash</code></strong>。<br />
                      生成速度飞快，超长上下文，支持复杂图元与大文件表格直接分析。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-gray-200 bg-white flex items-center justify-between">
          <span className="text-xs text-gray-500">
            CADAI / OfficeAI 智能助手 · 助您实现百倍设计与办公效率
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
          >
            进入工作区
          </button>
        </div>
      </div>
    </div>
  );
}
