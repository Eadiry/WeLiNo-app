import {
  parseVoiceManifest,
  installEngine,
  isEngineInstalled,
  listInstalledKokoroVoices,
  engineDir,
  type VoiceManifestEngine,
} from '../voiceRepository';

jest.mock('@modules/native-file', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/doc',
    ExternalDirectoryPath: '/ext',
    exists: jest.fn(),
    mkdir: jest.fn(async () => undefined),
    unlink: jest.fn(async () => undefined),
  },
}));

jest.mock('@modules/native-zip-archive', () => ({
  __esModule: true,
  default: { unzip: jest.fn(async () => undefined) },
}));

jest.mock('@plugins/helpers/fetch', () => ({
  downloadFile: jest.fn(async () => undefined),
}));

jest.mock('@database/queries/VoiceRepositoryQueries', () => ({
  getEnabledVoiceRepositoriesFromDb: jest.fn(async () => []),
}));

const NativeFile = require('@modules/native-file').default as {
  exists: jest.Mock;
  mkdir: jest.Mock;
  unlink: jest.Mock;
};
const NativeZipArchive = require('@modules/native-zip-archive').default as {
  unzip: jest.Mock;
};
const { downloadFile } = require('@plugins/helpers/fetch') as {
  downloadFile: jest.Mock;
};
const { getEnabledVoiceRepositoriesFromDb } =
  require('@database/queries/VoiceRepositoryQueries') as {
    getEnabledVoiceRepositoriesFromDb: jest.Mock;
  };

const engine: VoiceManifestEngine = {
  id: 'kokoro-v1',
  name: 'Kokoro 82M',
  format: 'sherpa-onnx-kokoro',
  files: [
    {
      path: 'model.onnx',
      url: 'https://cdn.example.com/model.onnx',
      bytes: 90,
    },
    { path: 'tokens.txt', url: 'https://cdn.example.com/tokens.txt', bytes: 5 },
    { path: 'voices.bin', url: 'https://cdn.example.com/voices.bin', bytes: 5 },
    {
      path: 'espeak-ng-data',
      url: 'https://cdn.example.com/espeak-ng-data.zip',
      bytes: 8,
      unzip: true,
    },
  ],
};

const validManifest = {
  engine,
  voices: [
    { id: 'af_heart', name: 'Heart', language: 'en-US', speakerId: 0 },
    { id: 'am_adam', name: 'Adam', language: 'en-US', speakerId: 1 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('parseVoiceManifest', () => {
  it('accepts a well-formed manifest', () => {
    const parsed = parseVoiceManifest(validManifest);
    expect(parsed.engine.id).toBe('kokoro-v1');
    expect(parsed.voices).toHaveLength(2);
  });

  it.each([
    ['no engine', { voices: [] }],
    ['bad format', { engine: { ...engine, format: 'piper' }, voices: [] }],
    ['no files', { engine: { ...engine, files: [] }, voices: [] }],
    [
      'nested file path',
      {
        engine: {
          ...engine,
          files: [{ path: 'a/b.onnx', url: 'https://x/y' }],
        },
        voices: [],
      },
    ],
    [
      'non-http url',
      {
        engine: { ...engine, files: [{ path: 'm.onnx', url: 'ftp://x/y' }] },
        voices: [],
      },
    ],
    ['voice without speakerId', { engine, voices: [{ id: 'x', name: 'X' }] }],
  ])('rejects: %s', (_label, bad) => {
    expect(() => parseVoiceManifest(bad)).toThrow();
  });
});

describe('installEngine', () => {
  it('downloads every missing file, unzips archive entries and reports progress', async () => {
    NativeFile.exists.mockResolvedValue(false);
    const progress: number[] = [];

    await installEngine(engine, p => progress.push(p.fraction));

    expect(NativeFile.mkdir).toHaveBeenCalledWith(engineDir('kokoro-v1'));
    expect(downloadFile).toHaveBeenCalledWith(
      'https://cdn.example.com/model.onnx',
      '/doc/TTS/kokoro-v1/model.onnx',
    );
    // The zip entry is downloaded to a temp path, unzipped, then removed.
    expect(downloadFile).toHaveBeenCalledWith(
      'https://cdn.example.com/espeak-ng-data.zip',
      '/doc/TTS/kokoro-v1/espeak-ng-data.zip',
    );
    expect(NativeZipArchive.unzip).toHaveBeenCalledWith(
      '/doc/TTS/kokoro-v1/espeak-ng-data.zip',
      '/doc/TTS/kokoro-v1',
    );
    expect(NativeFile.unlink).toHaveBeenCalledWith(
      '/doc/TTS/kokoro-v1/espeak-ng-data.zip',
    );
    expect(progress[progress.length - 1]).toBeCloseTo(1);
  });

  it('skips files that already exist', async () => {
    NativeFile.exists.mockImplementation(async (path: string) =>
      path.endsWith('model.onnx'),
    );

    await installEngine(engine);

    expect(downloadFile).not.toHaveBeenCalledWith(
      'https://cdn.example.com/model.onnx',
      expect.anything(),
    );
    expect(downloadFile).toHaveBeenCalledWith(
      'https://cdn.example.com/tokens.txt',
      '/doc/TTS/kokoro-v1/tokens.txt',
    );
  });
});

describe('isEngineInstalled', () => {
  it('is true only when every declared file exists', async () => {
    NativeFile.exists.mockResolvedValue(true);
    expect(await isEngineInstalled(engine)).toBe(true);

    NativeFile.exists.mockImplementation(
      async (path: string) => !path.endsWith('voices.bin'),
    );
    expect(await isEngineInstalled(engine)).toBe(false);
  });
});

describe('listInstalledKokoroVoices', () => {
  it('returns voices only from repos whose engine is installed', async () => {
    getEnabledVoiceRepositoriesFromDb.mockResolvedValue([
      { id: 1, url: 'https://a/voices.json', enabled: true },
    ]);
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => validManifest,
    })) as unknown as typeof fetch;
    NativeFile.exists.mockResolvedValue(true);

    const voices = await listInstalledKokoroVoices();

    expect(voices.map(v => v.id)).toEqual(['af_heart', 'am_adam']);
    expect(voices[0].engineId).toBe('kokoro-v1');
  });

  it('drops repos whose engine is not fully installed', async () => {
    getEnabledVoiceRepositoriesFromDb.mockResolvedValue([
      { id: 1, url: 'https://a/voices.json', enabled: true },
    ]);
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => validManifest,
    })) as unknown as typeof fetch;
    NativeFile.exists.mockResolvedValue(false);

    expect(await listInstalledKokoroVoices()).toEqual([]);
  });
});
