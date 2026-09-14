//! The reveal and its transient inspector share one native window. Shape the
//! Windows input region to their actual bounds, not a transparent desktop canvas.
use tauri::WebviewWindow;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect(pub f64, pub f64, pub f64, pub f64);
impl Rect {
    pub fn scaled(self, factor: f64) -> Self { Self(self.0 * factor, self.1 * factor, self.2 * factor, self.3 * factor) }
}

// Windows text scaling can make a CSS pixel larger than a native logical pixel.
// Preserve that accessibility setting while matching bounds and input regions.
pub fn css_scale(window: &WebviewWindow, pixel_ratio: Option<f64>) -> Result<f64, String> {
    let native = window.scale_factor().map_err(|e| e.to_string())?;
    let ratio = pixel_ratio.unwrap_or(native);
    if !ratio.is_finite() || !(0.25..=16.0).contains(&ratio) { return Err("Invalid WebView pixel ratio".into()); }
    Ok(ratio / native)
}

pub fn retrieval(height: f64, inspector: bool) -> (f64, f64, Vec<Rect>) {
    let height = height.clamp(80.0, 320.0);
    // A fixed coordinate frame avoids half-physical-pixel recentering when a
    // differently sized inspector appears. Only the shaped visible/input region
    // is content-sized; the unused frame is excluded from Windows hit testing.
    let total = 320.0;
    let top = (total - height) / 2.0;
    let mut regions = vec![Rect(0.0, total / 2.0 - 24.0, 28.0, 48.0), Rect(28.0, top, 296.0, height)];
    if inspector {
        regions.push(Rect(324.0, (total - height.min(280.0)) / 2.0, 8.0, height.min(280.0)));
        regions.push(Rect(332.0, (total - 280.0) / 2.0, 220.0, 280.0));
    }
    (if inspector { 552.0 } else { 324.0 }, total, regions)
}

#[cfg(target_os = "windows")]
pub fn shape(window: &WebviewWindow, rectangles: &[Rect]) -> Result<(), String> {
    use std::ffi::c_void;
    #[link(name = "gdi32")]
    extern "system" {
        fn CreateRectRgn(left: i32, top: i32, right: i32, bottom: i32) -> *mut c_void;
        fn CombineRgn(dest: *mut c_void, first: *mut c_void, second: *mut c_void, mode: i32) -> i32;
        fn DeleteObject(object: *mut c_void) -> i32;
    }
    #[link(name = "user32")]
    extern "system" { fn SetWindowRgn(window: *mut c_void, region: *mut c_void, redraw: i32) -> i32; }
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let handle = window.hwnd().map_err(|e| e.to_string())?.0;
    // SAFETY: every GDI handle is checked. Temporary regions are freed; Windows
    // owns the final region only after successful SetWindowRgn (MSDN contract).
    unsafe {
        let region = CreateRectRgn(0, 0, 0, 0);
        if region.is_null() { return Err("Could not allocate window region".into()); }
        for Rect(x, y, width, height) in rectangles {
            let part = CreateRectRgn((x * scale).floor() as i32, (y * scale).floor() as i32,
                ((x + width) * scale).ceil() as i32, ((y + height) * scale).ceil() as i32);
            if part.is_null() { DeleteObject(region); return Err("Could not allocate surface region".into()); }
            let result = CombineRgn(region, region, part, 2); // RGN_OR
            DeleteObject(part);
            if result == 0 { DeleteObject(region); return Err("Could not combine surface regions".into()); }
        }
        if SetWindowRgn(handle, region, 1) == 0 {
            DeleteObject(region);
            return Err("Could not apply surface region".into());
        }
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn shape(_: &WebviewWindow, _: &[Rect]) -> Result<(), String> { Ok(()) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inspector_never_moves_source_in_screen_coordinates() {
        for height in [100.0, 138.0, 219.0, 320.0] {
            let (width, total, plain) = retrieval(height, false);
            let (_, inspected_total, inspected) = retrieval(height, true);
            assert_eq!(width, 324.0);
            assert_eq!(plain[1].2, 296.0);
            assert_eq!(plain[1].1 - total / 2.0, inspected[1].1 - inspected_total / 2.0);
            assert_eq!(plain[0].1 - total / 2.0, inspected[0].1 - inspected_total / 2.0);
        }
        assert_eq!(retrieval(999.0, false).1, 320.0);
    }
}
