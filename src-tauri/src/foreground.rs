//! Small platform boundary for returning to the foreground window we interrupted.
//! No forced focus, thread attachment, or process-global keyboard hooks.
#[cfg(target_os = "windows")]
mod native {
    use std::ffi::c_void;
    #[link(name = "user32")]
    extern "system" {
        fn GetForegroundWindow() -> *mut c_void;
        fn IsWindow(window: *mut c_void) -> i32;
        fn SetForegroundWindow(window: *mut c_void) -> i32;
        fn GetWindowThreadProcessId(window: *mut c_void, process: *mut u32) -> u32;
    }
    pub fn remember() -> usize {
        // SAFETY: these calls only inspect a borrowed HWND and a local PID output.
        unsafe {
            let window = GetForegroundWindow();
            let mut process = 0;
            GetWindowThreadProcessId(window, &mut process);
            if process == std::process::id() { 0 } else { window as usize }
        }
    }
    pub fn restore(window: usize) -> bool {
        // SAFETY: the OS validates this borrowed HWND before the focus request.
        unsafe {
            let window = window as *mut c_void;
            if window.is_null() || IsWindow(window) == 0 { return false; }
            if GetForegroundWindow() != window { SetForegroundWindow(window); }
            // Cross-thread activation can briefly report no foreground window.
            // Commands run off the native event loop; allow its activation to
            // settle without sending repeated focus requests or forcing input.
            for _ in 0..10 {
                if GetForegroundWindow() == window { return true; }
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
            let restored = GetForegroundWindow() == window;
            #[cfg(debug_assertions)]
            if !restored { eprintln!("foreground restoration pending: target={}, actual={}", window as usize, GetForegroundWindow() as usize); }
            restored
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod native {
    pub fn remember() -> usize { 0 }
    // Native hide returns activation to the prior application on other platforms.
    // Physical macOS/Linux behavior remains a runtime verification item.
    pub fn restore(_: usize) -> bool { false }
}

pub use native::{remember, restore};
