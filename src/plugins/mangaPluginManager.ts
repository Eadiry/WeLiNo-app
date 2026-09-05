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

/**
 * Manga's own plugin manager — parallel to `pluginManager.ts`, not sharing
 * its installed-plugin registry (a manga plugin and a novel plugin can
 * legitimately share an `id` without colliding, since they're never mixed
 * into the same list). Only the sandbox execution model and low-level
 * network/file helpers are shared; see `helpers/createSandbox.ts`.
 */

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

const initPlugin = (pluginId: string, rawCode: string) => {
  const plugin = initFromSandbox(pluginId, rawCode);
  if (!plugin) {
    return undefined;
  }
  applyDefaultImageHeaders(plugin);
  return plugin;
};

const plugins: Record<string, MangaPlugin | undefined> = {};
export const INSTALLED_MANGA_PLUGINS_KEY = 'INSTALL_MANGA_PLUGINS';

const installMangaPlugin = async (
  _plugin: PluginItem,
): Promise<MangaPlugin | undefined> => {
  const rawCode = await fetch(_plugin.url, {
    headers: { 'pragma': 'no-cache', 'cache-control': 'no-cache' },
  }).then(res => res.text());
  const plugin = initPlugin(_plugin.id, rawCode);
  if (!plugin) {
    return undefined;
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
    await NativeFile.writeFile(pluginPath, rawCode);
    plugins[plugin.id] = plugin;
    currentPlugin = plugin;
  }
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
};

const updateMangaPlugin = async (plugin: PluginItem) => {
  return installMangaPlugin(plugin);
};

const fetchMangaPlugins = async (): Promise<PluginItem[]> => {
  const allPlugins: PluginItem[] = [];
  const allRepositories = await getEnabledMangaRepositoriesFromDb();

  const repoPluginsRes = await Promise.allSettled(
    allRepositories.map(({ url }) => fetch(url).then(res => res.json())),
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

const loadMangaPlugin = async (pluginId: string) => {
  if (plugins[pluginId]) {
    return plugins[pluginId];
  }

  const filePath = `${MANGA_PLUGIN_STORAGE}/${pluginId}/index.js`;
  try {
    const code = await NativeFile.readFile(filePath);
    const plugin = initPlugin(pluginId, code);
    plugins[pluginId] = plugin;
    return plugin;
  } catch {
    return undefined;
  }
};

const initializeInstalledMangaPlugins = async () => {
  const installedPlugins =
    getMMKVObject<PluginItem[]>(INSTALLED_MANGA_PLUGINS_KEY) || [];
  await Promise.allSettled(
    installedPlugins.map(async plugin => {
      const installedPlugin = await loadMangaPlugin(plugin.id);
      if (!installedPlugin) {
        await installMangaPlugin(plugin);
      }
    }),
  );
};

const reloadInstalledMangaPlugins = async (): Promise<string[]> => {
  const installedPlugins =
    getMMKVObject<PluginItem[]>(INSTALLED_MANGA_PLUGINS_KEY) || [];

  Object.keys(plugins).forEach(pluginId => {
    plugins[pluginId] = undefined;
  });

  const results = await Promise.all(
    installedPlugins.map(async plugin => ({
      plugin,
      source: await loadMangaPlugin(plugin.id),
    })),
  );
  const restoredPlugins = results
    .filter(result => result.source)
    .map(result => result.plugin);

  setMMKVObject(INSTALLED_MANGA_PLUGINS_KEY, restoredPlugins);

  return results
    .filter(result => !result.source)
    .map(result => result.plugin.id);
};

export {
  getMangaPlugin,
  loadMangaPlugin,
  initializeInstalledMangaPlugins,
  reloadInstalledMangaPlugins,
  installMangaPlugin,
  uninstallMangaPlugin,
  updateMangaPlugin,
  fetchMangaPlugins,
};
