import ExpoModulesCore
import Foundation

public class NativeZipArchiveModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeZipArchive")

    AsyncFunction("unzip") { (sourceFilePath: String, distDirPath: String, promise: Promise) in
      DispatchQueue.global(qos: .utility).async {
        do {
          try ZipReader.extract(zipPath: sourceFilePath, to: distDirPath)
          promise.resolve(nil)
        } catch {
          promise.reject("UNZIP_FAILED", error.localizedDescription)
        }
      }
    }

    AsyncFunction("zip") { (sourceDirPath: String, zipFilePath: String, promise: Promise) in
      promise.reject("NOT_IMPLEMENTED", "zip is not implemented on iOS")
    }

    AsyncFunction("remoteUnzip") { (distDirPath: String, url: String, headers: [String: String], promise: Promise) in
      guard let requestURL = URL(string: url) else {
        promise.reject("REMOTE_UNZIP_FAILED", "Invalid URL")
        return
      }
      var request = URLRequest(url: requestURL)
      headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
      URLSession.shared.downloadTask(with: request) { tempURL, _, error in
        if let error {
          promise.reject("REMOTE_UNZIP_FAILED", error.localizedDescription)
          return
        }
        guard let tempURL else {
          promise.reject("REMOTE_UNZIP_FAILED", "No data")
          return
        }
        do {
          try ZipReader.extract(zipPath: tempURL.path, to: distDirPath)
          promise.resolve(nil)
        } catch {
          promise.reject("REMOTE_UNZIP_FAILED", error.localizedDescription)
        }
      }.resume()
    }

    AsyncFunction("remoteZip") { (sourceDirPath: String, url: String, headers: [String: String], promise: Promise) in
      promise.reject("NOT_IMPLEMENTED", "remoteZip is not implemented on iOS")
    }
  }
}
