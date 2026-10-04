export interface FeaturePromptItem {
  id: string;
  title: string;
  category: string;
  description: string;
  prompt: string;
  module: 'CAD' | 'OFFICE';
  tags: string[];
  difficulty?: '入门' | '进阶' | '专家';
  subApp?: 'Excel' | 'Word' | 'PPT' | 'WPS' | 'AutoCAD';
}

export const CAD_PROMPT_CATEGORIES = [
  { id: 'all', name: '全部功能', icon: 'Sparkles' },
  { id: 'draw_modify', name: '📐 绘图与几何修改', icon: 'PenTool' },
  { id: 'block_clip', name: '✂️ 图块创建与裁剪拼接', icon: 'Scissors' },
  { id: 'layer_props', name: '🎨 图层/颜色与线型管理', icon: 'Layers' },
  { id: 'dim_annotate', name: '🏷️ 尺寸标注与自动编号', icon: 'Tag' },
  { id: 'stat_export', name: '📊 面积统计与表格提取', icon: 'Table' },
  { id: 'batch_clean', name: '⚡ 批量清理与图纸标准化', icon: 'Zap' },
];

export const OFFICE_PROMPT_CATEGORIES = [
  { id: 'all', name: '全部功能', icon: 'Sparkles' },
  { id: 'excel_data', name: '📊 Excel 批量数据与报表', icon: 'Sheet' },
  { id: 'excel_formula', name: '🔢 动态公式与多表合并', icon: 'Calculator' },
  { id: 'word_doc', name: '📝 Word 文档排版与批处理', icon: 'FileText' },
  { id: 'ppt_slide', name: '📑 PPT 幻灯片自动化生成', icon: 'Presentation' },
  { id: 'wps_cross', name: '⚡ CAD ↔ Office 联动交换', icon: 'ArrowLeftRight' },
];

