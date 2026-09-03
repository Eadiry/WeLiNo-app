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

      let fileURL = destURL.appendingPathComponent(name)
      try fm.createDirectory(
        at: fileURL.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )

      // Stream the entry straight to disk. A voice-bundle member can be
      // 100+ MB; holding it (or its inflate buffer) in RAM spikes the app
      // into a jetsam. `data` is memory-mapped, so slicing it doesn't copy.
      switch method {
      case 0:
        try write(data, range: dataStart..<(dataStart + compressedSize), to: fileURL)
      case 8:
        try inflate(
          data,
          range: dataStart..<(dataStart + compressedSize),
          expectedSize: uncompressedSize,
          to: fileURL
        )
      default:
        throw ZipError.unsupported("compression method \(method)")
      }
    }
  }

  private static let chunkSize = 256 * 1024

  /// Copies `data[range]` to `fileURL` in chunks (STORE entries).
  private static func write(
    _ data: Data, range: Range<Int>, to fileURL: URL
  ) throws {
    FileManager.default.createFile(atPath: fileURL.path, contents: nil)
    let handle = try FileHandle(forWritingTo: fileURL)
    defer { try? handle.close() }
    var pos = range.lowerBound
    while pos < range.upperBound {
      let end = min(pos + chunkSize, range.upperBound)
      try handle.write(contentsOf: data.subdata(in: pos..<end))
      pos = end
    }
  }

  /// Inflates DEFLATE `data[range]` to `fileURL` in fixed-size chunks via the
  /// streaming `compression_stream` API — constant memory regardless of size.
  private static func inflate(
    _ data: Data, range: Range<Int>, expectedSize: Int, to fileURL: URL
  ) throws {
    FileManager.default.createFile(atPath: fileURL.path, contents: nil)
    let handle = try FileHandle(forWritingTo: fileURL)
    defer { try? handle.close() }
    if expectedSize == 0 { return }

    var stream = compression_stream(
      dst_ptr: UnsafeMutablePointer<UInt8>(bitPattern: 1)!,
      dst_size: 0,
      src_ptr: UnsafePointer<UInt8>(bitPattern: 1)!,
      src_size: 0,
      state: nil
    )
    guard
      compression_stream_init(&stream, COMPRESSION_STREAM_DECODE, COMPRESSION_ZLIB)
        == COMPRESSION_STATUS_OK
    else { throw ZipError.corrupt("inflate init") }
    defer { compression_stream_destroy(&stream) }

    let dst = UnsafeMutablePointer<UInt8>.allocate(capacity: chunkSize)
    defer { dst.deallocate() }

    var total = 0
    try data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
      let base = raw.bindMemory(to: UInt8.self).baseAddress!
      stream.src_ptr = base + range.lowerBound
      stream.src_size = range.count
      var status = COMPRESSION_STATUS_OK
      repeat {
        stream.dst_ptr = dst
        stream.dst_size = chunkSize
        status = compression_stream_process(
          &stream, Int32(COMPRESSION_STREAM_FINALIZE.rawValue)
        )
        switch status {
        case COMPRESSION_STATUS_OK, COMPRESSION_STATUS_END:
          let produced = chunkSize - stream.dst_size
          if produced > 0 {
            try handle.write(contentsOf: Data(bytes: dst, count: produced))
            total += produced
          }
        default:
          throw ZipError.corrupt("inflate status \(status.rawValue)")
        }
      } while status == COMPRESSION_STATUS_OK
    }
    guard total == expectedSize else {
      throw ZipError.corrupt("inflate produced \(total)/\(expectedSize) bytes")
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
