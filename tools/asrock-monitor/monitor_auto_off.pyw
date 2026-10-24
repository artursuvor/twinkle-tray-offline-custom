"""Switch only the ASRock CL25FF off on a confirmed Windows power-off.

Uses a hidden top-level window (not a message-only window) for WM_ENDSESSION.
No shutdown/restart API is called by this program.
"""
import ctypes as c
from ctypes import wintypes as w
import datetime
import json
import subprocess
from pathlib import Path
import sys
import traceback
import winreg
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
CLASS = 'AsrockCL25FFAutoOff.Window.v1'
RUN_NAME = 'AsrockMonitorAutoOff'
RUN_KEY = r'Software\Microsoft\Windows\CurrentVersion\Run'
TASK_NAME = 'Codex ASRock CL25FF Auto Off'
WAKE_MARKER = ROOT / 'wake-on-next-login'
WM_QUERYENDSESSION, WM_ENDSESSION = 0x11, 0x16
WM_CLOSE, WM_DESTROY, WM_TIMER, WM_DISPLAYCHANGE = 0x10, 2, 0x113, 0x7E
PING, TEST, STATUS, POWER_ON = 0x8001, 0x8002, 0x8003, 0x8004
LOGOFF, CLOSEAPP = 0x80000000, 1
RESTART_ACTIONS = {'restart', 'reboot', 'перезагрузка', 'перезапустить'}

def log(message):
    try:
        path = ROOT / 'auto-off.log'
        if path.exists() and path.stat().st_size > 131072:
            path.replace(ROOT / 'auto-off.previous.log')
        with path.open('a', encoding='utf-8') as stream:
            stream.write(datetime.datetime.now().isoformat(timespec='seconds') + ' ' + message + '\n')
    except OSError:
        pass

class SessionController:
    def __init__(self, power_off, detect_action):
        self.power_off, self.detect_action = power_off, detect_action
        self.action = None

    def query(self, flags):
        self.action = None
        if not flags & (LOGOFF | CLOSEAPP):
            self.action = self.detect()
        return 1  # Always allow Windows to continue.

    def detect(self):
        try:
            return self.detect_action()
        except Exception:
            log('Shutdown-type detection unavailable: ' + traceback.format_exc())
            return None

    def end(self, confirmed, flags):
        action, self.action = self.action, None
        if not confirmed or flags & (LOGOFF | CLOSEAPP):
            return False
        action = action or self.detect()
        if (action or '').strip().casefold() in RESTART_ACTIONS:
            log('Session ending; no monitor change. Action=' + repr(action))
            return False
        log('Confirmed system shutdown; action=' + repr(action) +
            '; using WM_ENDSESSION even if the event log has no matching entry')
        self.power_off()
        return True

user32 = c.WinDLL('user32', use_last_error=True)
kernel32 = c.WinDLL('kernel32', use_last_error=True)
dxva2 = c.WinDLL('dxva2', use_last_error=True)
wevtapi = c.WinDLL('wevtapi', use_last_error=True)
LRESULT = c.c_ssize_t
WNDPROC = c.WINFUNCTYPE(LRESULT, w.HWND, w.UINT, w.WPARAM, w.LPARAM)
MONPROC = c.WINFUNCTYPE(w.BOOL, w.HANDLE, w.HDC, c.POINTER(w.RECT), w.LPARAM)

class PhysicalMonitor(c.Structure):
    _fields_ = [('handle', w.HANDLE), ('description', w.WCHAR * 128)]

class WindowClass(c.Structure):
    _fields_ = [('style', w.UINT), ('proc', WNDPROC), ('class_extra', c.c_int),
                ('window_extra', c.c_int), ('instance', w.HINSTANCE),
                ('icon', w.HICON), ('cursor', w.HANDLE), ('background', w.HBRUSH),
                ('menu_name', w.LPCWSTR), ('class_name', w.LPCWSTR)]

def signature(lib, name, args, result=w.BOOL):
    fn = getattr(lib, name)
    fn.argtypes, fn.restype = args, result
    return fn

signature(user32, 'EnumDisplayMonitors', [w.HDC, c.POINTER(w.RECT), MONPROC, w.LPARAM])
signature(user32, 'RegisterClassW', [c.POINTER(WindowClass)], w.ATOM)
signature(user32, 'CreateWindowExW', [w.DWORD, w.LPCWSTR, w.LPCWSTR, w.DWORD,
          c.c_int, c.c_int, c.c_int, c.c_int, w.HWND, w.HMENU, w.HINSTANCE, w.LPVOID], w.HWND)
