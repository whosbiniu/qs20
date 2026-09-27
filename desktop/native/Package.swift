// swift-tools-version: 5.10
import PackageDescription
let package = Package(name: "UNCsWayNative", platforms: [.macOS(.v14)], products: [.executable(name: "UNCsWayNative", targets: ["UNCsWayNative"])], targets: [.executableTarget(name: "UNCsWayNative")])
