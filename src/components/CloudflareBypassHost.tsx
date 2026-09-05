import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import CookieManager, {
  type Cookie,
} from '@preeternal/react-native-cookie-manager';

import { getUserAgent } from '@hooks/persisted/useUserAgent';

/**
 * A headless (zero-size, never shown) WebView host mounted once near the
 * app root — no existing precedent in this codebase, every other
 * `react-native-webview` usage renders visible UI. Two things need a real
 * WebView to execute JS in a real browser context, neither of which is
 * "show the user a webpage":
 *
 * 1. Solving a Cloudflare JS challenge transparently (see
 *    `helpers/cloudflareBypass.ts`'s `resolveCloudflareCookies`, called
 *    from the low-level fetch layers when a response looks blocked).
 * 2. `PBApplication.executeInWebView` — confirmed real, source-initiated
 *    API (a real downloaded bundle, Inkdex's AllManga, calls this
 *    directly as part of its own chapter-fetch logic, not as a
 *    Cloudflare-specific mechanism) — see `helpers/paperbackApplication.ts`.
 *
 * Both funnel through the same one-task-at-a-time queue below, since a
 * plain async helper can't drive a WebView on its own — it has to be a
 * mounted component, and other code needs to call it imperatively from
 * contexts (plugin adapters) that aren't React components themselves.
 */

interface NavigateTask {
  kind: 'navigate';
  id: number;
  url: string;
  resolve: (cookies: Cookie[]) => void;
  reject: (err: Error) => void;
}

interface ExecuteTask {
  kind: 'execute';
  id: number;
  html: string;
  baseUrl?: string;
  cookies?: Cookie[];
  inject: string;
  resolve: (result: { result: unknown; cookies: Cookie[] }) => void;
  reject: (err: Error) => void;
}

type Task = NavigateTask | ExecuteTask;

const TIMEOUT_MS = 15_000;

// A Cloudflare "Just a moment..." interstitial replaces its own title and
// removes its own challenge markup once solved — polling for that from
// inside the page is far more reliable than counting WebView load events,
// since real challenge pages resolve via a mix of meta-refresh/JS
// navigation that doesn't fire a clean, single, countable "done" event.
const CHALLENGE_POLL_SCRIPT = `
(function() {
  var tries = 0;
  var interval = setInterval(function() {
    tries++;
    var stillChallenged =
      document.title.indexOf('Just a moment') !== -1 ||
      !!document.querySelector('#challenge-form, #cf-challenge-running');
    if (!stillChallenged) {
      clearInterval(interval);
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'cleared' }));
    } else if (tries > 60) {
      clearInterval(interval);
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'timeout' }));
    }
  }, 250);
})();
true;
`;

const executeInjectScript = (inject: string) => `
(function() {
  try {
    var result = (function() { ${inject} })();
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'result', result: result }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(e) }));
  }
})();
true;
`;

let enqueue: ((task: Task) => void) | undefined;
let nextTaskId = 0;

const cookiesToArray = (cookies: Record<string, Cookie>): Cookie[] =>
  Object.values(cookies);

/** Solves a Cloudflare challenge at `url` by loading it in the headless WebView and waiting for the challenge markers to clear, then returns the resulting cookies. */
export const requestCloudflareBypass = (url: string): Promise<Cookie[]> =>
  new Promise((resolve, reject) => {
    if (!enqueue) {
      reject(new Error('CloudflareBypassHost is not mounted'));
      return;
    }
    enqueue({ kind: 'navigate', id: nextTaskId++, url, resolve, reject });
  });

/** Real implementation target for `PBApplication.executeInWebView` — loads `html`/`baseUrl` with `cookies` pre-set, runs `inject`, returns its result plus any cookies the page set. */
export const requestWebViewExecution = (params: {
  html: string;
  baseUrl?: string;
  cookies?: Cookie[];
  inject: string;
}): Promise<{ result: unknown; cookies: Cookie[] }> =>
  new Promise((resolve, reject) => {
    if (!enqueue) {
      reject(new Error('CloudflareBypassHost is not mounted'));
      return;
    }
    enqueue({ kind: 'execute', id: nextTaskId++, ...params, resolve, reject });
  });

