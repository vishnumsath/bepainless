// Guarded service worker registration. Skips Lovable previews & iframes.
export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  const host = window.location.hostname;
  const inIframe = window.self !== window.top;
  const isPreview =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovableproject-dev.com") ||
    host.endsWith(".beta.lovable.dev") ||
    host === "localhost" ||
    host === "127.0.0.1";
  const killSwitch = new URLSearchParams(window.location.search).has("sw") &&
    new URLSearchParams(window.location.search).get("sw") === "off";

  if (inIframe || isPreview || killSwitch) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => {
        if (r.active?.scriptURL.endsWith("/sw.js")) r.unregister();
      });
    });
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  });
}

export async function swReady(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.ready; } catch { return null; }
}
