import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TerminalSquare, Zap, BrainCircuit, Book, 
  FolderOpen, Link as LinkIcon, ChevronRight, ChevronLeft, X, PlayCircle,
  FileSpreadsheet, Sparkles, Download, Layers
} from 'lucide-react';

interface OnboardingTourProps {
  onClose: () => void;
}

export function OnboardingTour({ onClose }: OnboardingTourProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "欢迎使用 CADAI & OfficeAI 智能助手",
      description: "由大模型驱动的工业级自动化副驾驶，专为 AutoCAD 绘图、工程算量与 Office/WPS 批量办公提效而生。",
      icon: <Sparkles className="text-blue-600" size={44} />,
      color: "bg-blue-50",
      features: [
        "AutoCAD AutoLISP 脚本秒级生成与实时注入执行",
        "Office (Excel/Word/PPT) & WPS VBA 自动化宏一键运行",
        "图元与表格选区双向感知，杜绝人工反复输入数据"
      ]
    },
    {
      title: "1. 双引擎协同：CAD 与 Office/WPS",
      description: "顶部提供了一键切换模式，随时在 AutoCAD 绘图助手与 Office/WPS 办公助手之间自由流转。",
      icon: <TerminalSquare className="text-emerald-600" size={44} />,
      color: "bg-emerald-50",
      content: (
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="p-3 border border-blue-200 rounded-xl bg-blue-50/40">
            <h4 className="font-bold text-xs mb-1 text-blue-900 flex items-center gap-1.5">
              <TerminalSquare size={14} className="text-blue-600" /> AutoCAD 模式
            </h4>
            <p className="text-[11px] text-blue-800/80">绘制几何、多框裁剪拼接、自动编号标注、面积统计。</p>
          </div>
          <div className="p-3 border border-emerald-200 rounded-xl bg-emerald-50/40">
            <h4 className="font-bold text-xs mb-1 text-emerald-900 flex items-center gap-1.5">
              <FileSpreadsheet size={14} className="text-emerald-600" /> Office / WPS 模式
            </h4>
            <p className="text-[11px] text-emerald-800/80">多表合并、批量数据清洗、Word公文排版、PPT自动生成。</p>
          </div>
        </div>
      )
    },
    {
      title: "2. 本地实时连接与图元/选区直读",
      description: "启动本地中转代理后，网页端可与您正在运行的 AutoCAD 或 Excel 建立双向 WebSocket 极速通信。",
      icon: <LinkIcon className="text-green-600" size={44} />,
      color: "bg-green-50",
      features: [
        "【读取选中图元 / 数据】：框选图元或单元格，AI 即时感知结构",
        "【一键发送执行】：代码生成后直接在宿主软件中生效，无需手动复制",
        "【CAD 多开管理】：多图纸窗口秒级切换目标 PID 与文档"
      ]
    },
    {
      title: "3. 独立代码窗口与全套操作按钮",
      description: "代码生成完全结构化，每个代码块均配备专属操作栏，并支持 ANSI/GBK 编码导出以彻底避免 CAD 乱码。",
      icon: <Zap className="text-amber-500" size={44} />,
      color: "bg-amber-50",
      features: [
        "【复制】：一键复制代码或 Excel 动态函数",
        "【保存为 .lsp / .bas 文件】：以 ANSI 编码导出，完美兼容中文",
        "【发送至 CAD / Office】：一键直发至宿主软件运行",
        "【代码收藏】：快速将高质量代码保存到您的代码库"
      ]
    },
    {
      title: "4. 代码模式 VS 技能模式（技能书进化）",
      description: "常规场景下使用“代码模式”秒级直出；复杂业务逻辑可开启“技能模式”，带教后沉淀为长效技能书。",
      icon: <BrainCircuit className="text-purple-600" size={44} />,
      color: "bg-purple-50",
      features: [
        "技能模式：感知 -> 方案决策 -> 确认执行，逐步精细打磨",
        "我的技能书：保存常用工业逻辑，支持随时带参呼叫",
        "图库管理：一键管理常用 CAD 图块并快速插入到图纸"
      ]
    },
    {
      title: "5. 常用功能与提示词百宝箱",
      description: "主界面与顶部已内置海量经典提示词模板（轴网生成、自动标注、多框裁剪、多表合并等），点击即用！",
      icon: <Book className="text-blue-600" size={44} />,
      color: "bg-blue-50",
      features: [
        "涵盖建筑、机械、市政、测量放样与日常办公全场景",
        "支持一键填入需求或直接生成完整可运行代码",
        "随时点击顶部【📖 功能指南】查阅技巧与手册"
      ]
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onClose();
    }
  };

  const currentStep = steps[step];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col md:flex-row h-[520px] border border-gray-200"
      >
        {/* Left Side - Visual */}
        <div className={`hidden md:flex flex-col items-center justify-center w-5/12 p-8 transition-colors duration-500 ${currentStep.color}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center text-center"
            >
              <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 border border-black/5">
                {currentStep.icon}
              </div>
              <div className="flex gap-1.5">
                {steps.map((_, i) => (
                  <div 
                    key={i} 
                    className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-blue-600' : 'w-1.5 bg-gray-300'}`} 
                  />
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right Side - Content */}
        <div className="flex-1 flex flex-col p-6 sm:p-8 relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"
          >
            <X size={20} />
          </button>

          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3.5"
              >
                <div className="md:hidden flex justify-center mb-3">
                  <div className={`p-4 rounded-xl ${currentStep.color}`}>
                    {React.cloneElement(currentStep.icon as React.ReactElement<any>, { size: 32 })}
                  </div>
                </div>
                
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">
                  {currentStep.title}
                </h2>
                <p className="text-gray-600 leading-relaxed text-xs sm:text-sm">
                  {currentStep.description}
                </p>

                {currentStep.features && (
                  <ul className="space-y-2 mt-3">
                    {currentStep.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-gray-700">
                        <PlayCircle size={14} className="text-blue-500 fill-blue-50 mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {currentStep.content}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className={`flex items-center gap-1 text-xs sm:text-sm font-medium ${step === 0 ? 'text-gray-300' : 'text-gray-600 hover:text-gray-900'}`}
            >
              <ChevronLeft size={16} /> 上一步
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-blue-200 hover:bg-blue-700 transition-all hover:scale-105"
            >
              {step === steps.length - 1 ? '开始高效创作' : '下一步'}
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