export const CAD_FEATURE_PROMPTS: FeaturePromptItem[] = [
  // Block & Clip
  {
    id: 'cad-block-clip-merge',
    title: '自动建块并多框裁剪紧密拼接',
    category: 'block_clip',
    description: '将所选图元转为自命名块，按多个选定矩形框分别裁剪并紧密排列',
    prompt: '将选中的对象自动变成块（块名带时间戳），块插入点自动放在对象中心。然后提示用户选择多个矩形框，并根据这些矩形框分别做独立裁剪，最后将多个裁剪后的块依次移动到相邻的矩形框边做到紧密拼接效果。',
    module: 'CAD',
    tags: ['图块', '多框裁剪', '自动拼接', '常用'],
    difficulty: '进阶',
    subApp: 'AutoCAD'
  },
  {
    id: 'cad-batch-block-replace',
    title: '批量替换同名或选定图块',
    category: 'block_clip',
    description: '保持原图块旋转角度、缩放比例和插入点，自动批量替换为目标图块',
    prompt: '编写一个 AutoLISP 命令，选择源图块和一个目标图块名，自动遍历当前图纸中所有与源图块同名的图块引用，将其替换为目标图块，同时严格保持原图块的插入点、旋转角度、X/Y/Z缩放比例以及所在图层不变。',
    module: 'CAD',
    tags: ['图块替换', '批量操作', '保持属性'],
    difficulty: '进阶',
    subApp: 'AutoCAD'
  },
  {
    id: 'cad-block-attribute-extract',
    title: '提取所有属性块属性输出为表格',
    category: 'stat_export',
    description: '自动遍历图纸中所有属性块，提取标签与值并在 CAD 内部生成 ACAD_TABLE 表格',
    prompt: '编写 AutoLISP 程序，自动框选或全图搜索名为 "GC_DOOR" 的属性块，读取块内所有的属性标签（如：门编号、门宽度、高度、材质），统计数量并在图纸指定点插入一个整齐的 AutoCAD 原生表格（ACAD_TABLE）。',
    module: 'CAD',
    tags: ['属性块', '数量统计', '自动表格'],
    difficulty: '进阶',
    subApp: 'AutoCAD'
  },
  
  // Draw & Modify
  {
    id: 'cad-draw-axis-grid',
    title: '自动生成建筑/结构轴网与轴号',
    category: 'draw_modify',
    description: '输入 X 向与 Y 向开间进深尺寸列表，一键生成轴线、自动圆圈轴号与双向标注',
    prompt: '请生成一个 AutoLISP 轴网生成命令 (c:MAKEAXIS)。提示用户输入 X 方向开间尺寸序列（如 3600,4200,3600）和 Y 方向进深尺寸序列（如 6000,6000），自动在 "DOTE_AXIS" 图层绘制点划线轴网，并在四周自动绘制带有 1,2,3... 与 A,B,C... 编号的轴号气泡及总尺寸标注。',
    module: 'CAD',
    tags: ['轴网生成', '轴号气泡', '尺寸标注'],
    difficulty: '进阶',
    subApp: 'AutoCAD'
  },
  {
    id: 'cad-polyline-fillet-all',
    title: '多段线所有拐角批量倒圆角',
    category: 'draw_modify',
    description: '选择封闭或开口多段线，一键将其所有折角顶点批量倒指定半径的圆角',
    prompt: '编写 AutoLISP 程序，让用户输入圆角半径，然后框选多条二维多段线（LWPOLYLINE），程序自动为选中的每条多段线的所有连续折角节点执行 Fillet 倒圆角，无需手动一个个点击角点。',
    module: 'CAD',
    tags: ['多段线', '批量倒圆角', '顶点修改'],
    difficulty: '入门',
    subApp: 'AutoCAD'
  },
  {
    id: 'cad-connect-lines-to-polyline',
    title: '断开线条一键公差闭合为多段线',
    category: 'draw_modify',
    description: '框选断续线段，在设定模糊公差内自动延长并 Join 合并为单一闭合多段线',
    prompt: '编写 AutoLISP 命令，框选杂乱的 Line 和 Arc 线段，提示输入连接公差（默认 5.0），自动调用 PEDIT 多段线编辑命令将端点接近的线段批量合并为光滑闭合的 LWPOLYLINE。',
    module: 'CAD',
    tags: ['线段合并', 'PEDIT', '自动闭合'],
    difficulty: '入门',
    subApp: 'AutoCAD'
  },

  // Dimension & Annotate
  {
    id: 'cad-auto-dim-lines',
    title: '选定线段/多边形全自动对齐标注',
    category: 'dim_annotate',
    description: '批量框选任意线段或多段线，在两侧外侧自动生成清晰的对齐尺寸标注',
    prompt: '编写一个 AutoLISP 自动标注工具 (c:AUTODIM)。用户框选一组线段或多段线，程序自动计算每段线段的长度、方向和外法线向量，在距离线段 300 宽度的外侧自动生成 Aligned 对齐标注（DIMALIGNED），文字放置在 "DIM_AUTO" 图层。',
    module: 'CAD',
    tags: ['自动标注', '尺寸标注', '批量出图'],
    difficulty: '进阶',
    subApp: 'AutoCAD'
  },
  {
    id: 'cad-auto-number-circles',
    title: '连续点击或按坐标顺序自动递增编号',
    category: 'dim_annotate',
    description: '支持前缀+数字递增，自动带圆形背景或引线，可按从左到右从上到下排序编号',
    prompt: '编写 AutoLISP 递增编号程序 (c:AUTONUM)。支持设置前缀（如 "ZK-"）、起始编号（如 1）、圆圈半径和文字字高。提供两种模式：1. 鼠标点击连续放置；2. 框选已有圆或文字，按先上后下、先左后右的坐标顺序自动批量重命名编号。',
    module: 'CAD',
    tags: ['自动编号', '递增序列', '坐标排序'],
    difficulty: '入门',
    subApp: 'AutoCAD'
  },
  {
    id: 'cad-coord-annotation-table',
    title: '拾取点位坐标标注并导出坐标清单',
    category: 'dim_annotate',
    description: '点击点位自动引线标注 X/Y 测量坐标，并把所有点坐标生成在右侧表格中',
    prompt: '编写 AutoLISP 点位坐标引线标注命令。用户连续点击图纸关键点，程序自动在点位生成小十字标记，并画引线标注其 X/Y 坐标（X=... Y=... 保留3位小数）。点击回车结束时，在图纸空白处自动绘制包含 点号、X坐标、Y坐标 的汇总表格。',
    module: 'CAD',
    tags: ['坐标引线', '测量放样', '表格输出'],
    difficulty: '进阶',
    subApp: 'AutoCAD'
  },

  // Statistics & Export
  {
    id: 'cad-calc-closed-areas',
    title: '批量计算闭合区域面积并标注在中心',
    category: 'stat_export',
    description: '框选多个闭合多段线或圆，在各几何中心写出平米面积，并在最后汇总总面积',
    prompt: '编写 AutoLISP 程序 (c:SUMAREA)。用户框选图纸中的闭合多段线，程序自动计算每个封闭轮廓的面积（自动转为平方米，保留2位小数），在其几何中心放置面积文字（如 "S=125.68 ㎡"）。并在命令行输出已处理图形数量和总面积求和。',
    module: 'CAD',
    tags: ['面积计算', '平方米换算', '批量统计'],
    difficulty: '入门',
    subApp: 'AutoCAD'
  },
  {
    id: 'cad-pipe-wire-length-summary',
    title: '按图层或线型分类统计总线长',
    category: 'stat_export',
    description: '框选管线/线缆图纸，自动按图层分类求和直线、多段线、圆弧的总长度',
    prompt: '编写 AutoLISP 管线长度分类统计工具。用户框选图纸区域，程序自动遍历所有 Line, Arc, Lwpolyline, Spline 对象，按图层（Layer）分别汇总累计总长度，在命令行输出清单并在图纸上生成清晰的统计报表文本。',
    module: 'CAD',
    tags: ['线长统计', '工程量算量', '图层汇总'],
    difficulty: '进阶',
    subApp: 'AutoCAD'
  },

  // Layer & Properties
  {
    id: 'cad-layer-standard-setup',
    title: '一键建立专业标准图层体系',
    category: 'layer_props',
    description: '自动批量创建建筑/机械标准图层（轴线、墙体、门窗、标注、电气等）并指定颜色线型',
    prompt: '编写一个 AutoLISP 图层初始化脚本 (c:INITLAYERS)。自动创建标准建筑设计图层：01-AXIS(红色,CENTER点划线)、02-WALL(白色,粗线)、03-DOOR(绿色,Continuous)、04-DIM(青色,Continuous)、05-TEXT(黄色,Continuous)、06-HATCH(8号灰,Continuous)。如果图层已存在则不报错并更新属性。',
    module: 'CAD',
    tags: ['标准图层', '线型加载', '图纸规范'],
    difficulty: '入门',
    subApp: 'AutoCAD'
  },
  {
    id: 'cad-isolate-dim-layers',
    title: '图层状态快速隔离/只显示选定图层',
    category: 'layer_props',
    description: '快速关闭或冻结除选定对象所在图层之外的所有图层，并提供一键恢复命令',
    prompt: '编写 AutoLISP 程序包含两个命令：1. (c:LAYISO2) 选择一个或多个对象，仅保留它们所在的图层可见，关闭其他所有图层；2. (c:LAYON2) 一键开启并解冻所有被隐藏的图层，快速恢复视图。',
    module: 'CAD',
    tags: ['图层隔离', '图层开关', '快捷浏览'],
    difficulty: '入门',
    subApp: 'AutoCAD'
  },

  // Batch & Clean
  {
    id: 'cad-deep-purge-audit',
    title: '超级深度清理与图纸瘦身修复',
    category: 'batch_clean',
    description: '清理多余未用图块、图层、线型、字典以及零长度图元与空文字',
    prompt: '编写 AutoLISP 深度清理命令 (c:SUPERPURGE)。自动删除图纸中的所有空文字（空文本与空格文本）、零长度线段、孤立点，并静默连续执行3次全深度 PURGE（清理所有未用块、图层、标注样式、材料、RegApp注册应用程序），最后执行 AUDIT 修复图纸错误。',
    module: 'CAD',
    tags: ['图纸瘦身', 'PURGE', 'AUDIT', '清理空文字'],
    difficulty: '入门',
    subApp: 'AutoCAD'
  },
  {
    id: 'cad-change-all-to-bylayer',
    title: '全图强制设置为 ByLayer 随层',
    category: 'batch_clean',
    description: '将所有图元（包括嵌套在图块内部的图元）的颜色、线型、线宽统一改为随层',
    prompt: '编写 AutoLISP 脚本，将图纸中所有对象（包括已存在块定义内部的子图元）的 Color 强制修改为 256(ByLayer)，Linetype 修改为 "ByLayer"，Lineweight 修改为 -1(ByLayer)，确保图纸打印和归档规范一致。',
    module: 'CAD',
    tags: ['随层规范', 'ByLayer', '块内穿透修改'],
    difficulty: '进阶',
    subApp: 'AutoCAD'
  }
];