const CloudflareBypassHost = () => {
  const [queue, setQueue] = useState<Task[]>([]);
  const currentTask = queue[0];
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const settledRef = useRef(false);

  useEffect(() => {
    enqueue = task => setQueue(prev => [...prev, task]);
    return () => {
      enqueue = undefined;
    };
  }, []);

  const finish = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setQueue(prev => prev.slice(1));
  }, []);

  useEffect(() => {
    if (!currentTask) return;
    settledRef.current = false;
    timeoutRef.current = setTimeout(() => {
      if (settledRef.current) return;
      settledRef.current = true;
      currentTask.reject(new Error('WebView task timed out'));
      finish();
    }, TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTask?.id]);

  const settle = useCallback(
    (run: () => void) => {
      if (settledRef.current) return;
      settledRef.current = true;
      run();
      finish();
    },
    [finish],
  );

  const handleNavigateMessage = useCallback(
    async (task: NavigateTask, event: WebViewMessageEvent) => {
      const data = JSON.parse(event.nativeEvent.data) as { type: string };
      if (data.type !== 'cleared' && data.type !== 'timeout') return;
      try {
        const cookies = await CookieManager.get(task.url, true);
        const list = cookiesToArray(cookies);
        // Android shares one cookie store between the WebView and native
        // fetch already; iOS keeps WKWebView's cookies separate from
        // NSHTTPCookieStorage (what native fetch reads), so they must be
        // copied across explicitly there too.
        await Promise.all(
          list.map(cookie => CookieManager.set(task.url, cookie)),
        );
        settle(() => task.resolve(list));
      } catch (err) {
        settle(() =>
          task.reject(err instanceof Error ? err : new Error(String(err))),
        );
      }
    },
    [settle],
  );

  const handleExecuteMessage = useCallback(
    async (task: ExecuteTask, event: WebViewMessageEvent) => {
      const data = JSON.parse(event.nativeEvent.data) as {
        type: string;
        result?: unknown;
        message?: string;
      };
      if (data.type === 'error') {
        settle(() => task.reject(new Error(data.message ?? 'Script error')));
        return;
      }
      if (data.type !== 'result') return;
      try {
        const url = task.baseUrl ?? '';
        const cookies = url
          ? cookiesToArray(await CookieManager.get(url, true))
          : [];
        settle(() => task.resolve({ result: data.result, cookies }));
      } catch {
        settle(() => task.resolve({ result: data.result, cookies: [] }));
      }
    },
    [settle],
  );

  if (!currentTask) return null;

  const userAgent = getUserAgent();

  if (currentTask.kind === 'navigate') {
    return (
      <View style={styles.hidden} pointerEvents="none">
        <WebView
          source={{ uri: currentTask.url }}
          userAgent={userAgent}
          injectedJavaScript={CHALLENGE_POLL_SCRIPT}
          onMessage={event => handleNavigateMessage(currentTask, event)}
          onError={() =>
            settle(() =>
              currentTask.reject(new Error('Failed to load challenge page')),
            )
          }
        />
      </View>
    );
  }

  return (
    <CloudflareExecuteWebView
      task={currentTask}
      userAgent={userAgent}
      onMessage={event => handleExecuteMessage(currentTask, event)}
      onError={() =>
        settle(() => currentTask.reject(new Error('Failed to load page')))
      }
    />
  );
};

/** Split out so cookies can be pre-set (async) before the WebView itself mounts with a matching `source`. */
const CloudflareExecuteWebView = ({
  task,
  userAgent,
  onMessage,
  onError,
}: {
  task: ExecuteTask;
  userAgent: string;
  onMessage: (event: WebViewMessageEvent) => void;
  onError: () => void;
}) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (task.baseUrl && task.cookies?.length) {
        await Promise.all(
          task.cookies.map(cookie => CookieManager.set(task.baseUrl!, cookie)),
        );
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  if (!ready) return null;

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        source={{ html: task.html, baseUrl: task.baseUrl }}
        userAgent={userAgent}
        injectedJavaScript={executeInjectScript(task.inject)}
        onMessage={onMessage}
        onError={onError}
      />
    </View>
  );
};

export default CloudflareBypassHost;

const styles = {
  hidden: {
    position: 'absolute' as const,
    width: 0,
    height: 0,
    overflow: 'hidden' as const,
  },
};
