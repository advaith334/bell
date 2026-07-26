// Generates the app icon (.icns) and the menu bar template image.
//
// Both are drawn from the SF Symbol "bell.fill" so they match system iconography
// exactly. Run via scripts/make-icons.sh; the output is committed, so this only
// needs re-running when the artwork changes.

import AppKit
import Foundation

let outputRoot = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "assets"

func bellImage(pointSize: CGFloat, weight: NSFont.Weight) -> NSImage? {
    let configuration = NSImage.SymbolConfiguration(pointSize: pointSize, weight: weight)
    return NSImage(systemSymbolName: "bell.fill", accessibilityDescription: "Bell")?
        .withSymbolConfiguration(configuration)
}

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

/// The rounded-square app icon: a blue gradient plate with a white bell.
func makeAppIcon(size: CGFloat) -> NSImage {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()

    // macOS icons sit inside a margin rather than filling the canvas edge to edge.
    let inset = size * 0.09
    let plate = NSRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2)
    let radius = plate.width * 0.2237 // Matches the macOS squircle proportion closely.

    let path = NSBezierPath(roundedRect: plate, xRadius: radius, yRadius: radius)
    let gradient = NSGradient(
        colors: [
            NSColor(srgbRed: 0.43, green: 0.66, blue: 1.0, alpha: 1.0),
            NSColor(srgbRed: 0.16, green: 0.34, blue: 0.78, alpha: 1.0),
        ],
    )
    gradient?.draw(in: path, angle: -90)

    if let bell = bellImage(pointSize: plate.height * 0.52, weight: .medium) {
        let tinted = NSImage(size: bell.size)
        tinted.lockFocus()
        NSColor.white.set()
        NSRect(origin: .zero, size: bell.size).fill(using: .sourceOver)
        bell.draw(at: .zero, from: NSRect(origin: .zero, size: bell.size), operation: .destinationIn, fraction: 1)
        tinted.unlockFocus()

        let target = NSRect(
            x: plate.midX - tinted.size.width / 2,
            y: plate.midY - tinted.size.height / 2,
            width: tinted.size.width,
            height: tinted.size.height,
        )
        tinted.draw(in: target)
    }

    image.unlockFocus()
    return image
}

/// The menu bar icon: pure black on transparent, so macOS can treat it as a
/// template and invert it automatically for dark mode and highlighted states.
func makeTrayIcon(size: CGFloat) -> NSImage {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()

    if let bell = bellImage(pointSize: size * 0.78, weight: .regular) {
        let target = NSRect(
            x: (size - bell.size.width) / 2,
            y: (size - bell.size.height) / 2,
            width: bell.size.width,
            height: bell.size.height,
        )
        NSColor.black.set()
        NSRect(origin: .zero, size: NSSize(width: size, height: size)).fill(using: .sourceOver)
        bell.draw(in: target, from: NSRect(origin: .zero, size: bell.size), operation: .destinationIn, fraction: 1)
    }

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
