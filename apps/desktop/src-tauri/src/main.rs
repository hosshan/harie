// Windows のリリースビルドでコンソールの窓を出さない
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    harie_desktop_lib::run()
}
