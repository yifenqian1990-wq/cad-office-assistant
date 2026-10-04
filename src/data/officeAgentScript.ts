// 本地 Office / WPS 中转代理脚本
export const officeScriptCode = `import asyncio
import websockets
import json
import re
import win32com.client
import pythoncom
import win32gui
import gc
import ctypes

def format_com_error(e, app_name="Office"):
    err_str = str(e)
    if "-2147221021" in err_str or "0x800401e3" in err_str.lower() or "操作无法使用" in err_str:
        return f"未检测到运行中的 {app_name}（COM 错误: 操作无法使用）。请确保已启动 {app_name} 且处于打开或新建文档状态。若使用的是 WPS，请在网页上方目标应用中切换为 WPS 对应软件；若 Word 刚打开，请在 Word 界面中点击一下激活窗口后再试。"
    if "-2147352567" in err_str or "没有打开的文档" in err_str or "command not available" in err_str.lower():
        return f"{app_name} 中当前没有打开的文档或工作簿。请先在 {app_name} 中打开或新建一个文件。"
    if "-2147418111" in err_str or "-2147417846" in err_str or "被呼叫方拒绝接收呼叫" in err_str or "rejected by callee" in err_str.lower() or "busy" in err_str.lower():
        return f"{app_name} 当前正忙（例如正在编辑单元格、弹出了模态对话框或正在保存），请在软件中按 Esc 退出编辑状态或关闭弹窗后重试。"
    if "-2146827284" in err_str or "0x800a03ec" in err_str or "trust access" in err_str.lower() or "信任" in err_str:
        return f"需要启用对 VBA 工程对象模型的信任访问。请在 {app_name} 设置中勾选「信任对 VBA 工程对象模型的访问」。"
    return f"{app_name} 操作失败: {err_str}"

def get_word_instance(preferred_name=None):
    """
    多重兜底获取 Word / WPS 文字 COM 实例：
    1. 依次尝试 ProgID: Word.Application, KWps.Application, WPS.Application, Kwps.Application
    2. ROT (Running Object Table) 检索已打开的文档 moniker (.docx, .doc, .wps 等)
    3. Windows 窗口句柄探测 (_WwG, OpusApp, KWPS_DocView, WPS_DocView) 通过 AccessibleObjectFromWindow
    4. win32com.client.Dispatch 探测已有进程
    """
    progids = ["Word.Application", "KWps.Application", "WPS.Application", "Kwps.Application"]
    if preferred_name == "WPS Word":
        progids = ["KWps.Application", "WPS.Application", "Kwps.Application", "Word.Application"]

    # 1. GetActiveObject
    for progid in progids:
        try:
            app = win32com.client.GetActiveObject(progid)
            if app:
                detected = "WPS Word" if "wps" in progid.lower() else "Word"
                return app, detected
        except:
            pass

    # 2. ROT (Running Object Table)
    try:
        rot = pythoncom.GetRunningObjectTable()
        bind_ctx = pythoncom.CreateBindCtx()
        for moniker in rot:
            try:
                name = moniker.GetDisplayName(bind_ctx, None)
                if any(name.lower().endswith(ext) for ext in [".docx", ".doc", ".docm", ".dotx", ".dotm", ".wps", ".rtf"]):
                    unknown = rot.GetObject(moniker)
                    disp = unknown.QueryInterface(pythoncom.IID_IDispatch)
                    doc = win32com.client.Dispatch(disp)
                    if hasattr(doc, "Application"):
                        app = doc.Application
                        detected = "Word"
                        try:
                            if "wps" in str(getattr(app, "Name", "")).lower() or name.lower().endswith(".wps"):
                                detected = "WPS Word"
                        except: pass
                        return app, detected
            except:
                pass
    except:
        pass

    # 3. AccessibleObjectFromWindow
    try:
        oleacc = ctypes.windll.oleacc
        hwnds = []
        def enum_cb(h, _):
            if win32gui.IsWindow(h) and win32gui.IsWindowVisible(h):
                cls = win32gui.GetClassName(h)
                if cls in ("_WwG", "OpusApp", "KWPS_DocView", "WPS_DocView", "KWps"):
                    hwnds.append((h, cls))
            return True
        try:
            win32gui.EnumWindows(enum_cb, None)
        except: pass

        IID_IDispatch = ctypes.c_buffer(pythoncom.IID_IDispatch)
        OBJID_NATIVEOM = -16

        for h, cls in hwnds:
            target_h = h
            if cls in ("OpusApp", "KWps"):
                child_h = []
                def enum_ch(ch, _):
                    if win32gui.GetClassName(ch) in ("_WwG", "KWPS_DocView", "WPS_DocView"):
                        child_h.append(ch)
                    return True
                try:
                    win32gui.EnumChildWindows(h, enum_ch, None)
                    if child_h:
                        target_h = child_h[0]
                except: pass

            ptr = ctypes.c_void_p()
            hr = oleacc.AccessibleObjectFromWindow(
                target_h,
                OBJID_NATIVEOM,
                ctypes.byref(IID_IDispatch),
                ctypes.byref(ptr)
            )
            if hr == 0 and ptr.value:
                try:
                    pdisp = pythoncom.ObjectFromAddress(ptr.value)
                    obj = win32com.client.Dispatch(pdisp)
                    detected = "WPS Word" if ("kwps" in cls.lower() or "wps" in cls.lower()) else "Word"
                    if hasattr(obj, "Application"):
                        return obj.Application, detected
                    elif hasattr(obj, "ActiveDocument"):
                        return obj, detected
                except: pass
    except: pass

    # 4. Dispatch fallback
    for progid in progids:
        try:
            app = win32com.client.Dispatch(progid)
            if app and hasattr(app, "Documents") and app.Documents.Count > 0:
                detected = "WPS Word" if "wps" in progid.lower() else "Word"
                return app, detected
        except: pass

    return None, None

def get_excel_instance(preferred_name=None):
    progids = ["Excel.Application", "ET.Application", "KET.Application"]
    if preferred_name == "WPS Excel":
        progids = ["ET.Application", "KET.Application", "Excel.Application"]

    for progid in progids:
        try:
            app = win32com.client.GetActiveObject(progid)
            if app:
                detected = "WPS Excel" if ("et" in progid.lower() or "ket" in progid.lower()) else "Excel"
                return app, detected
        except: pass

    # ROT
    try:
        rot = pythoncom.GetRunningObjectTable()
        bind_ctx = pythoncom.CreateBindCtx()
        for moniker in rot:
            try:
                name = moniker.GetDisplayName(bind_ctx, None)
                if any(name.lower().endswith(ext) for ext in [".xlsx", ".xls", ".xlsm", ".xlsb", ".csv", ".et"]):
                    unknown = rot.GetObject(moniker)
                    disp = unknown.QueryInterface(pythoncom.IID_IDispatch)
                    wb = win32com.client.Dispatch(disp)
                    if hasattr(wb, "Application"):
                        app = wb.Application
                        detected = "WPS Excel" if (name.lower().endswith(".et") or "et" in str(getattr(app, "Name", "")).lower()) else "Excel"
                        return app, detected
            except: pass
    except: pass

    # AccessibleObjectFromWindow
    try:
        oleacc = ctypes.windll.oleacc
        hwnds = []
        def enum_cb(h, _):
            if win32gui.IsWindow(h) and win32gui.IsWindowVisible(h):
                cls = win32gui.GetClassName(h)
                if cls in ("EXCEL7", "XLMAIN", "KET_DocView"):
                    hwnds.append((h, cls))
            return True
        try:
            win32gui.EnumWindows(enum_cb, None)
        except: pass

        IID_IDispatch = ctypes.c_buffer(pythoncom.IID_IDispatch)
        OBJID_NATIVEOM = -16
        for h, cls in hwnds:
            target_h = h
            if cls == "XLMAIN":
                child_h = []
                def enum_ch(ch, _):
                    if win32gui.GetClassName(ch) in ("EXCEL7", "KET_DocView"):
                        child_h.append(ch)
                    return True
                try:
                    win32gui.EnumChildWindows(h, enum_ch, None)
                    if child_h:
                        target_h = child_h[0]
                except: pass

            ptr = ctypes.c_void_p()
            hr = oleacc.AccessibleObjectFromWindow(
                target_h,
                OBJID_NATIVEOM,
                ctypes.byref(IID_IDispatch),
                ctypes.byref(ptr)
            )
            if hr == 0 and ptr.value:
                try:
                    pdisp = pythoncom.ObjectFromAddress(ptr.value)
                    obj = win32com.client.Dispatch(pdisp)
                    detected = "WPS Excel" if "ket" in cls.lower() else "Excel"
                    if hasattr(obj, "Application"):
                        return obj.Application, detected
                    elif hasattr(obj, "ActiveWorkbook"):
                        return obj, detected
                except: pass
    except: pass

    for progid in progids:
        try:
            app = win32com.client.Dispatch(progid)
            if app and hasattr(app, "Workbooks") and app.Workbooks.Count > 0:
                detected = "WPS Excel" if "et" in progid.lower() else "Excel"
                return app, detected
        except: pass

    return None, None

def get_ppt_instance(preferred_name=None):
    progids = ["PowerPoint.Application", "WPP.Application", "KWPP.Application"]
    if preferred_name == "WPS PPT":
        progids = ["WPP.Application", "KWPP.Application", "PowerPoint.Application"]

    for progid in progids:
        try:
            app = win32com.client.GetActiveObject(progid)
            if app:
                detected = "WPS PPT" if "wpp" in progid.lower() else "PowerPoint"
                return app, detected
        except: pass

    try:
        rot = pythoncom.GetRunningObjectTable()
        bind_ctx = pythoncom.CreateBindCtx()
        for moniker in rot:
            try:
                name = moniker.GetDisplayName(bind_ctx, None)
                if any(name.lower().endswith(ext) for ext in [".pptx", ".ppt", ".dps"]):
                    unknown = rot.GetObject(moniker)
                    disp = unknown.QueryInterface(pythoncom.IID_IDispatch)
                    pres = win32com.client.Dispatch(disp)
                    if hasattr(pres, "Application"):
                        detected = "WPS PPT" if name.lower().endswith(".dps") else "PowerPoint"
                        return pres.Application, detected
            except: pass
    except: pass

    for progid in progids:
        try:
            app = win32com.client.Dispatch(progid)
            if app and hasattr(app, "Presentations") and app.Presentations.Count > 0:
                detected = "WPS PPT" if "wpp" in progid.lower() else "PowerPoint"
                return app, detected
        except: pass

    return None, None

# This script runs on port 8767 and handles VBA/VB code execution for Office/WPS
async def handle_client(websocket):
    print("Office/WPS Client connected!")
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                action = data.get("action")
                
                if action == "get_apps":
                    pythoncom.CoInitialize()
                    apps_info = []
                    try:
                        # 1. Excel / WPS Excel
                        xl, xl_name = get_excel_instance()
                        if xl:
                            workbooks = []
                            try:
                                for i in range(1, xl.Workbooks.Count + 1):
                                    wb = xl.Workbooks.Item(i)
                                    sheets = []
                                    try:
                                        for j in range(1, wb.Sheets.Count + 1):
                                            sheets.append(wb.Sheets.Item(j).Name)
                                    except: pass
                                    act_sheet = None
                                    try:
                                        act_sheet = wb.ActiveSheet.Name if wb.ActiveSheet else None
                                    except: pass
                                    workbooks.append({
                                        "name": wb.Name,
                                        "sheets": sheets,
                                        "active_sheet": act_sheet
                                    })
                            except: pass
                            act_wb = None
                            try:
                                act_wb = xl.ActiveWorkbook.Name if xl.ActiveWorkbook else None
                            except: pass
                            apps_info.append({
                                "name": xl_name or "Excel",
                                "workbooks": workbooks,
                                "active_workbook": act_wb or (workbooks[0]["name"] if workbooks else None)
                            })

                        # 2. Word / WPS Word
                        wd, wd_name = get_word_instance()
                        if wd:
                            docs = []
                            try:
                                for i in range(1, wd.Documents.Count + 1):
                                    try:
                                        docs.append(wd.Documents.Item(i).Name)
                                    except: pass
                            except: pass
                            act_doc = None
                            try:
                                act_doc = wd.ActiveDocument.Name if wd.ActiveDocument else None
                            except: pass
                            apps_info.append({
                                "name": wd_name or "Word",
                                "documents": docs,
                                "active_document": act_doc or (docs[0] if docs else None)
                            })

                        # 3. PowerPoint / WPS PPT
                        ppt, ppt_name = get_ppt_instance()
                        if ppt:
                            slides = []
                            try:
                                for i in range(1, ppt.Presentations.Count + 1):
                                    try:
                                        slides.append(ppt.Presentations.Item(i).Name)
                                    except: pass
                            except: pass
                            act_pres = None
                            try:
                                act_pres = ppt.ActivePresentation.Name if ppt.ActivePresentation else None
                            except: pass
                            apps_info.append({
                                "name": ppt_name or "PowerPoint",
                                "documents": slides,
                                "active_document": act_pres or (slides[0] if slides else None)
                            })

                        await websocket.send(json.dumps({"type": "apps", "data": apps_info}))
                    except Exception as e_apps:
                        print(f"get_apps error: {e_apps}")
                    finally:
                        gc.collect()
                        pythoncom.CoUninitialize()
                        
                elif action == "get_office_data":
                    target_app = data.get("app") or "Word"
                    target_wb_name = data.get("workbook")
                    target_ws_name = data.get("worksheet")
                    target_doc_name = data.get("document")
                    pythoncom.CoInitialize()
                    try:
                        is_word_request = target_app in ("Word", "WPS Word")
                        is_excel_request = target_app in ("Excel", "WPS Excel")
                        is_ppt_request = target_app in ("PowerPoint", "WPS PPT")

                        # If user requested Word (or if Excel was selected by default but only Word is open)
                        if is_word_request:
                            wd, detected_name = get_word_instance(target_app)
                            if not wd:
                                xl_check, xl_cname = get_excel_instance()
                                if xl_check:
                                    is_excel_request = True
                                    is_word_request = False
                                    target_app = xl_cname
                                else:
                                    raise Exception(format_com_error("(-2147221021, '操作无法使用', None, None)", "Word / WPS 文字"))

                        if is_word_request:
                            wd, detected_name = get_word_instance(target_app)
                            if not wd:
                                raise Exception("未检测到运行中的 Word 或 WPS 文字软件。请确保已启动 Word 或 WPS 并打开或新建了一份文档。")

                            doc = None
                            if target_doc_name:
                                try:
                                    doc = wd.Documents(target_doc_name)
                                except: pass
                            if not doc:
                                try:
                                    doc = wd.ActiveDocument
                                except: pass
                            if not doc:
                                try:
                                    if wd.Documents.Count > 0:
                                        doc = wd.Documents.Item(1)
                                except: pass
                            if not doc:
                                raise Exception("Word 中没有打开的文档，请先在 Word / WPS 中打开或新建一份文档。")

                            sel = None
                            try:
                                sel = wd.Selection
                            except: pass

                            selected_text = ""
                            mode = "选中文本"
                            if sel:
                                try:
                                    t = sel.Text
                                    if t and t not in ("\\r", "\\r\\n", "\\n", "\\x07"):
                                        selected_text = t
                                except: pass

                            if not selected_text or selected_text.strip() == "":
                                mode = "全文内容"
                                try:
                                    content_range = doc.Content
                                    total_len = content_range.End
                                    if total_len > 0:
                                        sample_len = min(total_len, 6000)
                                        selected_text = doc.Range(0, sample_len).Text
                                        if total_len > sample_len:
                                            selected_text += f"\\n\\n[注：文档较长，以上为前 {sample_len} 字符节选，总字符数约 {total_len}]"
                                except Exception as e_text:
                                    selected_text = f"读取全文失败: {e_text}"

                            doc_name = "未命名文档"
                            try:
                                doc_name = doc.Name
                            except: pass

                            para_count = 0
                            try: para_count = doc.Paragraphs.Count
                            except: pass
                            word_count = 0
                            try: word_count = doc.Words.Count
                            except: pass
                            table_count = 0
                            try: table_count = doc.Tables.Count
                            except: pass

                            tables_data = []
                            try:
                                if table_count > 0:
                                    for t_i in range(1, min(table_count, 3) + 1):
                                        tbl = doc.Tables.Item(t_i)
                                        t_rows = []
                                        for r_i in range(1, min(tbl.Rows.Count, 10) + 1):
                                            r_cols = []
                                            for c_i in range(1, min(tbl.Columns.Count, 10) + 1):
                                                try:
                                                    c_text = tbl.Cell(r_i, c_i).Range.Text.rstrip('\\r\\x07\\n')
                                                    r_cols.append(c_text)
                                                except: pass
                                            if r_cols:
                                                t_rows.append(r_cols)
                                        if t_rows:
                                            tables_data.append({"index": t_i, "rows": t_rows})
                            except: pass

                            await websocket.send(json.dumps({
                                "type": "office_data",
                                "status": "Success",
                                "app": detected_name or "Word",
                                "document": doc_name,
                                "data": {
                                    "type": "Word",
                                    "mode": mode,
                                    "text": selected_text,
                                    "length": len(selected_text),
                                    "stats": {
                                        "paragraphs": para_count,
                                        "words": word_count,
                                        "tables": table_count
                                    },
                                    "tables": tables_data
                                }
                            }))

                        elif is_excel_request:
                            xl, detected_name = get_excel_instance(target_app)
                            if not xl:
                                # Fallback: check if Word is open instead
                                wd_check, wd_cname = get_word_instance()
                                if wd_check:
                                    doc = None
                                    try: doc = wd_check.ActiveDocument
                                    except: pass
                                    if not doc and wd_check.Documents.Count > 0:
                                        doc = wd_check.Documents.Item(1)
                                    text_val = ""
                                    try: text_val = doc.Content.Text[:3000] if doc else ""
                                    except: pass
                                    await websocket.send(json.dumps({
                                        "type": "office_data",
                                        "status": "Success",
                                        "app": wd_cname or "Word",
                                        "document": doc.Name if doc else "活动文档",
                                        "data": {
                                            "type": "Word",
                                            "mode": "自动切换检测到Word",
                                            "text": text_val,
                                            "length": len(text_val)
                                        }
                                    }))
                                    return
                                raise Exception(format_com_error("(-2147221021, '操作无法使用', None, None)", "Excel / WPS 表格"))

                            wb = None
                            if target_wb_name:
                                try: wb = xl.Workbooks(target_wb_name)
                                except: pass
                            if not wb:
                                try: wb = xl.ActiveWorkbook
                                except: pass
                            if not wb and xl.Workbooks.Count > 0:
                                wb = xl.Workbooks.Item(1)
                            if not wb:
                                raise Exception("未找到打开的 Excel 工作簿，请先在 Excel 中打开或新建一个文件。")

                            ws = None
                            if target_ws_name:
                                try: ws = wb.Sheets(target_ws_name)
                                except: pass
                            if not ws:
                                try: ws = xl.ActiveSheet
                                except: pass
                            if not ws:
                                ws = wb.Sheets.Item(1)

                            sel = None
                            try: sel = xl.Selection
                            except: pass

                            cell_data = []
                            if sel:
                                try:
                                    val = sel.Value
                                    if val is not None:
                                        if isinstance(val, tuple) or isinstance(val, list):
                                            cell_data = [list(r) if isinstance(r, (tuple, list)) else [r] for r in val]
                                        else:
                                            cell_data = [[val]]
                                except Exception as e_range:
                                    print(f"Read range error: {e_range}")

                            if not cell_data:
                                try:
                                    val = ws.Range("A1:D10").Value
                                    if val is not None:
                                        if isinstance(val, tuple) or isinstance(val, list):
                                            cell_data = [list(r) if isinstance(r, (tuple, list)) else [r] for r in val]
                                        else:
                                            cell_data = [[val]]
                                except: pass

                            act_cell = None
                            try: act_cell = xl.ActiveCell.Address
                            except: pass

                            await websocket.send(json.dumps({
                                "type": "office_data",
                                "status": "Success",
                                "app": detected_name or "Excel",
                                "workbook": wb.Name,
                                "worksheet": ws.Name,
                                "data": {
                                    "type": "Excel",
                                    "selection_values": cell_data,
                                    "active_cell": act_cell,
                                    "rows_count": len(cell_data) if cell_data else 0
                                }
                            }))

                        elif is_ppt_request:
                            ppt, detected_name = get_ppt_instance(target_app)
                            if not ppt:
                                raise Exception(format_com_error("(-2147221021, '操作无法使用', None, None)", "PowerPoint / WPS 演示"))

                            pres = None
                            if target_doc_name:
                                try: pres = ppt.Presentations(target_doc_name)
                                except: pass
                            if not pres:
                                try: pres = ppt.ActivePresentation
                                except: pass
                            if not pres and ppt.Presentations.Count > 0:
                                pres = ppt.Presentations.Item(1)
                            if not pres:
                                raise Exception("未找到活动演示文稿，请先打开 PPT 文件。")

                            slides_info = []
                            try:
                                for i in range(1, min(pres.Slides.Count, 5) + 1):
                                    slide = pres.Slides.Item(i)
                                    shapes_text = []
                                    for shape in slide.Shapes:
                                        try:
                                            if shape.HasTextFrame and shape.TextFrame.HasText:
                                                shapes_text.append(shape.TextFrame.TextRange.Text)
                                        except: pass
                                    slides_info.append({
                                        "slide_index": i,
                                        "text_elements": shapes_text
                                    })
                            except: pass

                            await websocket.send(json.dumps({
                                "type": "office_data",
                                "status": "Success",
                                "app": detected_name or "PowerPoint",
                                "document": pres.Name,
                                "data": {
                                    "type": "PowerPoint",
                                    "slides": slides_info,
                                    "total_slides": pres.Slides.Count
                                }
                            }))
                        else:
                            raise Exception(f"不支持读取 {target_app} 的数据")
                    except Exception as e_read:
                        err_msg = format_com_error(e_read, target_app or "Office")
                        print(f"Read office data error: {e_read}")
                        await websocket.send(json.dumps({"type": "error", "message": err_msg}))
                    finally:
                        gc.collect()
                        pythoncom.CoUninitialize()
                    
                elif action == "execute_vba":
                    code = data.get("code")
                    target_app = data.get("app") or "Word"
                    target_workbook = data.get("workbook")
                    target_worksheet = data.get("worksheet")
                    target_document = data.get("document")
                    print(f"Executing VBA code in {target_app}...")
                    
                    pythoncom.CoInitialize()
                    try:
                        if target_app == "Excel" or target_app == "WPS Excel":
                            xl, detected_name = get_excel_instance(target_app)
                            if not xl:
                                raise Exception(format_com_error("(-2147221021, '操作无法使用', None, None)", "Excel / WPS 表格"))
                            
                            wb = None
                            if target_workbook:
                                try:
                                    wb = xl.Workbooks(target_workbook)
                                    wb.Activate()
                                except: pass
                            
                            if not wb:
                                try: wb = xl.ActiveWorkbook
                                except: pass
                            
                            if not wb:
                                wb = xl.Workbooks.Add()
                            
                            if target_worksheet and wb:
                                try:
                                    ws = wb.Sheets(target_worksheet)
                                    ws.Activate()
                                except: pass
                                
                            try: xl.Visible = True
                            except: pass
                            
                            try:
                                vba_project = wb.VBProject
                                is_ws_event = bool(re.search(r'(?:Public|Private)?\\s*Sub\\s+Worksheet_', code, re.IGNORECASE))
                                ws = xl.ActiveSheet
                                if is_ws_event and ws:
                                    target_comp = None
                                    try:
                                        target_comp = vba_project.VBComponents(ws.CodeName)
                                    except:
                                        for comp in vba_project.VBComponents:
                                            try:
                                                if comp.Type == 100 and comp.Properties("Name").Value == ws.Name:
                                                    target_comp = comp
                                                    break
                                            except: pass
                                    if target_comp:
                                        target_comp.CodeModule.AddFromString(code)
                                        await websocket.send(json.dumps({
                                            "type": "status",
                                            "data": "Success",
                                            "output": f"工作表事件代码已成功写入当前工作表【{ws.Name}】！请直接在表格中双击单元格测试。"
                                        }))
                                    else:
                                        raise Exception("未能定位到活动工作表的代码模块，请手动在 VBA 中将代码粘贴到对应工作表对象中。")
                                else:
                                    vba_module = vba_project.VBComponents.Add(1)
                                    vba_module.CodeModule.AddFromString(code)
                                    sub_name = None
                                    has_args = False
                                    for line in code.splitlines():
                                        l_str = line.strip()
                                        sub_match = re.search(r'^(?:Public\\s+|Private\\s+)?Sub\\s+([a-zA-Z0-9_]+)(?:\\s*\\((.*?)\\))?', l_str, re.IGNORECASE)
                                        if sub_match:
                                            s_name = sub_match.group(1)
                                            args = sub_match.group(2)
                                            if not args or args.strip() == "":
                                                sub_name = s_name
                                                has_args = False
                                                break
                                            elif not sub_name:
                                                sub_name = s_name
                                                has_args = True
                                    if sub_name:
                                        if has_args:
                                            await websocket.send(json.dumps({
                                                "type": "status",
                                                "data": "Success",
                                                "output": f"代码已导入模块！由于过程 {sub_name} 包含参数，无法无参直接执行。请在 VBA 或其他宏中调用。"
                                            }))
                                        else:
                                            try:
                                                xl.Run(sub_name)
                                            finally:
                                                try:
                                                    vba_project.VBComponents.Remove(vba_module)
                                                except: pass
                                            await websocket.send(json.dumps({"type": "status", "data": "Success"}))
                                    else:
                                        raise Exception("未在代码中找到可执行的 Sub 过程 (例如: Sub 宏名称())。如果这是单元格公式，请直接点击“复制公式”粘贴至单元格。")
                            except Exception as e_vba:
                                raise Exception(format_com_error(e_vba, detected_name or "Excel"))
                                    
                        elif target_app == "Word" or target_app == "WPS Word":
                            wd, detected_name = get_word_instance(target_app)
                            if not wd:
                                raise Exception(format_com_error("(-2147221021, '操作无法使用', None, None)", "Word / WPS 文字"))
                            
                            doc = None
                            if target_document:
                                try:
                                    doc = wd.Documents(target_document)
                                    doc.Activate()
                                except: pass
                            
                            if not doc:
                                try: doc = wd.ActiveDocument
                                except: pass
                                
                            if not doc:
                                try:
                                    if wd.Documents.Count > 0:
                                        doc = wd.Documents.Item(1)
                                        doc.Activate()
                                except: pass

                            if not doc:
                                doc = wd.Documents.Add()
                            
                            try: wd.Visible = True
                            except: pass
                            
                            try:
                                vba_project = doc.VBProject
                                vba_module = vba_project.VBComponents.Add(1)
                                vba_module.CodeModule.AddFromString(code)
                                sub_name = None
                                for line in code.splitlines():
                                    l_str = line.strip()
                                    sub_match = re.search(r'^(?:Public\\s+|Private\\s+)?Sub\\s+([a-zA-Z0-9_]+)', l_str, re.IGNORECASE)
                                    if sub_match:
                                        sub_name = sub_match.group(1)
                                        break
                                if sub_name:
                                    wd.Run(sub_name)
                                    try:
                                        vba_project.VBComponents.Remove(vba_module)
                                    except: pass
                                    await websocket.send(json.dumps({"type": "status", "data": "Success"}))
                                else:
                                    raise Exception("未在代码中找到可执行的 Sub 过程 (例如: Sub 宏名称())。")
                            except Exception as e_vba:
                                raise Exception(format_com_error(e_vba, detected_name or "Word"))

                        elif target_app == "PowerPoint" or target_app == "WPS PPT":
                            ppt, detected_name = get_ppt_instance(target_app)
                            if not ppt:
                                raise Exception(format_com_error("(-2147221021, '操作无法使用', None, None)", "PowerPoint / WPS 演示"))

                            try: ppt.Visible = True
                            except: pass
                            
                            pres = None
                            if target_document:
                                try:
                                    pres = ppt.Presentations(target_document)
                                    pres.Activate()
                                except: pass
                            if not pres:
                                try: pres = ppt.ActivePresentation
                                except: pass
                            if not pres:
                                pres = ppt.Presentations.Add()
                                
                            try:
                                vba_project = pres.VBProject
                                vba_module = vba_project.VBComponents.Add(1)
                                vba_module.CodeModule.AddFromString(code)
                                sub_name = None
                                for line in code.splitlines():
                                    l_str = line.strip()
                                    sub_match = re.search(r'^(?:Public\\s+|Private\\s+)?Sub\\s+([a-zA-Z0-9_]+)', l_str, re.IGNORECASE)
                                    if sub_match:
                                        sub_name = sub_match.group(1)
                                        break
                                if sub_name:
                                    ppt.Run(sub_name)
                                    try:
                                        vba_project.VBComponents.Remove(vba_module)
                                    except: pass
                                    await websocket.send(json.dumps({"type": "status", "data": "Success"}))
                                else:
                                    raise Exception("未在代码中找到可执行的 Sub 过程 (例如: Sub 宏名称())。")
                            except Exception as e_vba:
                                raise Exception(format_com_error(e_vba, detected_name or "PowerPoint"))
                        else:
                            raise Exception(f"暂未支持自动执行 {target_app}，请手动复制 VBA 代码到对应软件中的宏编辑器内执行。")
                    except Exception as e:
                        print(f"VBA Execution Error: {e}")
                        await websocket.send(json.dumps({"type": "error", "message": str(e)}))
                    finally:
                        gc.collect()
                        pythoncom.CoUninitialize()
                
                elif action == "ping":
                    await websocket.send(json.dumps({"type": "pong"}))
            except Exception as e:
                print(f"Error: {e}")
    except Exception as e:
        print(f"Disconnected: {e}")

async def main():
    async with websockets.serve(handle_client, "0.0.0.0", 8767):
        print("Office/WPS AI Local Agent running on ws://localhost:8767")
        await asyncio.Future()

if __name__ == '__main__':
    asyncio.run(main())
`;
