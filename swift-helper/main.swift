import AppKit
import ApplicationServices
// IsSecureEventInputEnabled still lives in Carbon's HIToolbox; there is no
// modern replacement for it.
import Carbon.HIToolbox
import Foundation

// pilcrow-helper — reads the user's current text selection and prints one JSON line.
//
// Two strategies, in order of preference:
//   1. Accessibility: ask the focused UI element for kAXSelectedTextAttribute.
//      Invisible to the user and to the pasteboard. Works in most native apps.
//   2. Clipboard: synthesize Cmd+C, read the pasteboard, then put the old
//      pasteboard back. Needed for terminals and some web views, where the AX
//      selection attribute is unimplemented.
//
// Usage: pilcrow-helper get-selection [--no-clipboard]

struct Response: Codable {
    var ok: Bool
    var text: String?
    var method: String?
    var sourceApp: String?
    var sourceName: String?
    var error: String?
}

func emit(_ response: Response) -> Never {
    let encoder = JSONEncoder()
    if let data = try? encoder.encode(response), let line = String(data: data, encoding: .utf8) {
        print(line)
    }
    exit(response.ok ? 0 : 1)
}

func frontmostApp() -> NSRunningApplication? {
    NSWorkspace.shared.frontmostApplication
}

// MARK: - Strategy 1: Accessibility

/// Reads kAXSelectedTextAttribute from the system-wide focused element.
/// Returns nil when the attribute is missing or empty, which is the signal to
/// fall back to the clipboard.
func selectionViaAccessibility() -> String? {
    let systemWide = AXUIElementCreateSystemWide()

    var focused: CFTypeRef?
    let focusResult = AXUIElementCopyAttributeValue(
        systemWide, kAXFocusedUIElementAttribute as CFString, &focused)
    guard focusResult == .success, let focusedRef = focused else { return nil }
    // CFTypeRef -> AXUIElement is safe here: the attribute is documented to
    // return an AXUIElement, and we only reached this line on .success.
    let element = focusedRef as! AXUIElement

    var selected: CFTypeRef?
    let selectionResult = AXUIElementCopyAttributeValue(
        element, kAXSelectedTextAttribute as CFString, &selected)
    guard selectionResult == .success, let text = selected as? String else { return nil }

    return text.isEmpty ? nil : text
}

// MARK: - Strategy 2: Clipboard

/// True when a password field or similar has secure input enabled. Synthesizing
/// Cmd+C in that state either silently fails or, worse, copies a credential we
/// would then hand to a cloud TTS API. Refuse instead.
func secureInputActive() -> Bool {
    IsSecureEventInputEnabled()
}

/// Snapshots every representation of every pasteboard item, so restoring gives
/// the user back rich content (files, images, styled text), not just a string.
func snapshotPasteboard() -> [[String: Data]] {
    let pasteboard = NSPasteboard.general
    guard let items = pasteboard.pasteboardItems else { return [] }
    return items.map { item in
        var representations: [String: Data] = [:]
        for type in item.types {
            if let data = item.data(forType: type) {
                representations[type.rawValue] = data
            }
        }
        return representations
    }
}

func restorePasteboard(_ snapshot: [[String: Data]]) {
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()
    guard !snapshot.isEmpty else { return }
    let items = snapshot.map { representations -> NSPasteboardItem in
        let item = NSPasteboardItem()
        for (type, data) in representations {
            item.setData(data, forType: NSPasteboard.PasteboardType(type))
        }
        return item
    }
    pasteboard.writeObjects(items)
}

func sendCommandC() {
    guard let source = CGEventSource(stateID: .combinedSessionState) else { return }
    // 8 is the virtual keycode for "c" on every layout; it is positional.
    let keyDown = CGEvent(keyboardEventSource: source, virtualKey: 8, keyDown: true)
    let keyUp = CGEvent(keyboardEventSource: source, virtualKey: 8, keyDown: false)
    keyDown?.flags = .maskCommand
    keyUp?.flags = .maskCommand
    keyDown?.post(tap: .cghidEventTap)
    keyUp?.post(tap: .cghidEventTap)
}

func selectionViaClipboard() -> String? {
    let pasteboard = NSPasteboard.general
    let snapshot = snapshotPasteboard()
    let changeCountBefore = pasteboard.changeCount

    sendCommandC()

    // Poll rather than sleep a fixed amount: most apps answer in well under
    // 50ms and we do not want to spend the full budget every time.
    let deadline = Date().addingTimeInterval(0.35)
    var copied: String?
    while Date() < deadline {
        if pasteboard.changeCount != changeCountBefore {
            copied = pasteboard.string(forType: .string)
            break
        }
        Thread.sleep(forTimeInterval: 0.01)
    }

    restorePasteboard(snapshot)

    guard let text = copied, !text.isEmpty else { return nil }
    return text
}

// MARK: - Entry point

let arguments = CommandLine.arguments
guard arguments.count > 1, arguments[1] == "get-selection" else {
    emit(Response(ok: false, error: "usage: pilcrow-helper get-selection [--no-clipboard]"))
}
let clipboardAllowed = !arguments.contains("--no-clipboard")

guard AXIsProcessTrusted() else {
    emit(Response(ok: false, error: "accessibility-permission-denied"))
}

let app = frontmostApp()
let bundleId = app?.bundleIdentifier
let appName = app?.localizedName

if let text = selectionViaAccessibility() {
    emit(Response(ok: true, text: text, method: "accessibility", sourceApp: bundleId, sourceName: appName))
}

guard clipboardAllowed else {
    emit(Response(ok: false, sourceApp: bundleId, sourceName: appName, error: "no-selection"))
}

guard !secureInputActive() else {
    emit(Response(ok: false, sourceApp: bundleId, sourceName: appName, error: "secure-input-active"))
}

if let text = selectionViaClipboard() {
    emit(Response(ok: true, text: text, method: "clipboard", sourceApp: bundleId, sourceName: appName))
}

emit(Response(ok: false, sourceApp: bundleId, sourceName: appName, error: "no-selection"))
