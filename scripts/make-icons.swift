// Generates the app icon (.icns) and the menu bar template image.
//
// The mark is the pilcrow, ¶. It is the app's whole thesis in one glyph: the
// pilcrow descends from the Greek paragraphos, a mark scribes drew to tell
// someone reading aloud where to pause. Drawn from the system font so the
// curves are properly typographic rather than hand-approximated.
//
// Run via scripts/make-icons.sh; the output is committed, so this only needs
// re-running when the artwork changes.

import AppKit
import Foundation

let outputRoot = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "assets"

func writePNG(_ image: NSImage, to path: String) {
    guard let tiff = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let data = bitmap.representation(using: .png, properties: [:])
    else {
        FileHandle.standardError.write("failed to encode \(path)\n".data(using: .utf8)!)
        exit(1)
    }
    try? data.write(to: URL(fileURLWithPath: path))
}

/// Draws a centred pilcrow filling the given box, in the given colour.
func drawPilcrow(in box: NSRect, color: NSColor) {
    // The glyph's drawn ink is shorter than its line height, so the font size is
    // scaled up and the result is measured and centred rather than assumed.
    let font = NSFont.systemFont(ofSize: box.height * 1.34, weight: .semibold)
    let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
    let glyph = NSAttributedString(string: "\u{00B6}", attributes: attributes)

    let measured = glyph.size()
    let origin = NSPoint(
        x: box.midX - measured.width / 2,
        // Optical centring: the pilcrow's descender pulls its visual mass down,
        // so nudge it up off the geometric centre.
        y: box.midY - measured.height / 2 + box.height * 0.04,
    )
    glyph.draw(at: origin)
}

/// The rounded-square app icon: a violet plate with a white pilcrow.
func makeAppIcon(size: CGFloat) -> NSImage {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()

    // macOS icons sit inside a margin rather than filling the canvas edge to edge.
    let inset = size * 0.09
    let plate = NSRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2)
    let radius = plate.width * 0.2237 // Matches the macOS squircle proportion closely.

    let plateShape = NSBezierPath(roundedRect: plate, xRadius: radius, yRadius: radius)
    let gradient = NSGradient(
        colors: [
            NSColor(srgbRed: 0.74, green: 0.48, blue: 0.95, alpha: 1.0),
            NSColor(srgbRed: 0.29, green: 0.12, blue: 0.53, alpha: 1.0),
        ],
    )
    gradient?.draw(in: plateShape, angle: -90)

    let markBox = NSRect(
        x: plate.minX,
        y: plate.minY + plate.height * 0.26,
        width: plate.width,
        height: plate.height * 0.48,
    )
    drawPilcrow(in: markBox, color: .white)

    image.unlockFocus()
    return image
}

/// The menu bar icon: pure black on transparent, so macOS treats it as a
/// template and inverts it for dark mode and highlighted states.
func makeTrayIcon(size: CGFloat) -> NSImage {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()

    let markBox = NSRect(x: 0, y: size * 0.16, width: size, height: size * 0.68)
    drawPilcrow(in: markBox, color: .black)

    image.unlockFocus()
    return image
}

let iconsetPath = "\(outputRoot)/icon.iconset"
try? FileManager.default.createDirectory(atPath: iconsetPath, withIntermediateDirectories: true)

// The sizes iconutil expects for a complete iconset.
let iconSizes: [(name: String, size: CGFloat)] = [
    ("icon_16x16", 16), ("icon_16x16@2x", 32),
    ("icon_32x32", 32), ("icon_32x32@2x", 64),
    ("icon_128x128", 128), ("icon_128x128@2x", 256),
    ("icon_256x256", 256), ("icon_256x256@2x", 512),
    ("icon_512x512", 512), ("icon_512x512@2x", 1024),
]

for entry in iconSizes {
    writePNG(makeAppIcon(size: entry.size), to: "\(iconsetPath)/\(entry.name).png")
}

writePNG(makeTrayIcon(size: 18), to: "\(outputRoot)/trayTemplate.png")
writePNG(makeTrayIcon(size: 36), to: "\(outputRoot)/trayTemplate@2x.png")

print("icons written to \(outputRoot)")
