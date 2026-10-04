import { officeScriptCode } from '../data/officeAgentScript';
import React from 'react';
import { Download, X, Terminal } from 'lucide-react';

interface LocalAgentGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

const pythonScriptCode = `import asyncio
import websockets
import pythoncom
import win32com.client
import win32gui
import win32process
import win32con
import tempfile
import os
import json
import re
import locale
import time

def build_cad_plugin():
    import subprocess
    import win32api
    import win32con

    acad_dir = None
    try:
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        output = subprocess.check_output(['tasklist', '/fi', 'imagename eq acad.exe', '/nh', '/fo', 'csv'], startupinfo=startupinfo, text=True)
        for line in output.splitlines():
            if 'acad.exe' in line.lower():
                pid = int(line.split(',')[1].strip('"'))
                try:
                    handle = win32api.OpenProcess(win32con.PROCESS_QUERY_INFORMATION | win32con.PROCESS_VM_READ, False, pid)
                    exe_path = win32process.GetModuleFileNameEx(handle, 0)
                    win32api.CloseHandle(handle)
                    acad_dir = os.path.dirname(exe_path)
                    break
                except: pass
    except: pass

    if not acad_dir: return None
    
    temp_dir = os.environ.get('TEMP', 'C:\\\\temp')
    dll_path = os.path.join(temp_dir, "CadAiPlugin_v1.dll")
    if os.path.exists(dll_path): return dll_path
        
    cs_path = os.path.join(temp_dir, "CadAiPlugin.cs")
    try:
        with open(cs_path, "w", encoding="utf-8") as f:
            f.write('''using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using Autodesk.AutoCAD.Runtime;
using Autodesk.AutoCAD.ApplicationServices;

namespace CadRotPlugin {
    public class AutoCadRotRegistration : IExtensionApplication {
        [DllImport("ole32.dll")] private static extern int CreateItemMoniker([MarshalAs(UnmanagedType.LPWStr)] string lpszDelim, [MarshalAs(UnmanagedType.LPWStr)] string lpszItem, out IMoniker ppmk);
        [DllImport("ole32.dll")] private static extern int GetRunningObjectTable(uint reserved, out IRunningObjectTable pprot);

        public void Initialize() { RegisterComInstance(); }
        public void Terminate() { }

        [CommandMethod("STARTAI")]
        public void RegisterComInstance() {
            try {
                int pid = Process.GetCurrentProcess().Id;
                string monikerName = "!AutoCAD.Application." + pid;
                GetRunningObjectTable(0, out IRunningObjectTable rot);
                CreateItemMoniker("!", monikerName, out IMoniker moniker);
                object acadApp = Application.AcadApplication;
                int cookie = rot.Register(1, acadApp, moniker);
                Application.DocumentManager.MdiActiveDocument.Editor.WriteMessage($"\\\\n[AI Agent] 成功注册多开通道 PID: {pid}\\\\n");
            } catch (Exception ex) {
                Application.DocumentManager.MdiActiveDocument.Editor.WriteMessage($"\\\\n[AI Error] {ex.Message}\\\\n");
            }
        }
    }
}''')
    except:
        return None
    
    csc_path = r"C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe"
    if not os.path.exists(csc_path): return None
    
    acmgd = os.path.join(acad_dir, "acmgd.dll")
    accoremgd = os.path.join(acad_dir, "accoremgd.dll")
    
    cmd = [csc_path, "/target:library", "/nologo", f"/out:{dll_path}", f"/reference:{acmgd}"]
    if os.path.exists(accoremgd): cmd.append(f"/reference:{accoremgd}")
    cmd.append(cs_path)
    
    try:
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        subprocess.run(cmd, startupinfo=startupinfo, check=True, capture_output=True)
        return dll_path
    except: return None

def is_com_busy_error(e):
    if not e: return False
    if hasattr(e, 'hresult') and e.hresult in (-2147418111, -2147417846, -2147417848, 0x80010101, 0x8001010A):
        return True
    if hasattr(e, 'args') and len(e.args) > 0 and str(e.args[0]) in ("-2147418111", "-2147417846", "0x80010101", "0x8001010a"):
        return True
    err_str = str(e).lower()
    return any(k in err_str for k in [
        "2147418111", "2147417846", "0x80010101", "0x8001010a",
        "被呼叫方拒绝接收呼叫", "rejected by callee", "application is busy",
        "call was rejected by callee", "rpc_e_call_rejected", "rpc_e_servercall_retrylater"
    ])

def check_cad_user_activity(target_doc):
    """
    检查 CAD 当前是否正在被用户操作使用。
    如果用户正在绘图、执行命令、弹窗中或 COM 繁忙，返回 (True, 原因描述)。
    如果 CAD 空闲，返回 (False, "")。
    """
    if not target_doc:
        return False, ""
    try:
        try:
            pythoncom.PumpWaitingMessages()
        except: pass
        
        # 1. 尝试读取 CMDACTIVE 系统变量
        cmd_active = target_doc.GetVariable("CMDACTIVE")
        if cmd_active is not None:
            val = int(cmd_active)
            if val != 0:
                cmd_names = ""
                try:
                    cmd_names = str(target_doc.GetVariable("CMDNAMES") or "").strip()
                except: pass
                
                reasons = []
                if val & 1: reasons.append("绘图/编辑命令进行中")
                if val & 2: reasons.append("透明命令(平移/缩放)进行中")
                if val & 4: reasons.append("脚本正在执行")
                if val & 8: reasons.append("对话框已打开")
                if val & 16: reasons.append("AutoLISP程序正在执行")
                
                detail = f" [当前命令: {cmd_names}]" if cmd_names else ""
                reason_str = ("、".join(reasons) if reasons else f"状态码: {val}") + detail
                return True, reason_str
                
        return False, ""
    except Exception as e:
        if is_com_busy_error(e):
            return True, "CAD 界面交互中 (COM 呼叫被拒绝/繁忙)"
        return False, ""

async def retry_com_call(func, *args, retries=5, delay=1.0):
    """Retry COM calls to handle 'Call was rejected by callee' errors (RPC_E_CALL_REJECTED)"""
    for i in range(retries):
        try:
            res = func(*args)
            if asyncio.iscoroutine(res):
                return await res
            return res
        except Exception as e:
            if is_com_busy_error(e) and i < retries - 1:
                print(f"AutoCAD is busy, retrying in {delay}s...")
                await asyncio.sleep(delay)
                try:
                    pythoncom.PumpWaitingMessages()
                except:
                    pass
                continue
            raise e

def _get_acads_sync():
    pythoncom.CoInitialize()
    instances = []
    
    # helper to add app
    def add_app(app):
        try:
            hwnd = app.HWND
            for a in instances:
                try:
                    if int(a.HWND) == int(hwnd):
                        return
                except: pass
            instances.append(app)
            print(f"成功捕获 CAD 实例, HWND: {hwnd}")
        except: pass

    # 1. First append the default instance
    try:
        acad = win32com.client.GetActiveObject("AutoCAD.Application")
        add_app(acad)
    except Exception:
        pass

    # 2. Extract from Window Titles
    import win32gui
    import re
    try:
        def enum_windows_callback(hwnd, ctx):
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                if title:
                    class_name = win32gui.GetClassName(hwnd)
                    if class_name.startswith("AfxMDIFrame") or "AutoCAD" in title:
                        # Extract string between [ and ]
                        match = re.search(r'\[(.*?\.(?:dwg|dxf|dwt))\]', title, re.IGNORECASE)
                        if match:
                            path = match.group(1)
                            try:
                                doc = win32com.client.GetObject(path)
                                add_app(doc.Application)
                            except Exception as e:
                                pass
            return True
        win32gui.EnumWindows(enum_windows_callback, None)
    except: pass

    # 3. ROT parsing
    try:
        rot = pythoncom.GetRunningObjectTable()
        enum = rot.EnumRunning()
        while True:
            monikers = enum.Next(1)
            if not monikers:
                break
            ctx = pythoncom.CreateBindCtx(0)
            name = monikers[0].GetDisplayName(ctx, None)
            name_lower = name.lower()
            
            # [Added] Direct C# Plugin Moniker match: !AutoCAD.Application.PID
            if "!autocad.application." in name_lower:
                try:
                    obj = rot.GetObject(monikers[0])
                    acad = win32com.client.Dispatch(obj.QueryInterface(pythoncom.IID_IDispatch))
                    add_app(acad)
                except: pass
                continue

            # If the name looks like an AutoCAD component or drawing
            if "autocad" in name_lower or "acad" in name_lower or ".dwg" in name_lower or ".dxf" in name_lower or ".dwt" in name_lower:
                app = None
                try:
                    # Get the object from ROT
                    obj = rot.GetObject(monikers[0])
                    disp = win32com.client.Dispatch(obj.QueryInterface(pythoncom.IID_IDispatch))
                    
                    # Try to get Application property if it's a Document
                    try:
                        app = disp.Application
                    except Exception:
                        # Otherwise it might be the Application itself
                        try:
                            _ = disp.ActiveDocument
                            app = disp
                        except Exception:
                            pass
                            
                except Exception:
                    # Fallback to win32com.client.GetObject for file paths
                    try:
                        if ":" in name or name.startswith("\\\\"):
                            clean_name = name
                            if clean_name.startswith("!"):
                                clean_name = clean_name[1:]
                            doc = win32com.client.GetObject(clean_name)
                            app = doc.Application
                    except Exception:
                        pass
                
                if app:
                    add_app(app)
                    
    except Exception as e:
        print("ROT Error:", e)

    if not instances:
        raise Exception("未找到正在运行的 AutoCAD 实例。请先打开 AutoCAD 并创建一个新文档。 (AutoCAD is not running. Please open it first.)")
    
    return instances

async def get_acads():
    return await retry_com_call(_get_acads_sync)

def get_top_acad(acads):
    try:
        import win32gui
        
        # 1. Matches foreground window?
        try:
            fg_hwnd = win32gui.GetForegroundWindow()
            for acad in acads:
                try:
                    if int(acad.HWND) == int(fg_hwnd): return acad
                except: pass
        except: pass
        
        # 2. Highest in Z-order (most recently active)
        windows_in_order = []
        def enum_handler(hwnd, ctx):
            windows_in_order.append(hwnd)
        try:
            win32gui.EnumWindows(enum_handler, None)
            for hwnd in windows_in_order:
                for acad in acads:
                    try:
                        if int(acad.HWND) == int(hwnd): return acad
                    except: pass
        except: pass
    except Exception as e:
        print("Error checking acad priority:", str(e))
        
    return acads[0] if acads else None

def _get_documents_sync(acads):
    apps = []
    top_acad = get_top_acad(acads)
    
    connected_pids = []
    
    for acad in acads:
        try:
            hwnd = acad.HWND
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            connected_pids.append(pid)
            
            docs = []
            active_doc = None
            try:
                for i in range(acad.Documents.Count):
                    doc = acad.Documents.Item(i)
                    if doc.Name not in docs:
                        docs.append(doc.Name)
            except: pass
            
            try:
                if acad.Documents.Count > 0:
                    active_doc = acad.ActiveDocument.Name
            except: pass
            
            is_top = False
            try:
                if top_acad and int(hwnd) == int(top_acad.HWND):
                    is_top = True
            except: pass
            
            apps.append({
                "pid": pid,
                "connected": True,
                "is_top": is_top,
                "docs": docs,
                "active_doc": active_doc
            })
        except Exception:
            pass
            
    # Now check for disconnected AutoCADs using tasklist and EnumWindows
    import subprocess
    import win32gui
    try:
        acad_window_pids = []
        def enum_windows_callback(hwnd, ctx):
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                if title:
                    class_name = win32gui.GetClassName(hwnd)
                    if class_name.startswith("AfxMDIFrame") or "AutoCAD" in title:
                        _, wpid = win32process.GetWindowThreadProcessId(hwnd)
                        if wpid not in acad_window_pids:
                            acad_window_pids.append(wpid)
            return True
        try:
            win32gui.EnumWindows(enum_windows_callback, None)
        except: pass
        
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        
        output = subprocess.check_output(['tasklist', '/fi', 'imagename eq acad.exe', '/nh'], 
                                         startupinfo=startupinfo, text=True)
        for line in output.splitlines():
            if 'acad.exe' in line.lower():
                parts = line.split()
                if len(parts) > 1:
                    try:
                        pid = int(parts[1])
                        # Only include if it has a visible window or if we couldn't get any window PIDs
                        if pid not in connected_pids and (not acad_window_pids or pid in acad_window_pids):
                            apps.append({
                                "pid": pid,
                                "connected": False,
                                "is_top": False,
                                "docs": [],
                                "active_doc": None
                            })
                    except: pass
    except Exception as e:
        print("Tasklist error:", e)
            
    return apps

async def send_docs(websocket):
    try:
        acads = await get_acads()
        apps = await retry_com_call(_get_documents_sync, acads)
            
        await websocket.send(json.dumps({
            "type": "documents",
            "apps": apps
        }))
    except Exception as e:
        print("Error getting documents:", str(e))
        try:
            await websocket.send(json.dumps({
                "type": "error",
                "message": str(e)
            }))
        except:
            pass

async def execute_code_with_busy_wait(acads, code, target_doc_name, target_pid=None, websocket=None, max_wait_seconds=300):
    if not acads:
        acads = await get_acads()
    if not acads:
        raise Exception("未找到运行中的 AutoCAD 实例，请先启动 AutoCAD")
        
    target_acad = get_top_acad(acads)
    if target_pid:
        try:
            target_acad = win32com.client.GetObject(f"!AutoCAD.Application.{target_pid}")
        except:
            for acad in acads:
                try:
                    hwnd = acad.HWND
                    _, pid = win32process.GetWindowThreadProcessId(hwnd)
                    if pid == target_pid:
                        target_acad = acad
                        break
                except: pass

    # 获取目标图纸文档（遇到COM繁忙时自动重试）
    target_doc = None
    fetch_start = time.time()
    while not target_doc and (time.time() - fetch_start < 30):
        try:
            if target_doc_name and target_acad:
                for i in range(target_acad.Documents.Count):
                    doc = target_acad.Documents.Item(i)
                    if doc.Name == target_doc_name:
                        target_doc = doc
                        break
            elif target_doc_name:
                for acad in acads:
                    try:
                        for i in range(acad.Documents.Count):
                            doc = acad.Documents.Item(i)
                            if doc.Name == target_doc_name:
                                target_doc = doc
                                target_acad = acad
                                break
                    except: pass
                    if target_doc: break
            
            if not target_doc and target_acad:
                if target_acad.Documents.Count == 0:
                    target_acad.Documents.Add()
                target_doc = target_acad.ActiveDocument
        except Exception as e:
            if is_com_busy_error(e):
                if websocket:
                    try:
                        await websocket.send(json.dumps({
                            "type": "cad_busy",
                            "status": "waiting",
                            "reason": "CAD 界面交互中",
                            "message": "CAD 正在被用户使用，等待操作结束后自动发送..."
                        }))
                    except: pass
                await asyncio.sleep(0.8)
                continue
            raise e
        if target_doc:
            break
        await asyncio.sleep(0.5)

    if not target_doc or not target_acad:
        raise Exception("无法获取或创建目标图纸 (Could not get or create target document)")

    # 智能防冲突等待：检测 CAD 是否正被用户操作（如正在绘图选点、执行命令或打开弹窗）
    is_busy, reason = check_cad_user_activity(target_doc)
    if is_busy:
        print(f"[CAD Busy] 检测到 CAD 正在被用户使用: {reason}，等待操作结束后自动发送...")
        if websocket:
            try:
                await websocket.send(json.dumps({
                    "type": "cad_busy",
                    "status": "waiting",
                    "reason": reason,
                    "message": f"CAD 正在被用户使用（{reason}），等待操作结束后自动发送...",
                    "elapsed": 0
                }))
            except: pass

        wait_start = time.time()
        last_notify = time.time()
        while True:
            await asyncio.sleep(0.8)
            try:
                pythoncom.PumpWaitingMessages()
            except: pass

            is_still_busy, new_reason = check_cad_user_activity(target_doc)
            if not is_still_busy:
                print("[CAD Free] 用户操作已结束，CAD 现已空闲，开始发送代码！")
                if websocket:
                    try:
                        await websocket.send(json.dumps({
                            "type": "cad_busy",
                            "status": "resumed",
                            "message": "用户操作已结束，正在发送代码到 AutoCAD..."
                        }))
                    except: pass
                break

            elapsed = int(time.time() - wait_start)
            if elapsed > max_wait_seconds:
                raise Exception(f"等待用户操作结束超时（已等待 {elapsed} 秒），请在结束当前 AutoCAD 命令后重试。")

            if time.time() - last_notify >= 2.0:
                last_notify = time.time()
                if websocket:
                    try:
                        await websocket.send(json.dumps({
                            "type": "cad_busy",
                            "status": "waiting",
                            "reason": new_reason or reason,
                            "message": f"CAD 正在被用户使用（{new_reason or reason}），已等待 {elapsed} 秒，操作结束后自动发送...",
                            "elapsed": elapsed
                        }))
                    except: pass

    # 切换目标文档并激活前台窗口
    try:
        if target_doc.Name != target_acad.ActiveDocument.Name:
            target_doc.Activate()
    except Exception as e:
        print("Warning: Could not activate document", e)

    try:
        hwnd = target_acad.HWND
        if hwnd:
            if win32gui.IsIconic(hwnd):
                win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            else:
                win32gui.ShowWindow(hwnd, win32con.SW_SHOW)
            win32gui.SetForegroundWindow(hwnd)
    except Exception as win_e:
        print("Failed to bring CAD window to foreground:", win_e)

    temp_dir = tempfile.gettempdir()
    lsp_path = os.path.join(temp_dir, "temp_autocad_ai_script.lsp")
    sys_enc = locale.getpreferredencoding()

    match = re.search(r'[(]defun\\s+c:([a-zA-Z0-9_\\-]+)', code, re.IGNORECASE)
    cmd_name = match.group(1) if match else None

    if cmd_name:
        code_stripped = code.strip()
        pattern = r'\\([cC]:' + re.escape(cmd_name) + r'\\s*\\)$'
        if re.search(pattern, code_stripped):
            code = re.sub(pattern, '', code_stripped)
            
        with open(lsp_path, "w", encoding=sys_enc, errors="replace") as f:
            f.write(code)
            
        lsp_path_lisp = lsp_path.replace("\\\\", "/")
        send_str = f'(load "{lsp_path_lisp}")\\n{cmd_name}\\n'
    else:
        wrapped_code = f'(defun c:ai_last ()\\n{code}\\n(princ)\\n)\\n'
        with open(lsp_path, "w", encoding=sys_enc, errors="replace") as f:
            f.write(wrapped_code)
            
        lsp_path_lisp = lsp_path.replace("\\\\", "/")
        send_str = f'(load "{lsp_path_lisp}")\\nai_last\\n'

    # 发送代码至 CAD (包含重试与空闲校验)
    send_done = False
    for send_try in range(15):
        try:
            is_busy_now, _ = check_cad_user_activity(target_doc)
            if is_busy_now:
                await asyncio.sleep(0.8)
                continue
            target_doc.SendCommand(send_str)
            send_done = True
            break
        except Exception as se:
            if is_com_busy_error(se) and send_try < 14:
                print("AutoCAD busy during SendCommand, retrying in 1s...")
                await asyncio.sleep(1.0)
                continue
            raise se

    if not send_done:
        raise Exception("发送代码至 AutoCAD 失败，请检查 CAD 是否被占用")

async def handle_client(websocket):
    pythoncom.CoInitialize()
    print("Client connected.")
    try:
        await send_docs(websocket)
        async for message in websocket:
            try:
                try:
                    data = json.loads(message)
                except json.JSONDecodeError:
                    data = {"action": "execute", "code": message}

                action = data.get("action")
                
                if action == "get_documents":
                    await send_docs(websocket)
                
                elif action == "get_selection":
                    target_doc_name = data.get("document")
                    target_pid = data.get("pid")
                    print("Reading selected objects...")
                    try:
                        async def _get_sel(acads, t_doc_name, t_pid, ws):
                            import pythoncom
                            
                            t_doc = None
                            t_acad = get_top_acad(acads)
                            
                            if t_pid:
                                try:
                                    t_acad = win32com.client.GetObject(f"!AutoCAD.Application.{t_pid}")
                                except:
                                    for acad in acads:
                                        try:
                                            hwnd = acad.HWND
                                            _, pid = win32process.GetWindowThreadProcessId(hwnd)
                                            if pid == t_pid:
                                                t_acad = acad
                                                break
                                        except: pass

                            if t_doc_name and t_acad:
                                try:
                                    for i in range(t_acad.Documents.Count):
                                        if t_acad.Documents.Item(i).Name == t_doc_name:
                                            t_doc = t_acad.Documents.Item(i)
                                            break
                                except: pass

                            if not t_doc and t_doc_name:
                                for acad in acads:
                                    try:
                                        for i in range(acad.Documents.Count):
                                            if acad.Documents.Item(i).Name == t_doc_name:
                                                t_doc = acad.Documents.Item(i)
                                                t_acad = acad
                                                break
                                    except: pass
                                    if t_doc: break
                            
                            if not t_doc:
                                if t_acad:
                                    try:
                                        t_doc = t_acad.ActiveDocument
                                    except: pass
                                    
                            if not t_doc: raise Exception("无法获取目标图纸")
                            
                            sel = None
                            count = 0
                            
                            # Let COM errors bubble up here so retry_com_call can catch RPC_E_CALL_REJECTED
                            try:
                                sel = t_doc.PickfirstSelectionSet
                                count = sel.Count
                            except Exception as e:
                                if hasattr(e, 'hresult') and e.hresult == -2147418111: raise e
                                pass
                                
                            # Fallback attempt
                            if count == 0:
                                try:
                                    sel = t_doc.ActiveSelectionSet
                                    count = sel.Count
                                except Exception as e:
                                    if hasattr(e, 'hresult') and e.hresult == -2147418111: raise e
                                    pass
                                
                            if count == 0:
                                raise Exception("未检测到选中对象(数量为0)。请确保在 AutoCAD 中成功选中了对象（对象呈现蓝色高亮状态），然后再点击界面的读取按钮。")
                                
                            items = []
                            # Report progress update frequency
                            update_freq = 50 if count > 500 else 10
                            
                            for i in range(count):
                                if i % update_freq == 0 or i == count - 1:
                                    try:
                                        # Yield back to the event loop so progress can be sent
                                        await ws.send(json.dumps({"type": "progress", "current": i + 1, "total": count}))
                                        await asyncio.sleep(0.01)
                                    except Exception:
                                        pass
                                        
                                try:
                                    obj = sel.Item(i)
                                    info = {}
                                    try:
                                        info["ObjectName"] = str(obj.ObjectName)
                                    except: pass
                                    try:
                                        info["Handle"] = str(obj.Handle)
                                    except: pass
                                    
                                    props_to_try = ["Layer", "Color", "Linetype", "Length", "Area", "Radius", "Diameter", "TextString", "Elevation", "Thickness"]
                                    for prop in props_to_try:
                                        try:
                                            if hasattr(obj, prop):
                                                val = getattr(obj, prop)
                                                if isinstance(val, (int, float, str, bool)):
                                                    info[prop] = val
                                                else:
                                                    info[prop] = str(val)
                                        except Exception as e:
                                            if hasattr(e, 'hresult') and e.hresult == -2147418111: raise e
                                    
                                    tuple_props = ["Coordinates", "StartPoint", "EndPoint", "Center", "InsertionPoint"]
                                    for prop in tuple_props:
                                        try:
                                            if hasattr(obj, prop):
                                                val = getattr(obj, prop)
                                                if val is not None: 
                                                    info[prop] = [float(x) for x in val]
                                        except Exception as e:
                                            if hasattr(e, 'hresult') and e.hresult == -2147418111: raise e
                                        
                                    items.append(info)
                                except Exception as e:
                                    if hasattr(e, 'hresult') and e.hresult == -2147418111: raise e
                                    print(f"Error reading item {i}: {e}")
                                    continue
                            return items
                        
                        try:
                            acads = await get_acads()
                        except:
                            acads = []
                        sel_data = await retry_com_call(_get_sel, acads, target_doc_name, target_pid, websocket)
                        await websocket.send(json.dumps({"type": "selection_data", "data": sel_data}))
                    except Exception as exec_e:
                        print(f"Selection Error: {str(exec_e)}")
                        await websocket.send(json.dumps({"type": "error", "message": str(exec_e)}))

                elif action == "execute":
                    code = data.get("code")
                    target_doc_name = data.get("document")
                    target_pid = data.get("pid")
                    
                    print("Executing code in AutoCAD (with user-busy detection)...")
                    try:
                        acads = await get_acads()
                        await execute_code_with_busy_wait(acads, code, target_doc_name, target_pid, websocket)
                        
                        print("Execution command sent successfully.")
                        await websocket.send(json.dumps({"type": "status", "data": "Success"}))
                        await send_docs(websocket)
                    except Exception as exec_e:
                        print(f"Execution Error: {str(exec_e)}")
                        await websocket.send(json.dumps({"type": "error", "message": str(exec_e)}))
                
                elif action == "ping":
                    await websocket.send(json.dumps({"type": "pong"}))
                    
            except Exception as e:
                err_msg = str(e)
                print(f"Error handling message: {err_msg}")
                try:
                    await websocket.send(json.dumps({"type": "error", "message": err_msg}))
                except:
                    pass
    except Exception as e:
        print(f"Connection closed or error: {e}")

async def main():
    try:
        async with websockets.serve(handle_client, "0.0.0.0", 8765):
            print("AutoCAD AI Local Agent running on ws://localhost:8765")
            await asyncio.Future()
    except Exception as e:
        print(f"Server error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
`;



