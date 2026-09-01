import ExpoModulesCore
import Foundation

public class NativeVolumeButtonListenerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeVolumeButtonListener")

    Events("VolumeUp", "VolumeDown")

    // iOS has no volume-button page-turning. The JS side
    // (src/screens/reader/…) calls `setActive` unconditionally in a
    // useEffect, so without this the reader crashes on mount with
    // "undefined is not a function". Keep it a no-op; the VolumeUp/VolumeDown
    // events simply never fire on iOS.
    Function("setActive") { (_ active: Bool) in
    }
  }
}