signature(user32, 'DefWindowProcW', [w.HWND, w.UINT, w.WPARAM, w.LPARAM], LRESULT)
signature(user32, 'GetMessageW', [c.POINTER(w.MSG), w.HWND, w.UINT, w.UINT], c.c_int)
signature(user32, 'TranslateMessage', [c.POINTER(w.MSG)])
signature(user32, 'DispatchMessageW', [c.POINTER(w.MSG)], LRESULT)
signature(user32, 'FindWindowW', [w.LPCWSTR, w.LPCWSTR], w.HWND)
signature(user32, 'PostMessageW', [w.HWND, w.UINT, w.WPARAM, w.LPARAM])
signature(user32, 'SendMessageTimeoutW', [w.HWND, w.UINT, w.WPARAM, w.LPARAM,
          w.UINT, w.UINT, c.POINTER(c.c_size_t)], LRESULT)
signature(user32, 'SetTimer', [w.HWND, c.c_size_t, w.UINT, w.LPVOID], c.c_size_t)
signature(user32, 'KillTimer', [w.HWND, c.c_size_t])
signature(user32, 'DestroyWindow', [w.HWND])
signature(user32, 'PostQuitMessage', [c.c_int], None)
signature(kernel32, 'GetModuleHandleW', [w.LPCWSTR], w.HMODULE)
signature(kernel32, 'SetProcessShutdownParameters', [w.DWORD, w.DWORD])
signature(kernel32, 'CreateMutexW', [w.LPVOID, w.BOOL, w.LPCWSTR], w.HANDLE)
signature(kernel32, 'CloseHandle', [w.HANDLE])
signature(dxva2, 'GetNumberOfPhysicalMonitorsFromHMONITOR', [w.HANDLE, c.POINTER(w.DWORD)])
signature(dxva2, 'GetPhysicalMonitorsFromHMONITOR', [w.HANDLE, w.DWORD, c.POINTER(PhysicalMonitor)])
signature(dxva2, 'GetCapabilitiesStringLength', [w.HANDLE, c.POINTER(w.DWORD)])
signature(dxva2, 'CapabilitiesRequestAndCapabilitiesReply', [w.HANDLE, c.c_char_p, w.DWORD])
signature(dxva2, 'SetVCPFeature', [w.HANDLE, w.BYTE, w.DWORD])
signature(dxva2, 'DestroyPhysicalMonitor', [w.HANDLE])
signature(wevtapi, 'EvtQuery', [w.HANDLE, w.LPCWSTR, w.LPCWSTR, w.DWORD], w.HANDLE)
signature(wevtapi, 'EvtNext', [w.HANDLE, w.DWORD, c.POINTER(w.HANDLE), w.DWORD,
          w.DWORD, c.POINTER(w.DWORD)])
signature(wevtapi, 'EvtRender', [w.HANDLE, w.HANDLE, w.DWORD, w.DWORD,
          w.LPVOID, c.POINTER(w.DWORD), c.POINTER(w.DWORD)])
signature(wevtapi, 'EvtClose', [w.HANDLE])

