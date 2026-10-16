// Harie デスクトップ（Tauri 2）の殻。画面は Web エディタと同じ部品で、ここではファイルの読み書きだけを受け持つ
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request, Response};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_image, write_image])
        .run(tauri::generate_context!())
        .expect("Harie を起動できませんでした");
}

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
    fn overwrites_and_leaves_no_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("画面.harie.jpg");
        fs::write(&path, b"old").unwrap();
        write_atomically(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
}
