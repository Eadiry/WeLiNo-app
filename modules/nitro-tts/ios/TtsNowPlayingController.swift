import MediaPlayer

final class TtsNowPlayingController {
  func update(
    metadata: TtsMetadata?,
    state: TtsPlaybackState,
    progress: TtsProgress?
  ) {
    guard let metadata else {
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
      return
    }

    var nowPlayingInfo: [String: Any] = [
      MPMediaItemPropertyTitle: metadata.chapterName,
      MPMediaItemPropertyArtist: metadata.novelName,
      MPNowPlayingInfoPropertyPlaybackRate: state == .playing ? 1.0 : 0.0,
    ]
    if let progress, progress.total > 0 {
      let total = Int(progress.total)
      let current = min(max(Int(progress.index), 0), total - 1) + 1
      nowPlayingInfo[MPMediaItemPropertyAlbumTitle] =
        "Paragraph \(current) of \(total)"
    }

    let center = MPNowPlayingInfoCenter.default()
    center.nowPlayingInfo = nowPlayingInfo
    // iOS 13+ Control Center tracks this, not just the playback rate — without
    // it the widget shows the wrong play/pause state and can look unresponsive.
    switch state {
    case .playing:
      center.playbackState = .playing
    case .paused:
      center.playbackState = .paused
    default:
      center.playbackState = .stopped
    }
  }

  func clear() {
    let center = MPNowPlayingInfoCenter.default()
    center.nowPlayingInfo = nil
    center.playbackState = .stopped
  }
}