export const OFFICE_FEATURE_PROMPTS: FeaturePromptItem[] = [
  // Excel Data & Reports
  {
    id: 'excel-merge-multi-worksheets',
    title: '多工作表结构相同数据一键自动合并',
    category: 'excel_data',
    description: '自动遍历当前工作簿中所有分表，将表头保留并将下方数据汇总到一个名为【汇总表】中',
    prompt: '编写一段 Excel VBA 宏 (Sub MergeAllSheets)。自动扫描当前工作簿中除 "汇总表" 外的所有工作表，提取每个表的第1行为标题，将所有子表的数据行自上而下追加合并到新建的 "汇总表" 中，并在最后一列自动标记来源工作表名称。',
    module: 'OFFICE',
    tags: ['多表合并', '自动汇总', 'VBA 宏'],
    difficulty: '进阶',
    subApp: 'Excel'
  },
  {
    id: 'excel-batch-split-by-column',
    title: '按指定列内容拆分为独立工作表/文件',
    category: 'excel_data',
    description: '例如按“部门”或“地区”列，将一张大总表自动拆分为多个独立工作表或独立工作簿',
    prompt: '编写 Excel VBA 宏，提示用户选择关键分类列（例如“部门”列）。程序自动获取该列的不重复值，为每个类别新建一个工作表，将对应的数据行完整复制进去，并自动保留原表的标题格式与列宽。',
    module: 'OFFICE',
    tags: ['数据拆分', '按列分类', '工作表拆分'],
    difficulty: '进阶',
    subApp: 'Excel'
  },
  {
    id: 'excel-clean-duplicates-and-spaces',
    title: '批量数据清洗：去空格、去重与格式标准化',
    category: 'excel_data',
    description: '清洗选中区域的文本：清除首尾空格、去除不可见字符、文本型数字转数值、高亮重复项',
    prompt: '编写 Excel VBA 宏 (Sub CleanData)。对选中的单元格区域执行深度数据清洗：1. 清除所有字符串的前后空格与全角空格；2. 将纯数字的文本单元格转为真实数字格式；3. 将日期字符串统一转为 YYYY-MM-DD；4. 用浅红色背景标出重复项。',
    module: 'OFFICE',
    tags: ['数据清洗', '去重', '去除空格', '格式标准化'],
    difficulty: '入门',
    subApp: 'Excel'
  },
  {
    id: 'excel-batch-insert-pictures',
    title: '按货号/名称批量对齐插入本地图片',
    category: 'excel_data',
    description: '读取 A 列商品名称或代码，自动在对应文件夹寻找同名 JPG/PNG 图片插入到 B 列单元格居中适应',
    prompt: '编写 Excel VBA 宏 (Sub BatchInsertImages)。用户选择图片所在文件夹后，遍历 A 列从第2行开始的编号/名称，在文件夹寻找对应的图片文件，插入到同行的 B 列单元格中，并自动等比例缩放居中填入单元格边框内，设置随单元格移动与大小调整。',
    module: 'OFFICE',
    tags: ['批量插图', '图片对齐', '商品报表'],
    difficulty: '进阶',
    subApp: 'Excel'
  },

  // Excel Formulas
  {
    id: 'excel-advanced-xlookup-formula',
    title: '多条件双向查找匹配与动态求和公式',
    category: 'excel_formula',
    description: '使用 XLOOKUP / INDEX-MATCH 组合编写支持模糊匹配与多重条件的动态引用公式',
    prompt: '请提供实用的 Excel 动态高级公式方案：要求根据【员工姓名】和【月份】两个条件，在年度工资总表中双向查找对应奖金金额，并附带容错处理（若未找到返回 0 或 "待核对"）。请分别给出 XLOOKUP 现代写法和传统 INDEX+MATCH 兼容写法。',
    module: 'OFFICE',
    tags: ['XLOOKUP', '多条件查找', '动态公式'],
    difficulty: '入门',
    subApp: 'Excel'
  },
  {
    id: 'excel-sumifs-dynamic-date-range',
    title: '动态日期区间多条件 SUMIFS 与唯一值去重计数',
    category: 'excel_formula',
    description: '按起止日期范围、指定客户类型动态统计销售额及不重复客户数',
    prompt: '请写出 Excel 动态统计公式：1. 根据单元格输入的起始日期和结束日期，多条件求和指定类别的销售额（SUMIFS）；2. 使用 UNIQUE/COUNTA 统计该时间区间内参与采购的不重复客户数量。',
    module: 'OFFICE',
    tags: ['SUMIFS', 'UNIQUE', '去重统计'],
    difficulty: '入门',
    subApp: 'Excel'
  },

  // Word Document
  {
    id: 'word-batch-format-styles',
    title: '一键规范化长文档标题与正文字体排版',
    category: 'word_doc',
    description: '按公文或学术标准批量设定一二三级标题字体字号、首行缩进2字符、1.5倍行距',
    prompt: '编写 Word VBA 宏 (Sub StandardizeDocumentFormat)。一键将当前打开的 Word 文档统一排版：一级标题设为黑体二号居中加粗，二级标题设为黑体三号左对齐，正文统一设为宋体小四号（西文 Times New Roman），首行缩进 2 字符，段落行距设为固定值 22 磅，段前段后 0 磅。',
    module: 'OFFICE',
    tags: ['公文排版', '样式统一', '段落缩进'],
    difficulty: '入门',
    subApp: 'Word'
  },
  {
    id: 'word-batch-replace-wildcards',
    title: 'Word 批量正则/通配符清洗多余空行与格式',
    category: 'word_doc',
    description: '使用通配符搜索替换，将连续多个空行压缩为单空行、清理文档乱码与手动换行符',
    prompt: '编写 Word VBA 宏，自动执行批量替换清洗：1. 将所有的手动换行符 (^l) 替换为标准段落标记 (^p)；2. 将连续两个以上的空白段落标记合并为一个；3. 清除所有段落首尾的无用空格。',
    module: 'OFFICE',
    tags: ['通配符替换', '清除空行', '文本整理'],
    difficulty: '入门',
    subApp: 'Word'
  },

  // PPT Automation
  {
    id: 'ppt-batch-create-from-excel',
    title: '读取 Excel 表格内容批量生成 PPT 幻灯片',
    category: 'ppt_slide',
    description: '自动读取 Excel 中每行标题与内容，在 PowerPoint 中为每行自动生成一页精美版式幻灯片',
    prompt: '编写 VBA 宏（可在 Excel 或 PPT 中运行），打开指定的 Excel 表格，遍历每一行数据（A列为页标题，B列为核心要点，C列为补充说明），在 PowerPoint 演示文稿中自动新增一页幻灯片，填入对应文本框并设置标题加粗与阴影效果。',
    module: 'OFFICE',
    tags: ['PPT 批量生成', 'Excel 联动', '自动化排版'],
    difficulty: '进阶',
    subApp: 'PPT'
  },

  // CAD <-> Office Cross
  {
    id: 'cross-cad-coords-to-excel',
    title: 'CAD 点位桩号坐标直接生成 Excel 施工放样表',
    category: 'wps_cross',
    description: '框选 CAD 点或圆，直接输出标准 Excel 放样测量表格（点号、X坐标、Y坐标、标高）',
    prompt: '编写 AutoLISP / VBA 方案：在 AutoCAD 中框选所有桩位点或桩号圆圈，按点号排序提取其真实的 X/Y/Z 空间坐标，直接自动启动 Excel 并写入包含【点号、北坐标X、东坐标Y、设计标高H】的工程放样表格并自动保存。',
    module: 'OFFICE',
    tags: ['CAD到Excel', '坐标导出', '施工放样'],
    difficulty: '专家',
    subApp: 'AutoCAD'
  }
];
