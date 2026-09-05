import { gcm } from '@noble/ciphers/aes.js';
import { utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils.js';
import dayjs from 'dayjs';
import { load } from 'cheerio';
import { Parser } from 'htmlparser2';
import reverse from 'lodash-es/reverse';
import uniqBy from 'lodash-es/uniqBy';
import { encode, decode } from 'urlencode';

import { getEnabledMangaRepositoriesFromDb } from '@database/queries/MangaRepositoryQueries';
import { newer } from '@utils/compareVersion';
import NativeFile from '@modules/native-file';
import { showToast } from '@utils/showToast';
import { MANGA_PLUGIN_STORAGE } from '@utils/Storages';
import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';

import { store } from './helpers/storage';
import { MangaStatus, type MangaPlugin } from './types/manga';
import type { PluginItem } from './types';
import { defaultCover } from './helpers/constants';
import { downloadFile, fetchApi, fetchProto, fetchText } from './helpers/fetch';
import { FilterTypes } from './types/filterTypes';
import { isUrlAbsolute } from './helpers/isAbsoluteUrl';
import {
  applyDefaultImageHeaders,
  createSandbox,
} from './helpers/createSandbox';
import {
  fetchPaperbackRepositoryPlugins,
  loadPaperbackPlugin,
} from './paperbackAdapter';
import { templates, type TemplateConfig } from './templates';

/**
 * Manga's own plugin manager — parallel to `pluginManager.ts`, not sharing
 * its installed-plugin registry (a manga plugin and a novel plugin can
 * legitimately share an `id` without colliding, since they're never mixed
 * into the same list). Only the sandbox execution model and low-level
 * network/file helpers are shared; see `helpers/createSandbox.ts`.
 *
 * Two repository-sourced plugin *formats* live side by side, tagged per
 * `MangaRepository.format` and carried through as `MangaPluginItem.format`
 * so a cold-started app can tell which loader an already-installed plugin
 * needs without re-fetching its repository: `native` (our own sandbox,
 * `helpers/createSandbox.ts`) and `paperback` (a compiled Paperback/Inkdex
 * bundle, `paperbackAdapter.ts`).
 *
 * A third kind, *template* plugins (`./templates/`), isn't repository-sourced
 * at all — there's no bundle to download, just a small `{ templateId, config }`
 * pair the matching template's `create()` turns back into a `MangaPlugin` on
 * demand. See `installTemplateMangaPlugin` below.
 */

export interface MangaPluginItem extends PluginItem {
  format?: 'native' | 'paperback';
}

const packages: Record<string, any> = {
  'htmlparser2': { Parser },
  'cheerio': { load },
  'dayjs': dayjs,
  'urlencode': { encode, decode },
  '@libs/mangaStatus': { MangaStatus },
  '@libs/fetch': { fetchApi, fetchText, fetchProto },
  '@libs/isAbsoluteUrl': { isUrlAbsolute },
  '@libs/filterInputs': { FilterTypes },
  '@libs/defaultCover': { defaultCover },
  '@libs/aes': { gcm },
  '@libs/utils': { utf8ToBytes, bytesToUtf8 },
};

const initFromSandbox = createSandbox<MangaPlugin>(packages);

const initPlugin = (
  metadata: Pick<
    MangaPluginItem,
    'id' | 'name' | 'site' | 'lang' | 'version' | 'url' | 'iconUrl' | 'format'
  >,
  rawCode: string,
) => {
  const plugin =
    metadata.format === 'paperback'
      ? loadPaperbackPlugin(metadata.id, rawCode)
      : initFromSandbox(metadata.id, rawCode);
  if (!plugin) {
    return undefined;
  }
  applyDefaultImageHeaders(plugin);
  // A Paperback bundle has no way to know its own display name/version/icon
  // — that only ever exists in the repository's versioning.json, known here
  // at install/reload time — so wrapPaperbackExtension/wrapLegacySource
  // return placeholders (blank icon, version '0.0.0', name === id).
  // Confirmed real bug: every installed Paperback source showed a blank
  // icon and its raw id as its name in the Sources tab, and reinstalling
  // one to pick up an update never did anything (comparing '0.0.0' against
  // '0.0.0' never counts as newer). Overlay the real metadata every time.
  if (metadata.format === 'paperback') {
    plugin.name = metadata.name;
    plugin.site = metadata.site;
    plugin.lang = metadata.lang;
    plugin.version = metadata.version;
    plugin.url = metadata.url;
    plugin.iconUrl = metadata.iconUrl;
  }
  return plugin;
};

const plugins: Record<string, MangaPlugin | undefined> = {};
export const INSTALLED_MANGA_PLUGINS_KEY = 'INSTALL_MANGA_PLUGINS';

interface FetchedCode {
  code: string;
  status: number;
  ok: boolean;
}

const fetchPluginCode = async (url: string): Promise<FetchedCode> => {
  const res = await fetch(url, {
    headers: { 'pragma': 'no-cache', 'cache-control': 'no-cache' },
  });
  const code = await res.text();
  return { code, status: res.status, ok: res.ok };
};

const installMangaPlugin = async (
  _plugin: MangaPluginItem,
): Promise<MangaPlugin | undefined> => {
  const attempts: FetchedCode[] = [];
  let fetched = await fetchPluginCode(_plugin.url);
  attempts.push(fetched);
  let plugin = initPlugin(_plugin, fetched.code);
  // Paperback's older (0.8) bundle generation is served as `source.js`, not
  // `index.js` — fetchPaperbackRepositoryPlugins always assumes the latter
  // (correct for the main Inkdex registry and the even-older v1 generation,
  // both confirmed to use `index.js` too), so a 0.8 repo's first fetch here
  // is that repo's own 404 page, not code. Retry once with the other
  // filename before giving up — cheap, and avoids needing a third
  // repository format just for a filename difference.
  if (
    !plugin &&
    _plugin.format === 'paperback' &&
    _plugin.url.endsWith('index.js')
  ) {
    const altUrl = _plugin.url.replace(/index\.js$/, 'source.js');
    fetched = await fetchPluginCode(altUrl);
    attempts.push(fetched);
    plugin = initPlugin(_plugin, fetched.code);
  }
  if (!plugin) {
    // Confirmed real gap: this used to return undefined silently, and the
    // UI's only fallback was a generic "Could not install X" toast with no
    // diagnostic content — every real bundle this adapter has been tested
    // against (across multiple rounds, direct-content tests) loads
    // successfully, so a real user-reported failure here almost certainly
    // has a network-layer cause (a non-200 response, an empty/truncated
    // body, a captive-portal or CDN error page) rather than a parsing bug
    // — but there was no way to tell which without this. Throwing with the
    // actual HTTP status and response shape turns the next occurrence into
    // something diagnosable from the toast alone instead of another
    // unreproducible "it doesn't work" report.
    const details = attempts
      .map(
        a =>
          `status ${a.status}${a.ok ? '' : ' (not ok)'}, ${
            a.code.length
          } bytes` +
          (a.code.trim() ? `, starts with: ${a.code.slice(0, 60).trim()}` : ''),
      )
      .join('; then ');
    throw new Error(`Could not load a recognizable plugin bundle (${details})`);
  }
  let currentPlugin = plugins[plugin.id];
  if (!currentPlugin || newer(plugin.version, currentPlugin.version)) {
    const pluginDir = `${MANGA_PLUGIN_STORAGE}/${plugin.id}`;
    await NativeFile.mkdir(pluginDir);
    const pluginPath = pluginDir + '/index.js';
    const customJSPath = pluginDir + '/custom.js';
    const customCSSPath = pluginDir + '/custom.css';
    if (_plugin.customJS) {
      await downloadFile(_plugin.customJS, customJSPath);
    } else if (await NativeFile.exists(customJSPath)) {
      await NativeFile.unlink(customJSPath);
    }
    if (_plugin.customCSS) {
      await downloadFile(_plugin.customCSS, customCSSPath);
    } else if (await NativeFile.exists(customCSSPath)) {
      await NativeFile.unlink(customCSSPath);
    }
    await NativeFile.writeFile(pluginPath, fetched.code);
    plugins[plugin.id] = plugin;
    currentPlugin = plugin;
  }
  // The novel side does this in a *hook* (usePlugins.ts's installPlugin
  // wraps pluginManager.ts's and separately setMMKVObjects the installed
  // list) rather than in pluginManager.ts itself. Manga's Browse UI calls
  // this function directly with no equivalent hook layer, so that step
  // never happened anywhere for manga — confirmed real bug: installed
  // plugins vanished on app restart (the .js bundle was still on disk, but
  // nothing recorded that it should be reloaded). Doing it here instead of
  // introducing a hook is more robust anyway: it can't be skipped by a
  // caller forgetting to also update the registry.
  const installedPlugins =
    getMMKVObject<MangaPluginItem[]>(INSTALLED_MANGA_PLUGINS_KEY) || [];
  setMMKVObject(INSTALLED_MANGA_PLUGINS_KEY, [
    ...installedPlugins.filter(p => p.id !== _plugin.id),
    _plugin,
  ]);
  return currentPlugin;
};

const uninstallMangaPlugin = async (_plugin: PluginItem) => {
  plugins[_plugin.id] = undefined;
  store.getAllKeys().forEach(key => {
    if (key.startsWith(_plugin.id)) {
      store.remove(key);
    }
  });
  const pluginFilePath = `${MANGA_PLUGIN_STORAGE}/${_plugin.id}/index.js`;
  if (await NativeFile.exists(pluginFilePath)) {
    await NativeFile.unlink(pluginFilePath);
  }
  const installedPlugins =
    getMMKVObject<MangaPluginItem[]>(INSTALLED_MANGA_PLUGINS_KEY) || [];
  setMMKVObject(
    INSTALLED_MANGA_PLUGINS_KEY,
    installedPlugins.filter(p => p.id !== _plugin.id),
  );
};

interface InstalledTemplatePlugin {
  id: string;
  templateId: string;
  config: TemplateConfig;
}

export const INSTALLED_MANGA_TEMPLATE_PLUGINS_KEY =
  'INSTALL_MANGA_TEMPLATE_PLUGINS';

/** Registers an already-built `MangaPlugin` directly — the one hook template plugins (and nothing else) need into the shared in-memory registry. */
const registerMangaPlugin = (plugin: MangaPlugin) => {
  plugins[plugin.id] = plugin;
};

const createFromTemplate = (
  templateId: string,
  config: TemplateConfig,
): MangaPlugin | undefined => {
  const template = templates.find(t => t.id === templateId);
  if (!template) {
    return undefined;
  }
  const plugin = template.create(config);
  applyDefaultImageHeaders(plugin);
  return plugin;
};

/** Installs a CMS-template-generated plugin (see `./templates/`) — no bundle to download, just persists `{ id, templateId, config }` and reconstructs on reload. */
const installTemplateMangaPlugin = (
  templateId: string,
  config: TemplateConfig,
): MangaPlugin | undefined => {
  const plugin = createFromTemplate(templateId, config);
  if (!plugin) {
    return undefined;
  }
  registerMangaPlugin(plugin);
  const installed =
    getMMKVObject<InstalledTemplatePlugin[]>(
      INSTALLED_MANGA_TEMPLATE_PLUGINS_KEY,
    ) || [];
  setMMKVObject(INSTALLED_MANGA_TEMPLATE_PLUGINS_KEY, [
    ...installed.filter(p => p.id !== plugin.id),
    { id: plugin.id, templateId, config },
  ]);
  return plugin;
};

const uninstallTemplateMangaPlugin = (id: string) => {
  plugins[id] = undefined;
  const installed =
    getMMKVObject<InstalledTemplatePlugin[]>(
      INSTALLED_MANGA_TEMPLATE_PLUGINS_KEY,
    ) || [];
  setMMKVObject(
    INSTALLED_MANGA_TEMPLATE_PLUGINS_KEY,
    installed.filter(p => p.id !== id),
  );
};

const updateMangaPlugin = async (plugin: MangaPluginItem) => {
  return installMangaPlugin(plugin);
};

const fetchMangaPlugins = async (): Promise<MangaPluginItem[]> => {
  const allPlugins: MangaPluginItem[] = [];
  const allRepositories = await getEnabledMangaRepositoriesFromDb();

  const repoPluginsRes = await Promise.allSettled(
    allRepositories.map(async ({ url, format }) => {
      const items =
        format === 'paperback'
          ? await fetchPaperbackRepositoryPlugins(url)
          : ((await fetch(url).then(res => res.json())) as PluginItem[]);
      return items.map<MangaPluginItem>(item => ({ ...item, format }));
    }),
  );

  repoPluginsRes.forEach(repoPlugins => {
    if (repoPlugins.status === 'fulfilled') {
      allPlugins.push(...repoPlugins.value);
    } else {
      showToast(repoPlugins.reason.toString());
    }
  });

  return uniqBy(reverse(allPlugins), 'id');
};

const getMangaPlugin = (pluginId: string) => plugins[pluginId];

/** Every currently-loaded manga plugin, of any format — the "Sources" tab's data source. */
const getInstalledMangaPlugins = (): MangaPlugin[] =>
  Object.values(plugins).filter((p): p is MangaPlugin => !!p);

const loadMangaPlugin = async (metadata: MangaPluginItem) => {
  if (plugins[metadata.id]) {
    return plugins[metadata.id];
  }

  const filePath = `${MANGA_PLUGIN_STORAGE}/${metadata.id}/index.js`;
  try {
    const code = await NativeFile.readFile(filePath);
    const plugin = initPlugin(metadata, code);
    plugins[metadata.id] = plugin;
    return plugin;
  } catch {
    return undefined;
  }
};

const initializeInstalledTemplateMangaPlugins = () => {
  const installedTemplatePlugins =
    getMMKVObject<InstalledTemplatePlugin[]>(
      INSTALLED_MANGA_TEMPLATE_PLUGINS_KEY,
    ) || [];
  installedTemplatePlugins.forEach(({ templateId, config }) => {
    const plugin = createFromTemplate(templateId, config);
    if (plugin) {
      registerMangaPlugin(plugin);
    }
  });
};

const initializeInstalledMangaPlugins = async () => {
  const installedPlugins =
    getMMKVObject<MangaPluginItem[]>(INSTALLED_MANGA_PLUGINS_KEY) || [];
  await Promise.allSettled(
    installedPlugins.map(async plugin => {
      const installedPlugin = await loadMangaPlugin(plugin);
      if (!installedPlugin) {
        await installMangaPlugin(plugin);
      }
    }),
  );
  initializeInstalledTemplateMangaPlugins();
};

const reloadInstalledMangaPlugins = async (): Promise<string[]> => {
  const installedPlugins =
    getMMKVObject<MangaPluginItem[]>(INSTALLED_MANGA_PLUGINS_KEY) || [];

  Object.keys(plugins).forEach(pluginId => {
    plugins[pluginId] = undefined;
  });

  const results = await Promise.all(
    installedPlugins.map(async plugin => ({
      plugin,
      source: await loadMangaPlugin(plugin),
    })),
  );
  const restoredPlugins = results
    .filter(result => result.source)
    .map(result => result.plugin);

  setMMKVObject(INSTALLED_MANGA_PLUGINS_KEY, restoredPlugins);

  initializeInstalledTemplateMangaPlugins();

  return results
    .filter(result => !result.source)
    .map(result => result.plugin.id);
};

export {
  getMangaPlugin,
  getInstalledMangaPlugins,
  loadMangaPlugin,
  initializeInstalledMangaPlugins,
  reloadInstalledMangaPlugins,
  installMangaPlugin,
  uninstallMangaPlugin,
  updateMangaPlugin,
  fetchMangaPlugins,
  registerMangaPlugin,
  installTemplateMangaPlugin,
  uninstallTemplateMangaPlugin,
};
