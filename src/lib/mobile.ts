import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://pteninja.com';

/**
 * Checks if the application is running inside a native mobile container (Android/iOS).
 */
export const isNativeMobile = (): boolean => {
  return Capacitor.isNativePlatform();
};

/**
 * Resolves an API path to an absolute production endpoint when on native mobile,
 * or keeps it relative when on web.
 */
export const resolveApiUrl = (input: RequestInfo | URL): RequestInfo | URL => {
  if (!isNativeMobile()) {
    return input;
  }

  if (typeof input === 'string') {
    if (input.startsWith('/api/')) {
      return `${API_BASE_URL}${input}`;
    }
  } else if (input instanceof URL) {
    if (input.pathname.startsWith('/api/') && (input.hostname === 'localhost' || input.hostname === '127.0.0.1')) {
      return new URL(`${API_BASE_URL}${input.pathname}${input.search}`);
    }
  } else if (typeof Request !== 'undefined' && input instanceof Request) {
    const url = input.url;
    if (url.includes('/api/')) {
      const parsed = new URL(url);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return new Request(`${API_BASE_URL}${parsed.pathname}${parsed.search}`, input);
      }
    }
  }

  return input;
};

/**
 * Initializes mobile-specific optimizations and listeners:
 * 1. Global fetch interceptor to direct API calls to production backend.
 * 2. Status Bar configuration.
 * 3. Hardware back button handling.
 * 4. Splash screen dismissal.
 */
export const initMobileApp = async () => {
  if (!isNativeMobile()) {
    return;
  }

  console.log('[MobileApp] Initializing PTE Ninja Native Mobile Container...');

  // 1. Transparent fetch proxy for native Android environment
  const originalFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const resolvedInput = resolveApiUrl(input);
    return originalFetch(resolvedInput, init);
  };

  try {
    // 2. Configure Status Bar
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0B0C10' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch (err) {
    console.warn('[MobileApp] StatusBar setup warning:', err);
  }

  try {
    // 3. Configure Hardware Back Button
    let lastBackPressTime = 0;
    CapApp.addListener('backButton', ({ canGoBack }) => {
      // Check if an open modal, popup, or overlay can be closed first
      const closeButtons = document.querySelectorAll<HTMLElement>(
        '[data-dismiss-modal="true"], button[aria-label="Close"], .modal-close-btn'
      );
      if (closeButtons.length > 0) {
        const topCloseBtn = closeButtons[closeButtons.length - 1];
        topCloseBtn.click();
        return;
      }

      // If browser history can go back, navigate back
      if (canGoBack && window.history.length > 1) {
        window.history.back();
        return;
      }

      // On home screen: Double back within 2 seconds to exit app
      const now = Date.now();
      if (now - lastBackPressTime < 2000) {
        CapApp.exitApp();
      } else {
        lastBackPressTime = now;
      }
    });
  } catch (err) {
    console.warn('[MobileApp] BackButton setup warning:', err);
  }

  // 4. Dismiss Splash Screen after React has mounted
  try {
    setTimeout(async () => {
      await SplashScreen.hide({ fadeOutDuration: 350 });
    }, 600);
  } catch (err) {
    console.warn('[MobileApp] SplashScreen hide warning:', err);
  }
};
