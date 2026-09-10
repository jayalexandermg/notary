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
    }
    pub fn remember() -> usize {
        // SAFETY: GetForegroundWindow has no arguments or ownership transfer.
        unsafe { GetForegroundWindow() as usize }
    }
    pub fn restore(window: usize) -> bool {
        // SAFETY: the OS validates this borrowed HWND before the focus request.
        unsafe {
            let window = window as *mut c_void;
            !window.is_null() && IsWindow(window) != 0 && SetForegroundWindow(window) != 0
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
