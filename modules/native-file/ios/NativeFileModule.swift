import ExpoModulesCore
import Foundation

public class NativeFileModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeFile")

    Function("writeFile") { (path: String, content: String) in
      try content.write(toFile: path, atomically: true, encoding: .utf8)
    }

    Function("readFile") { (path: String) in
      try String(contentsOfFile: path, encoding: .utf8)
    }

    Function("copyFile") { (sourcePath: String, destPath: String) in
      try FileManager.default.copyItem(atPath: sourcePath, toPath: destPath)
    }

    AsyncFunction("copyFileToDirectory") { (sourcePath: String, directoryUri: String, fileName: String, mimeType: String, replace: Bool) -> [String: Any] in
      _ = mimeType
      guard !fileName.isEmpty,
            fileName != ".",
            fileName != "..",
            !fileName.contains("/"),
            !fileName.contains("\\") else {
        throw NSError(
          domain: "NativeFile",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Invalid destination file name"]
        )
      }

      let fileManager = FileManager.default
      let directoryURL: URL
      if let parsedURL = URL(string: directoryUri), parsedURL.isFileURL {
        directoryURL = parsedURL
      } else {
        directoryURL = URL(fileURLWithPath: directoryUri, isDirectory: true)
      }
      let sourceURL = URL(fileURLWithPath: sourcePath)
      let destinationURL = directoryURL.appendingPathComponent(fileName)
      let stagingURL = directoryURL.appendingPathComponent(".\(fileName).\(UUID().uuidString).tmp")

      guard fileManager.fileExists(atPath: directoryURL.path) else {
        throw NSError(
          domain: "NativeFile",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Destination directory does not exist"]
        )
      }
      if fileManager.fileExists(atPath: destinationURL.path) && !replace {
        throw CocoaError(.fileWriteFileExists)
      }

      defer { try? fileManager.removeItem(at: stagingURL) }
      try fileManager.copyItem(at: sourceURL, to: stagingURL)
      let attributes = try fileManager.attributesOfItem(atPath: stagingURL.path)
      let copiedSize = (attributes[.size] as? NSNumber)?.int64Value ?? 0

      if fileManager.fileExists(atPath: destinationURL.path) {
        _ = try fileManager.replaceItemAt(destinationURL, withItemAt: stagingURL)
      } else {
        try fileManager.moveItem(at: stagingURL, to: destinationURL)
      }
      return ["uri": destinationURL.absoluteString, "size": copiedSize]
    }

    Function("moveFile") { (sourcePath: String, destPath: String) in
      try FileManager.default.moveItem(atPath: sourcePath, toPath: destPath)
    }

    Function("exists") { (filePath: String) in
      FileManager.default.fileExists(atPath: filePath)
    }

    Function("mkdir") { (filePath: String) in
      try FileManager.default.createDirectory(atPath: filePath, withIntermediateDirectories: true, attributes: nil)
    }

    Function("unlink") { (filePath: String) in
      try FileManager.default.removeItem(atPath: filePath)
    }

    Function("readDir") { (dirPath: String) -> [[String: Any]] in
      let contents = try FileManager.default.contentsOfDirectory(atPath: dirPath)
      return contents.map { fileName in
        let path = (dirPath as NSString).appendingPathComponent(fileName)
        var isDirectory: ObjCBool = false
        FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory)
        return [
          "name": fileName,
          "path": path,
          "isDirectory": isDirectory.boolValue
        ]
      }
    }

    AsyncFunction("downloadFile") { (url: String, destPath: String, method: String, headers: [String: String], body: String?, promise: Promise) in
      guard let requestURL = URL(string: url) else {
        promise.reject("DOWNLOAD_FAILED", "Invalid URL")
        return
      }

      var request = URLRequest(url: requestURL)
      request.httpMethod = method.isEmpty ? "GET" : method.uppercased()
      for (key, value) in headers {
        request.setValue(value, forHTTPHeaderField: key)
      }
      if request.httpMethod != "GET", let body = body {
        request.httpBody = body.data(using: .utf8)
      }

      let task = URLSession.shared.dataTask(with: request) { data, response, error in
        if let error = error {
          promise.reject("DOWNLOAD_FAILED", error.localizedDescription)
          return
        }
        if let http = response as? HTTPURLResponse,
           !(200...299).contains(http.statusCode) {
          promise.reject("DOWNLOAD_FAILED", "HTTP \(http.statusCode)")
          return
        }
        guard let data = data else {
          promise.reject("DOWNLOAD_FAILED", "Empty response")
          return
        }
        do {
          let destURL = URL(fileURLWithPath: destPath)
          try FileManager.default.createDirectory(
            at: destURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
          )
          try data.write(to: destURL, options: .atomic)
          promise.resolve(nil)
        } catch {
          promise.reject("DOWNLOAD_FAILED", error.localizedDescription)
        }
      }
      task.resume()
    }

    // Android Storage-Access-Framework pickers — not ported for iOS. These
    // exist so the JS contract is complete; calling them (backup import,
    // "choose folder", EPUB import) rejects instead of crashing the JS VM
    // with "undefined is not a function".
    AsyncFunction("createDocument") { (filename: String, mimeType: String, promise: Promise) in
      promise.reject("NOT_IMPLEMENTED", "createDocument is not implemented on iOS")
    }

    AsyncFunction("pickDocument") { (mimeType: String, promise: Promise) in
      promise.reject("NOT_IMPLEMENTED", "pickDocument is not implemented on iOS")
    }

    AsyncFunction("pickDirectory") { (promise: Promise) in
      promise.reject("NOT_IMPLEMENTED", "pickDirectory is not implemented on iOS")
    }

    Constant("DocumentDirectoryPath") {
      let paths = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true)
      return paths.first ?? ""
    }

    Constant("ExternalDirectoryPath") {
      let paths = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true)
      return paths.first ?? ""
    }

    Constant("ExternalCachesDirectoryPath") {
      let paths = NSSearchPathForDirectoriesInDomains(.cachesDirectory, .userDomainMask, true)
      return paths.first ?? ""
    }
  }
}
