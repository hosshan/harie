// Harie デスクトップ（Tauri 2）の殻。画面は Web エディタと同じ部品で、ここではファイルの読み書きだけを受け持つ
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager};

/// 開ける・保存できるのは JPEG と PNG だけ（FR-FILE-01, 02）。画面から任意のファイルを読み書きできないようにする
fn check_image_path(path: &Path) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    match ext.as_deref() {
        Some("jpg" | "jpeg" | "png") => Ok(()),
        _ => Err("JPEG か PNG のファイルを選んでください。".into()),
    }
}

/// 同じフォルダーの一時ファイルに書いてから置き換える。書き込みの途中で失敗しても元のファイルを壊さない
fn write_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let dir = path.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = dir.join(format!(".{name}.harie-tmp"));
    let result = (|| {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// 画像ファイルを読む。バイト列はそのまま返す（ベース画像を再エンコードしない。ADR-0004）
#[tauri::command]
fn read_image(path: PathBuf) -> Result<Response, String> {
    check_image_path(&path)?;
    let bytes = fs::read(&path).map_err(|e| format!("ファイルを読めません: {e}"))?;
    Ok(Response::new(bytes))
}

/// 画像ファイルを書く。本文はバイト列のまま受け取り、保存先は `Harie-Path` ヘッダー（URL エンコード）で受け取る
#[tauri::command]
fn write_image(request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("保存するデータがありません。".into());
    };
    let encoded = request
        .headers()
        .get("Harie-Path")
        .and_then(|v| v.to_str().ok())
        .ok_or("保存先がありません。")?;
    let path = PathBuf::from(
        percent_decode_str(encoded)
            .decode_utf8()
            .map_err(|_| "保存先の名前を読めません。")?
            .into_owned(),
    );
    check_image_path(&path)?;
    write_atomically(&path, bytes).map_err(|e| format!("ファイルに書き込めません: {e}"))
}

/// OS から開くように渡されたファイル（関連付け・「このアプリで開く」）。画面が受け取るまで溜めておく
#[derive(Default)]
struct PendingFiles(Mutex<Vec<PathBuf>>);

/// 起動引数のうち、開ける画像のパスだけを取り出す。先頭（実行ファイル）とオプションは除き、相対パスは `cwd` から解決する
fn image_paths_from_args(args: &[String], cwd: &Path) -> Vec<PathBuf> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(|a| cwd.join(a))
        .filter(|p| check_image_path(p).is_ok())
        .collect()
}

/// 渡されたファイルを溜めて画面に知らせ、ウィンドウを前に出す。画面がまだ無ければ、起動後に `take_pending_files` で受け取る
fn receive_files(app: &AppHandle, paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }
    if let Ok(mut pending) = app.state::<PendingFiles>().0.lock() {
        pending.extend(paths);
    }
    let _ = app.emit("harie://open-files", ());
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// 溜まっているファイルを受け取る（受け取った分は消す）
#[tauri::command]
fn take_pending_files(pending: tauri::State<'_, PendingFiles>) -> Vec<PathBuf> {
    pending.0.lock().map(|mut p| std::mem::take(&mut *p)).unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    // 2 つ目に起動されたとき（Windows / Linux の関連付けから開いたとき）は、ファイルを今のウィンドウに渡して終わる。
    // 最初に登録する決まり
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            receive_files(app, image_paths_from_args(&args, Path::new(&cwd)));
        }));
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingFiles::default())
        .setup(|app| {
            // Windows / Linux は、開くファイルが起動引数で渡される
            let args: Vec<String> = std::env::args().collect();
            let cwd = std::env::current_dir().unwrap_or_default();
            receive_files(app.handle(), image_paths_from_args(&args, &cwd));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![read_image, write_image, take_pending_files])
        .build(tauri::generate_context!())
        .expect("Harie を起動できませんでした")
        .run(handle_run_event);
}

/// macOS は、起動時も起動中も、開くファイルが Opened で渡される
#[cfg(any(target_os = "macos", target_os = "ios"))]
fn handle_run_event(app: &AppHandle, event: tauri::RunEvent) {
    if let tauri::RunEvent::Opened { urls } = event {
        let paths = urls.into_iter().filter_map(|u| u.to_file_path().ok());
        receive_files(app, paths.filter(|p| check_image_path(p).is_ok()).collect());
    }
}

#[cfg(not(any(target_os = "macos", target_os = "ios")))]
fn handle_run_event(_app: &AppHandle, _event: tauri::RunEvent) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_jpeg_and_png() {
        assert!(check_image_path(Path::new("/a/b.harie.jpg")).is_ok());
        assert!(check_image_path(Path::new("C:\\a\\B.JPEG")).is_ok());
        assert!(check_image_path(Path::new("画面.png")).is_ok());
        assert!(check_image_path(Path::new("/etc/passwd")).is_err());
        assert!(check_image_path(Path::new("/a/b.png.txt")).is_err());
    }

    #[test]
    fn picks_image_paths_from_args() {
        let args: Vec<String> = ["harie", "--flag", "a.png", "/x/画面.harie.jpg", "notes.txt"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        assert_eq!(
            image_paths_from_args(&args, Path::new("/work")),
            vec![PathBuf::from("/work/a.png"), PathBuf::from("/x/画面.harie.jpg")]
        );
        assert!(image_paths_from_args(&args[..1], Path::new("/work")).is_empty());
    }

    #[test]
    fn overwrites_and_leaves_no_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("画面.harie.jpg");
        fs::write(&path, b"old").unwrap();
        write_atomically(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
}
