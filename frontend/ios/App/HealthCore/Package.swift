// swift-tools-version:5.9
// What the iPhone app's Apple Health bridge (App/AppleHealthPlugin.swift) decides without HealthKit:
// which samples to read back and how a workout is written. Plain Foundation, compiled straight into
// the app (App.xcodeproj references Sources/HealthCore/*.swift); this package exists so it can be
// tested with `swift test` on the Mac, no simulator needed.
import PackageDescription

let package = Package(
    name: "HealthCore",
    platforms: [.macOS(.v13), .iOS(.v15)],
    products: [.library(name: "HealthCore", targets: ["HealthCore"])],
    targets: [
        .target(name: "HealthCore"),
        .testTarget(name: "HealthCoreTests", dependencies: ["HealthCore"]),
    ]
)
