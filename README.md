# Twinkle Tray Offline Custom

A personal Windows x64 fork of [Twinkle Tray](https://github.com/xanderfrangos/twinkle-tray), with compact brightness presets and enforced offline behavior. Adjust supported monitors from the system tray and switch between saved brightness levels with one click.

## What's new in this fork

### Early startup and reliable preset clicks

- Starting the app between 00:00 and 06:59 (Windows local time) sets each supported display to 0% once. Displays discovered during the next two minutes are included. A manual brightness change cancels pending startup dimming. Starting at or after 07:00 keeps the normal saved-brightness behavior; there is no forced change at 07:00.
- Preset clicks cancel pending slider writes and transitions. A monitor refresh already in progress cannot replace the newly selected level with its older reading.
- `tools/asrock-monitor/monitor_auto_off.pyw` is the companion for the ASRock CL25FF. It enables the monitor at login, retries discovery/wake for up to one minute, and retains the existing shutdown behavior. `--on` or `Включить монитор.cmd` explicitly enables it without shutting down Windows. The deployed helper lives in `Documents/Codex/Utilities/AsrockMonitorAutoOff` and uses the existing logon task.
- `tools/install-startup.ps1` installs a hidden per-user Twinkle Tray logon task for the desktop custom build. It does not require an administrator account.

### Quick brightness presets

- Compact preset buttons appear below the brightness sliders in the tray panel.
- Each preset stores a separate brightness value for each supported monitor.
- The matching preset is highlighted when the connected monitors match its saved levels. Hover over a button to see its saved brightness values.
- Create and manage presets in **Settings → Presets**. Rename them, edit each monitor's brightness with a slider or numeric input, replace their values with the current brightness, or delete them with confirmation.
- Names must be unique and contain 1–80 characters; brightness values must be between 0% and 100%.
- Editing individual values preserves saved entries for disconnected monitors. Replacing a preset with the current brightness captures the currently available monitors.

### Enforced offline behavior

- Telemetry, update downloads/checks, and automatic geolocation lookup implementations are removed or disabled.
- The offline policy blocks HTTP/HTTPS, DNS, TCP, UDP, and WebSocket networking in the main process, monitor processes, and interface preload scripts.
- Electron cancels remote browser requests while allowing local UI resources. Opening external links is disabled.
- Settings, including imported configurations, cannot re-enable telemetry, update checks, or the UDP server. Network-based Yoctopuce light sensor integration is disabled as well.
- Local Windows named-pipe communication remains available for application and monitor helpers.

The packaged application works offline. Installing dependencies and preparing a build still requires internet access.

### Separate portable data

The custom build stores settings and presets in a `data` folder beside the executable, separate from the installed Twinkle Tray's data. During development, this folder is created inside the checkout. Personal data is excluded from Git.

## Using presets

1. Adjust your monitors to the brightness levels you want to save.
2. Open **Settings → Presets**, enter a name, and add the preset.
3. Open the tray panel and click the new button below the sliders to apply it.
4. Return to the Presets page to rename the preset, change individual values, capture the current brightness again, or delete it.

The custom preset controls currently use Russian labels; the page is labeled **Пресеты** in the interface.

## Build and run

Requirements: Windows, Node.js with npm, and Visual Studio with the C++ build tools needed for native modules. Dependency installation needs internet access, including Electron headers.

Run these commands from the repository root:

```powershell
npm ci
npm run parcel-build
node node_modules/electron-builder/cli.js --win --x64 --dir --config electron-builder.custom.cjs
```

The unpacked application is created in `../Twinkle-Tray-Portable/win-unpacked`. Launch **Twinkle Tray Custom.exe** and keep the entire folder together.

Before packaging again, back up the existing `data` folder outside the output directory: electron-builder clears its build output folder.

## Verification

Run the custom checks from the repository root:

```powershell
node --test tests/quick-presets.test.js tests/quick-presets-ipc.test.js tests/preset-ui.test.js tests/offline.test.js
```

The checks cover preset creation and validation, settings persistence, disconnected monitors, active-preset highlighting, the preset UI, IPC permissions, enforced offline settings, blocked network requests, and working local Windows named-pipe communication.

## Upstream and documentation

Based on Twinkle Tray revision `5973c00`. This is a personal custom build, not an official Twinkle Tray release.

- [Original Twinkle Tray README](README.upstream.md)
- [Custom build notes in Russian](CUSTOM.md)
- [MIT license](LICENSE)

The inherited GitHub workflow is archived in `.github/upstream-workflows` and does not run automatically. Personal settings, logs, presets, and compiled builds are excluded from the repository.
