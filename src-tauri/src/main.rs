// SPDX-License-Identifier: BSD-3-Clause
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::menu::Menu;
use tauri_plugin_dialog::DialogExt;

const MAX_EXPORT_BYTES: usize = 128 * 1024 * 1024;
const MAX_EXPORT_HEADER_BYTES: usize = 4096;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct ExportHeader {
    filename: String,
}

fn local_origin(scheme: &str, host: Option<&str>) -> bool {
    (scheme == "tauri" && host == Some("localhost"))
        || (["http", "https"].contains(&scheme) && host == Some("tauri.localhost"))
}

fn export_name(filename: &str) -> String {
    let name: String = filename
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .chars()
        .filter(|character| !character.is_control())
        .take(160)
        .collect();
    if name.is_empty() || name == "." || name == ".." {
        "export.bin".into()
    } else {
        name
    }
}

fn parse_export_packet(packet: &[u8]) -> Result<(String, &[u8]), String> {
    let prefix = packet
        .get(..4)
        .ok_or("Export packet is missing its header length")?;
    let header_length = u32::from_le_bytes(prefix.try_into().unwrap()) as usize;
    if !(1..=MAX_EXPORT_HEADER_BYTES).contains(&header_length) {
        return Err("Export header must contain 1..4096 bytes".into());
    }
    let data_offset = 4 + header_length;
    let bytes = packet
        .get(data_offset..)
        .ok_or("Export packet contains a truncated header")?;
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err("Export exceeds 128 MiB".into());
    }
    let header: ExportHeader = serde_json::from_slice(&packet[4..data_offset])
        .map_err(|error| format!("Invalid export header: {error}"))?;
    Ok((export_name(&header.filename), bytes))
}

#[tauri::command]
async fn save_export_binary(
    window: tauri::WebviewWindow,
    request: tauri::ipc::Request<'_>,
) -> Result<Option<String>, String> {
    let url = window.url().map_err(|error| error.to_string())?;
    if window.label() != "main" || !local_origin(url.scheme(), url.host_str()) {
        return Err("Only the local Synth window can save exports".into());
    }
    let tauri::ipc::InvokeBody::Raw(packet) = request.body() else {
        return Err("Export requires a binary file packet".into());
    };
    let (filename, bytes) = parse_export_packet(packet)?;
    let bytes = bytes.to_vec();
    tauri::async_runtime::spawn_blocking(move || {
        let chosen = window
            .dialog()
            .file()
            .set_parent(&window)
            .set_file_name(&filename)
            .blocking_save_file();
        let Some(chosen) = chosen else {
            return Ok(None);
        };
        let path = chosen.into_path().map_err(|error| error.to_string())?;
        std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|error| error.to_string())?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("synth-desktop")
                .js_init_script(include_str!("../../desktop/desktop-interface.js"))
                .build(),
        )
        .invoke_handler(tauri::generate_handler![save_export_binary])
        .setup(|app| {
            app.set_menu(Menu::default(app.handle())?)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Tetorica VSU Synth");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_the_export_packet_and_keeps_original_file_bytes() {
        let header = br#"{"filename":"dir/file.wav"}"#;
        let mut packet = (header.len() as u32).to_le_bytes().to_vec();
        packet.extend_from_slice(header);
        packet.extend_from_slice(&[0, 1, 0xff]);
        assert_eq!(
            parse_export_packet(&packet),
            Ok(("file.wav".into(), &[0, 1, 0xff][..]))
        );
        assert!(parse_export_packet(&packet[..10]).is_err());
        assert!(parse_export_packet(&[]).is_err());
    }

    #[test]
    fn exposes_export_to_the_packaged_tauri_origin() {
        assert!(local_origin("tauri", Some("localhost")));
        assert!(local_origin("http", Some("tauri.localhost")));
        assert!(!local_origin("https", Some("tauri.localhost.example")));
    }
}