def recent_action(max_age_ms=1800000):
    query = "*[System[Provider[@Name='User32'] and EventID=1074 and TimeCreated[timediff(@SystemTime) <= %d]]]" % max_age_ms
    results = wevtapi.EvtQuery(None, 'System', query, 0x201)
    if not results:
        log('Event query failed: ' + str(c.get_last_error()))
        return None
    event = w.HANDLE()
    try:
        returned = w.DWORD()
        if not wevtapi.EvtNext(results, 1, c.byref(event), 150, 0, c.byref(returned)):
            return None
        used, count = w.DWORD(), w.DWORD()
        wevtapi.EvtRender(None, event, 1, 0, None, c.byref(used), c.byref(count))
        if not 0 < used.value < 1048576:
            return None
        buffer = c.create_unicode_buffer((used.value + 1) // 2)
        if not wevtapi.EvtRender(None, event, 1, c.sizeof(buffer), buffer, c.byref(used), c.byref(count)):
            return None
        root = ET.fromstring(buffer.value)
        ns = {'e': 'http://schemas.microsoft.com/win/2004/08/events/event'}
        value = root.find("e:EventData/e:Data[@Name='param5']", ns)
        return value.text if value is not None else None
    finally:
        if event:
            wevtapi.EvtClose(event)
        wevtapi.EvtClose(results)

class Monitor:
    def __init__(self):
        self.handles = []

    def close(self):
        for handle in self.handles:
            dxva2.DestroyPhysicalMonitor(handle)
        self.handles.clear()

    def refresh(self):
        previous, self.handles = self.handles, []
        def visit(hmonitor, hdc, rect, param):
            count = w.DWORD()
            if not dxva2.GetNumberOfPhysicalMonitorsFromHMONITOR(hmonitor, c.byref(count)):
                return True
            monitors = (PhysicalMonitor * count.value)()
            if not dxva2.GetPhysicalMonitorsFromHMONITOR(hmonitor, count, monitors):
                return True
            for monitor in monitors:
                keep = False
                try:
                    length = w.DWORD()
                    if dxva2.GetCapabilitiesStringLength(monitor.handle, c.byref(length)) and 0 < length.value < 65536:
                        buf = c.create_string_buffer(length.value)
                        if dxva2.CapabilitiesRequestAndCapabilitiesReply(monitor.handle, buf, length):
                            keep = b'model(CL25FF)' in buf.value
                    if keep:
                        self.handles.append(monitor.handle)
                finally:
                    if not keep:
                        dxva2.DestroyPhysicalMonitor(monitor.handle)
            return True
        callback = MONPROC(visit)
        user32.EnumDisplayMonitors(None, None, callback, 0)
        found = bool(self.handles)
        if found:
            for handle in previous:
                dxva2.DestroyPhysicalMonitor(handle)
        else:
            # DDC capabilities can disappear briefly after a power transition.
            # Retain the already verified target instead of losing the connection.
            self.handles = previous
        log('Target monitors ready: ' + str(len(self.handles)) + '; fresh=' + str(found))
        return found

    def power(self, value):
        successes = 0
        for handle in self.handles:
            ok = dxva2.SetVCPFeature(handle, 0xD6, value)
            successes += bool(ok)
            log('CL25FF power=' + str(value) + ' success=' + str(bool(ok)) +
                ' error=' + str(c.get_last_error() if not ok else 0))
        return successes

def send(message):
    hwnd = user32.FindWindowW(CLASS, None)
    if not hwnd:
        return None
    result = c.c_size_t()
    ok = user32.SendMessageTimeoutW(hwnd, message, 0, 0, 2, 3000, c.byref(result))
    return result.value if ok else None

def run():
    mutex = kernel32.CreateMutexW(None, False, r'Local\AsrockCL25FFAutoOff.v1')
    if not mutex:
        raise c.WinError(c.get_last_error())
    if c.get_last_error() == 183:
        kernel32.CloseHandle(mutex)
        return
    monitor = Monitor()
    test_active = False
    refresh_attempts = 0
    restore_pending = True
    def switch_off():
        if monitor.power(5):
            WAKE_MARKER.write_text('Restore ASRock CL25FF at the next login.\n', encoding='utf-8')

    def restore_after_login():
        nonlocal restore_pending
        if restore_pending and monitor.handles and monitor.power(1):
            restore_pending = False
            WAKE_MARKER.unlink(missing_ok=True)
            log('Monitor enabled at login or by explicit command')
        return not restore_pending

    controller = SessionController(switch_off, recent_action)
    def procedure(hwnd, message, wp, lp):
        nonlocal test_active, refresh_attempts, restore_pending
        try:
            if message == WM_QUERYENDSESSION:
                answer = controller.query(lp)
                log('Shutdown query; action=' + repr(controller.action) + ' flags=' + str(lp))
                return answer
            if message == WM_ENDSESSION:
                controller.end(bool(wp), lp)
                return 0
            if message == PING:
                return 1
            if message == STATUS:
                return len(monitor.handles)
            if message == POWER_ON:
                restore_pending = True
                refresh_attempts = 0
                restored = restore_after_login()
                if not restored:
                    user32.SetTimer(hwnd, 2, 5000, None)
                return int(restored)
            if message == TEST:
                # Exercise the same committed-shutdown handler without ending Windows.
                # Arm recovery first, so a failed power-on cannot leave the test pending.
                if not user32.SetTimer(hwnd, 1, 10000, None):
                    return 0
                test_active = True
                # Do not inject a fake shutdown reason: exercise the missing-event
                # case that previously caused real shutdowns to be skipped.
                controller.query(0)
                controller.end(True, 0)
                log('Test: restore scheduled in 10 seconds')
                return 1
            if message == WM_TIMER:
                user32.KillTimer(hwnd, wp)
                if wp == 1:
                    if monitor.power(1):
                        WAKE_MARKER.unlink(missing_ok=True)
                    test_active = False
                    refresh_attempts = 0
                    user32.SetTimer(hwnd, 2, 5000, None)
                    log('Test: restoration complete')
                elif wp == 2:
                    if not test_active:
                        refresh_attempts += 1
                        fresh = monitor.refresh()
                        restored = restore_after_login()
                        if (not fresh or not restored) and refresh_attempts < 12:
                            user32.SetTimer(hwnd, 2, 5000, None)
                        elif not restored:
                            log('Monitor wake retries exhausted; use --on to retry')
                return 0
            if message == WM_DISPLAYCHANGE:
                if not test_active:
                    refresh_attempts = 0
                    user32.SetTimer(hwnd, 2, 5000, None)
                return 0
            if message == WM_CLOSE:
                user32.DestroyWindow(hwnd)
                return 0
            if message == WM_DESTROY:
                user32.PostQuitMessage(0)
                return 0
        except Exception:
            log(traceback.format_exc())
            return 1 if message == WM_QUERYENDSESSION else 0
        return user32.DefWindowProcW(hwnd, message, wp, lp)
    callback = WNDPROC(procedure)
    instance = kernel32.GetModuleHandleW(None)
    wc = WindowClass()
    wc.proc, wc.instance, wc.class_name = callback, instance, CLASS
    if not user32.RegisterClassW(c.byref(wc)):
        raise c.WinError(c.get_last_error())
    hwnd = user32.CreateWindowExW(0, CLASS, 'ASRock monitor automatic power off',
                                 0, 0, 0, 0, 0, None, None, instance, None)
    if not hwnd:
        raise c.WinError(c.get_last_error())
    # Run before the default-priority GUI apps while the video driver is available.
    kernel32.SetProcessShutdownParameters(0x3FF, 1)
    try:
        fresh = monitor.refresh()
        if not restore_after_login() or not fresh:
            user32.SetTimer(hwnd, 2, 5000, None)
        log('Listener started; pid=' + str(__import__('os').getpid()))
        msg = w.MSG()
        while user32.GetMessageW(c.byref(msg), None, 0, 0) > 0:
            user32.TranslateMessage(c.byref(msg))
            user32.DispatchMessageW(c.byref(msg))
    finally:
        monitor.close()
        kernel32.CloseHandle(mutex)
        log('Listener stopped')

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else '--run'
    if mode == '--run':
        run()
    elif mode == '--status':
        print(json.dumps({'running': send(PING) == 1, 'targets': send(STATUS)}))
    elif mode == '--on':
        result = send(POWER_ON)
        if result is None:
            monitor = Monitor()
            try:
                monitor.refresh()
                result = monitor.power(1)
            finally:
                monitor.close()
        print(json.dumps({'power_on': bool(result)}))
        if not result:
            raise SystemExit(1)
    elif mode == '--test':
        result = send(TEST)
        print(json.dumps({'test_started': result == 1}))
        if result != 1:
            raise SystemExit(1)
    elif mode == '--stop':
        print(json.dumps({'stop_sent': send(WM_CLOSE) is not None}))
    elif mode == '--event-check':
        print(json.dumps({'latest_shutdown_action': recent_action(0x7FFFFFFF)}))
    elif mode == '--disable':
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
            try:
                winreg.DeleteValue(key, RUN_NAME)
            except FileNotFoundError:
                pass
        subprocess.run(['schtasks.exe', '/Delete', '/TN', TASK_NAME, '/F'],
                       creationflags=subprocess.CREATE_NO_WINDOW,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        send(WM_CLOSE)
        log('Autostart disabled')
    else:
        raise SystemExit('Unknown mode: ' + mode)

if __name__ == '__main__':
    try:
        main()
    except Exception:
        log(traceback.format_exc())
        raise
