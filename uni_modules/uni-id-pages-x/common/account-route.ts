import { pages as registeredPages, subPackages } from '@/pages.json';

export const accountLoginPath = '/uni_modules/uni-id-pages-x/pages/login/login';
export const accountRegisterPath = '/uni_modules/uni-id-pages-x/pages/register/register';
const defaultRedirect = '/pages/index/index';
const profilePrefix = '/uni_modules/uni-id-pages-x/pages/userinfo/';
let entryRoute = '';
let entryCaptured = false;
let protectedTarget = '';

function webRoute(): string {
  // #ifdef WEB
  if (typeof window !== 'undefined') {
    return window.location.hash.startsWith('#/') ? window.location.hash.slice(1) : window.location.pathname + window.location.search;
  }
  // #endif
  return '';
}

// 只能在路由器初始化之前读取原始入口；本模块不依赖 App、store 或 uniCloud。
export function captureAccountEntry() {
  if (entryCaptured) return;
  entryCaptured = true;
  entryRoute = webRoute();
}
captureAccountEntry();

export function safeAccountRedirect(value: string | null): string {
  if (!value) return defaultRedirect;
  let target = value;
  if (/^%2f/i.test(target)) {
    try { target = decodeURIComponent(target); } catch (_) { return defaultRedirect; }
  }
  if (!target.startsWith('/') || target.startsWith('//') || /[\\\u0000-\u001f\u007f#]/.test(target)) return defaultRedirect;
  const path = target.split('?')[0];
  if (!/^\/[a-zA-Z0-9_/-]+$/.test(path)) return defaultRedirect;
  if ([accountLoginPath, accountRegisterPath, '/uni_modules/uni-id-pages-x/pages/retrieve/retrieve'].includes(path)) return defaultRedirect;
  const registered = registeredPages.some(page => '/' + page.path === path) || subPackages.some(pkg => pkg.pages.some(page => '/' + pkg.root + '/' + page.path === path));
  return registered ? target : defaultRedirect;
}

function redirectFromRoute(route: string): string | null {
  // #ifdef WEB
  const index = route.indexOf('?');
  if (index >= 0) return new URLSearchParams(route.slice(index + 1)).get('uniIdRedirectUrl');
  // #endif
  return null;
}

export function readAccountRedirect(): string | null {
  const route = webRoute();
  if (![accountLoginPath, accountRegisterPath].includes(route.split('?')[0])) return null;
  const value = redirectFromRoute(route);
  return value == null ? null : safeAccountRedirect(value);
}

export function accountRouteUrl(path: string, target: string): string {
  // uni 导航自身还会序列化一次 query，不对内部导航额外编码。
  const encoded = encodeURIComponent(safeAccountRedirect(target));
  return path + '?uniIdRedirectUrl=' + encoded;
}

export function rememberAccountAccess(fullPath: string): string {
  const path = fullPath.split('?')[0];
  const original = entryRoute.split('?')[0] === path ? entryRoute : fullPath;
  const target = safeAccountRedirect(original);
  if (target.startsWith(profilePrefix)) protectedTarget = target;
  return target;
}

export function normalizeAccountRoute(options: Record<string, any>) {
  // #ifdef WEB
  const current = webRoute();
  const path = current.split('?')[0];
  if (![accountLoginPath, accountRegisterPath].includes(path)) return;
  const source = entryRoute.split('?')[0] === path ? entryRoute : current;
  let value = redirectFromRoute(source) ?? options['uniIdRedirectUrl'] ?? null;
  if (entryRoute.startsWith(profilePrefix)) protectedTarget = safeAccountRedirect(entryRoute);
  if (protectedTarget && value != null && safeAccountRedirect(value).split('?')[0] === protectedTarget.split('?')[0]) value = protectedTarget;
  entryRoute = '';
  const target = safeAccountRedirect(value);
  options['uniIdRedirectUrl'] = target;
  const index = source.indexOf('?');
  const query = new URLSearchParams(index >= 0 ? source.slice(index + 1) : '');
  query.set('uniIdRedirectUrl', encodeURIComponent(target));
  const normalized = path + '?' + query.toString();
  const url = new URL(window.location.href);
  if (url.hash.startsWith('#/')) url.hash = normalized;
  else { url.pathname = path; url.search = query.toString(); }
  window.history.replaceState(window.history.state, '', url.toString());
  // #endif
}
