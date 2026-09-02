import Compression
import Foundation

/// Minimal, dependency-free ZIP extractor for trusted archives (TTS voice
/// bundles, backup sections). Reads the central directory and inflates STORE
/// (0) and DEFLATE (8) entries via the `Compression` framework. Zip64 and
/// encryption are not supported.
enum ZipReader {
  enum ZipError: LocalizedError {
    case notAZip
    case unsupported(String)
    case corrupt(String)

    var errorDescription: String? {
      switch self {
      case .notAZip: return "File is not a ZIP archive."
      case let .unsupported(what): return "Unsupported ZIP feature: \(what)."
      case let .corrupt(why): return "Corrupt ZIP archive: \(why)."
      }
    }
  }

  private static let eocdSignature: UInt32 = 0x0605_4b50
  private static let centralSignature: UInt32 = 0x0201_4b50
  private static let localSignature: UInt32 = 0x0403_4b50

  static func extract(zipPath: String, to destDir: String) throws {
    let data = try Data(contentsOf: URL(fileURLWithPath: zipPath), options: .mappedIfSafe)
    let fm = FileManager.default
    try fm.createDirectory(atPath: destDir, withIntermediateDirectories: true)
    let destURL = URL(fileURLWithPath: destDir)

    let eocd = try findEOCD(in: data)
    let entryCount = Int(readU16(data, eocd + 10))
    var offset = Int(readU32(data, eocd + 16))

    for _ in 0..<entryCount {
      guard offset + 46 <= data.count, readU32(data, offset) == centralSignature else {
        throw ZipError.corrupt("central directory entry")
      }
      let method = readU16(data, offset + 10)
      let compressedSize = Int(readU32(data, offset + 20))
      let uncompressedSize = Int(readU32(data, offset + 24))
      let nameLen = Int(readU16(data, offset + 28))
      let extraLen = Int(readU16(data, offset + 30))
      let commentLen = Int(readU16(data, offset + 32))
      let localOffset = Int(readU32(data, offset + 42))

      if compressedSize == 0xFFFF_FFFF || uncompressedSize == 0xFFFF_FFFF
        || localOffset == 0xFFFF_FFFF
      {
        throw ZipError.unsupported("zip64")
      }

      let nameRange = (offset + 46)..<(offset + 46 + nameLen)
      guard nameRange.upperBound <= data.count else {
        throw ZipError.corrupt("entry name")
      }
      let name = String(decoding: data[nameRange], as: UTF8.self)
      offset += 46 + nameLen + extraLen + commentLen

      if name.isEmpty || name.hasSuffix("/") { continue }
      // Reject path traversal.
      if name.hasPrefix("/") || name.split(separator: "/").contains("..") {
        continue
      }

      guard
        localOffset + 30 <= data.count,
        readU32(data, localOffset) == localSignature
      else { throw ZipError.corrupt("local header") }
      let localNameLen = Int(readU16(data, localOffset + 26))
      let localExtraLen = Int(readU16(data, localOffset + 28))
      let dataStart = localOffset + 30 + localNameLen + localExtraLen
      guard dataStart + compressedSize <= data.count else {
        throw ZipError.corrupt("entry data")
      }
      let compressed = data.subdata(in: dataStart..<(dataStart + compressedSize))

      let payload: Data
      switch method {
      case 0:
        payload = compressed
      case 8:
        payload = try inflate(compressed, expectedSize: uncompressedSize)
      default:
        throw ZipError.unsupported("compression method \(method)")
      }

      let fileURL = destURL.appendingPathComponent(name)
      try fm.createDirectory(
        at: fileURL.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      try payload.write(to: fileURL, options: .atomic)
    }
  }

  private static func findEOCD(in data: Data) throws -> Int {
    // 22-byte record + up to 65535 bytes of trailing comment.
    let minSize = 22
    guard data.count >= minSize else { throw ZipError.notAZip }
    let searchStart = max(0, data.count - minSize - 0xFFFF)
    var i = data.count - minSize
    while i >= searchStart {
      if readU32(data, i) == eocdSignature { return i }
      i -= 1
    }
    throw ZipError.notAZip
  }

  private static func inflate(_ input: Data, expectedSize: Int) throws -> Data {
    if expectedSize == 0 { return Data() }
    var output = Data(count: expectedSize)
    let written = output.withUnsafeMutableBytes { dst -> Int in
      input.withUnsafeBytes { src -> Int in
        compression_decode_buffer(
          dst.bindMemory(to: UInt8.self).baseAddress!,
          expectedSize,
          src.bindMemory(to: UInt8.self).baseAddress!,
          input.count,
          nil,
          COMPRESSION_ZLIB
        )
      }
    }
    guard written == expectedSize else {
      throw ZipError.corrupt("inflate produced \(written)/\(expectedSize) bytes")
    }
    return output
  }

  private static func readU16(_ data: Data, _ offset: Int) -> UInt16 {
    UInt16(data[data.startIndex + offset])
      | (UInt16(data[data.startIndex + offset + 1]) << 8)
  }

  private static func readU32(_ data: Data, _ offset: Int) -> UInt32 {
    UInt32(data[data.startIndex + offset])
      | (UInt32(data[data.startIndex + offset + 1]) << 8)
      | (UInt32(data[data.startIndex + offset + 2]) << 16)
      | (UInt32(data[data.startIndex + offset + 3]) << 24)
  }
}