export function LocalAgentGuide({ isOpen, onClose }: LocalAgentGuideProps) {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = React.useState<'cad' | 'office'>('cad');

  const handleDownload = () => {
    const code = activeTab === 'cad' ? pythonScriptCode : officeScriptCode;
    const filename = activeTab === 'cad' ? 'autocad_agent.py' : 'office_agent.py';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-[64px] sm:top-[72px] z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-gray-100 border border-gray-200 rounded-xl shadow-2xl flex flex-col max-h-[calc(100%-2rem)]">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-none">
          <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <Terminal size={20} className="text-blue-500" />
            配置本地中转代理
          </h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-900 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-4 text-gray-700">
          {/* Tab buttons */}
          <div className="flex border-b border-gray-200 mb-4">
            <button
              onClick={() => setActiveTab('cad')}
              className={`flex-1 py-2 text-center text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'cad'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              AutoCAD 代理配置
            </button>
            <button
              onClick={() => setActiveTab('office')}
              className={`flex-1 py-2 text-center text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'office'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Office / WPS 代理配置
            </button>
          </div>

          {activeTab === 'cad' ? (
            <>
              <p className="text-sm">
                本应用可以通过 WebSocket 直接连接到您的电脑，并通过 <code className="bg-gray-200 px-1 py-0.5 rounded">ActiveX/COM</code> 接口将代码发送至正在运行的 AutoCAD，实现 <strong>一键发送并运行</strong>。
              </p>
              
              <h3 className="font-semibold text-gray-800 mt-4">步骤 1：安装环境依赖</h3>
              <p className="text-sm">确保您的电脑上安装了 Python 3，并在终端或命令行中执行以下命令安装依赖：</p>
              <div className="bg-white p-3 rounded-lg border border-gray-200 font-mono text-sm flex justify-between items-center group">
                <code className="text-blue-400">pip install websockets pywin32</code>
                <button 
                  onClick={() => navigator.clipboard.writeText('pip install websockets pywin32')}
                  className="text-gray-500 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  复制
                </button>
              </div>

              <h3 className="font-semibold text-gray-800 mt-4">步骤 2：下载并运行中转脚本</h3>
              <p className="text-sm">下载该 Python 脚本，并在您打开 AutoCAD 之后运行它。</p>
              
              <div className="bg-white border border-gray-200 rounded-xl p-4 my-2 relative">
                <pre className="text-xs font-mono text-gray-600 overflow-x-auto max-h-40">
                  {pythonScriptCode}
                </pre>
              </div>

              <div className="flex justify-start">
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-stone-700 text-gray-800 hover:text-white rounded-lg transition-colors border border-gray-300 text-sm font-medium"
                >
                  <Download size={16} />
                  下载 autocad_agent.py
                </button>
              </div>

              <h3 className="font-semibold text-gray-800 mt-4">步骤 3：在网页上一键发送</h3>
              <p className="text-sm">
                一旦脚本显示 <code>AutoCAD AI Local Agent running...</code>，本网页右上角的状态将变为<span className="text-green-500 font-semibold mx-1">已连接</span>（或显示连接状态）。<br/>
                此时在聊天生成的代码块上，您可以点击 <strong>发送至 CAD 运行</strong>。
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 mt-2 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <span>✨ 智能防占用与操作等待机制</span>
                </div>
                <p>
                  如果您在点击发送时正在 AutoCAD 中进行绘图选点、执行命令或打开了设置对话框，本地代理会智能识别并自动安全挂起，等待您当前操作结束后立即自动发送代码，不会破坏您当前正在绘制的图形或产生中断报错。
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm">
                本应用可以通过 WebSocket 直接连接到您的电脑，并通过 <code className="bg-gray-200 px-1 py-0.5 rounded">ActiveX/COM</code> 接口将 VB/VBA 宏代码发送到您运行的 Excel, Word 或 WPS 软件，实现 <strong>一键向软件发送并执行 VBA 脚本</strong>。
              </p>
              
              <h3 className="font-semibold text-gray-800 mt-4">步骤 1：安装环境依赖</h3>
              <p className="text-sm">确保您的电脑上安装了 Python 3，并在终端或命令行中执行以下命令安装依赖：</p>
              <div className="bg-white p-3 rounded-lg border border-gray-200 font-mono text-sm flex justify-between items-center group">
                <code className="text-blue-400">pip install websockets pywin32</code>
                <button 
                  onClick={() => navigator.clipboard.writeText('pip install websockets pywin32')}
                  className="text-gray-500 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  复制
                </button>
              </div>

              <h3 className="font-semibold text-gray-800 mt-4">步骤 2：下载并运行中转脚本</h3>
              <p className="text-sm">下载该 Python 脚本，并保持 Office 软件（或 WPS）打开状态，然后运行该脚本：</p>
              
              <div className="bg-white border border-gray-200 rounded-xl p-4 my-2 relative">
                <pre className="text-xs font-mono text-gray-600 overflow-x-auto max-h-40">
                  {officeScriptCode}
                </pre>
              </div>

              <div className="flex justify-start">
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-stone-700 text-gray-800 hover:text-white rounded-lg transition-colors border border-gray-300 text-sm font-medium"
                >
                  <Download size={16} />
                  下载 office_agent.py
                </button>
              </div>

              <h3 className="font-semibold text-gray-800 mt-4">步骤 3：在网页上一键发送</h3>
              <p className="text-sm">
                一旦脚本显示 <code>Office/WPS AI Local Agent running...</code>，在 Office/WPS 模块的聊天框中生成的 VBA 代码上，您可以点击 <strong>发送到 Office/WPS 运行</strong>。<br/>
                <strong className="text-amber-600">重要提示：</strong>为了允许脚本创建并执行宏，您可能需要在软件中进行宏安全设置：<br/>
                打开 Excel/Word 的 <code>文件 -&gt; 选项 -&gt; 信任中心 -&gt; 信任中心设置 -&gt; 宏设置</code>，并勾选 <strong>「信任对 VBA 工程对象模型的访问」</strong>。
              </p>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-100/50 flex justify-end flex-none">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            我明白了
          </button>
        </div>
      </div>
    </div>
  );
}
