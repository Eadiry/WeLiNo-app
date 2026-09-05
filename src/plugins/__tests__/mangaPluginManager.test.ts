import NativeFile from '@modules/native-file';
import { getEnabledMangaRepositoriesFromDb } from '@database/queries/MangaRepositoryQueries';
import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';
import {
  fetchMangaPlugins,
  getMangaPlugin,
  initializeInstalledMangaPlugins,
  installMangaPlugin,
  installTemplateMangaPlugin,
  INSTALLED_MANGA_PLUGINS_KEY,
  INSTALLED_MANGA_TEMPLATE_PLUGINS_KEY,
  reloadInstalledMangaPlugins,
} from '../mangaPluginManager';
import type { PluginItem } from '../types';

// Mirrors pluginManager.test.ts — same sandbox/execution model
// (helpers/createSandbox.ts), different table/storage path, no legacy-bundle
// migration (mangaPluginManager has no equivalent — it's a fresh module).

jest.mock('@database/queries/MangaRepositoryQueries', () => ({
  getEnabledMangaRepositoriesFromDb: jest.fn().mockResolvedValue([]),
}));

jest.mock('@noble/ciphers/aes.js', () => ({
  gcm: jest.fn(),
}));

jest.mock('@noble/ciphers/utils.js', () => ({
  bytesToUtf8: jest.fn(),
  utf8ToBytes: jest.fn(),
}));

jest.mock('cheerio', () => ({
  load: jest.fn(),
}));

jest.mock('htmlparser2', () => ({
  Parser: jest.fn(),
}));

jest.mock('@hooks/persisted/useUserAgent', () => ({
  getUserAgent: () => 'LNReader test',
}));

jest.mock('@utils/mmkv/mmkv', () => ({
  getMMKVObject: jest.fn(),
  setMMKVObject: jest.fn(),
}));

const restoredPlugins = [
  { id: 'restored', name: 'Restored manga plugin' },
  { id: 'invalid', name: 'Invalid manga plugin' },
] as PluginItem[];

const pluginCode = (id: string) => `exports.default = {
  id: '${id}',
  name: '${id}',
  version: '1.0.0',
  site: 'https://example.com'
};`;

describe('fetchMangaPlugins', () => {
  it('fetches only the repositories selected by the enabled-repository query', async () => {
    const repositoryUrl = 'https://example.com/manga-index.json';
    const plugin = {
      id: 'available',
      name: 'Available manga plugin',
    } as PluginItem;
    jest
      .mocked(getEnabledMangaRepositoriesFromDb)
      .mockResolvedValueOnce([
        { id: 1, url: repositoryUrl, enabled: true, format: 'native' },
      ]);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => [plugin],
    } as Response);

    await expect(fetchMangaPlugins()).resolves.toEqual([
      { ...plugin, format: 'native' },
    ]);

    expect(getEnabledMangaRepositoriesFromDb).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(repositoryUrl);
    fetchSpy.mockRestore();
  });
});

describe('reloadInstalledMangaPlugins', () => {
  it('loads restored bundles and removes registry entries that cannot load', async () => {
    jest.mocked(getMMKVObject).mockReturnValueOnce(restoredPlugins);
    jest.mocked(NativeFile.readFile).mockImplementation(async path => {
      if (path.endsWith('/restored/index.js')) {
        return pluginCode('restored');
      }
      throw new Error('Missing plugin bundle');
    });

    await expect(reloadInstalledMangaPlugins()).resolves.toEqual(['invalid']);

    expect(getMangaPlugin('restored')).toMatchObject({
      id: 'restored',
      version: '1.0.0',
    });
    expect(getMangaPlugin('invalid')).toBeUndefined();
    expect(setMMKVObject).toHaveBeenCalledWith(INSTALLED_MANGA_PLUGINS_KEY, [
      restoredPlugins[0],
    ]);
  });
});

describe('initializeInstalledMangaPlugins', () => {
  it('downloads a replacement when the installed bundle is missing', async () => {
    const plugin = {
      id: 'missing',
      name: 'Missing manga plugin',
      url: 'https://example.com/missing.js',
    } as PluginItem;
    jest.mocked(getMMKVObject).mockReturnValueOnce([plugin]);
    jest
      .mocked(NativeFile.readFile)
      .mockRejectedValue(new Error('Missing plugin bundle'));
    jest.spyOn(global, 'fetch').mockResolvedValue({
      text: async () => pluginCode('missing'),
    } as Response);

    await initializeInstalledMangaPlugins();

    expect(NativeFile.writeFile).toHaveBeenCalledWith(
      '/mock/documents/MangaPlugins/missing/index.js',
      pluginCode('missing'),
    );
    expect(getMangaPlugin('missing')).toMatchObject({ id: 'missing' });
  });
});

describe('installTemplateMangaPlugin', () => {
  it('registers a CMS-template plugin and persists it for reload, with no bundle to download', async () => {
    const config = {
      id: 'example.com',
      name: 'example.com',
      baseUrl: 'https://example.com',
      lang: 'en',
    };

    const plugin = installTemplateMangaPlugin('madara', config);

    expect(plugin).toMatchObject({ id: 'example.com' });
    expect(getMangaPlugin('example.com')).toBe(plugin);
    expect(setMMKVObject).toHaveBeenCalledWith(
      INSTALLED_MANGA_TEMPLATE_PLUGINS_KEY,
      [{ id: 'example.com', templateId: 'madara', config }],
    );

    // Reload should reconstruct it from the persisted { templateId, config }
    // pair rather than losing it.
    jest.mocked(getMMKVObject).mockImplementation(key => {
      if (key === INSTALLED_MANGA_TEMPLATE_PLUGINS_KEY) {
        return [{ id: 'example.com', templateId: 'madara', config }] as never;
      }
      return undefined;
    });

    await reloadInstalledMangaPlugins();

    expect(getMangaPlugin('example.com')).toMatchObject({ id: 'example.com' });
  });

  it('returns undefined for an unknown template id', () => {
    expect(
      installTemplateMangaPlugin('not-a-real-template', {
        id: 'x',
        name: 'x',
        baseUrl: 'https://example.com',
        lang: 'en',
      }),
    ).toBeUndefined();
  });
});

describe('installMangaPlugin', () => {
  it('does not register a plugin when its bundle cannot be persisted', async () => {
    const plugin = {
      id: 'write-failure',
      name: 'Write failure',
      url: 'https://example.com/write-failure.js',
    } as PluginItem;
    jest.spyOn(global, 'fetch').mockResolvedValue({
      text: async () => pluginCode('write-failure'),
    } as Response);
    jest
      .mocked(NativeFile.mkdir)
      .mockRejectedValueOnce(new Error('Directory could not be created'));

    await expect(installMangaPlugin(plugin)).rejects.toThrow(
      'Directory could not be created',
    );
    expect(getMangaPlugin('write-failure')).toBeUndefined();
  });
});
