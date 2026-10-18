import type { AdminSetupStatusResponse, ClaimFirstAdminResponse, InitializeMenusResponse, RegisterAdminResponse } from './admin-setup-types'
import { logout } from '@/uni_modules/uni-id-pages-x/common/common.uts'
import { accountRouteUrl, accountLoginPath } from '@/uni_modules/uni-id-pages-x/common/account-route'
import { clearAdminNavigation } from './admin-navigation'
import store from '@/store/index.js'

export const adminSetupPath = '/pages/setup/index'

export function setupIdentityKey(): string {
  const token = uni.getStorageSync('uni_id_token')
  const expired = uni.getStorageSync('uni_id_token_expired')
  return String(token ?? '') + ':' + String(expired ?? '')
}

export function setupLoggedIn(): boolean {
  try {
    if (uniCloud.config == null) return false
    const user = uniCloud.getCurrentUserInfo()
    return user != null && !!user.uid && user.tokenExpired > Date.now()
  } catch (_) { return false }
}

export function setupStatusUsable(status: AdminSetupStatusResponse | null): boolean {
  return status != null && status.errCode === 0 && typeof status.hasAdmin === 'boolean' &&
    ['empty', 'partial', 'ready'].includes(status.menuStatus) &&
    typeof status.setupBlocked === 'boolean' && typeof status.currentUserIsAdmin === 'boolean' &&
    typeof status.canClaimAdmin === 'boolean' && typeof status.canRegisterAdmin === 'boolean'
}

export function setupErrorMessage(code: number | string): string {
  switch (code) {
    case 'SETUP_AUTH_REQUIRED':
    case 'uni-id-token-expired':
    case 'uni-id-token-not-exist':
    case 'uni-id-check-token-failed': return '登录已失效，请退出并重新登录后检查初始化状态。'
    case 'SETUP_ACCOUNT_UNAVAILABLE': return '当前账号不可用，请联系管理员或更换账号登录。'
    case 'SETUP_ADMIN_REQUIRED': return '当前会话没有管理员权限。已获授权的账号也必须重新登录后继续。'
    case 'SETUP_ADMIN_EXISTS': return '空间已有管理员，不能认领或创建首任管理员。请使用管理员账号登录。'
    case 'SETUP_GUARD_LOCKED': return '首任管理员操作已锁定，请联系维护者核查，不能继续认领或注册。'
    case 'uni-id-username-exists': return '用户名已存在，请更换用户名并重新检查状态。'
    case 'SETUP_RESOURCE_ERROR': return '初始化状态读取失败。请检查本地云函数、公共模块依赖，以及关联数据库的 schema 和索引；本地调试不要求上传云对象。'
    case 'SETUP_RESPONSE_INVALID': return '本地初始化接口返回格式不符合约定，请检查 uni-admin-co 与配套公共模块的代码版本，再重试。'
    case 'SETUP_CONNECTION_ERROR': return '初始化接口调用失败，请确认已连接本地云函数，并查看本地运行控制台后重试。'
    default: return '初始化检查失败，状态尚未确认。请查看当前本地云函数调用日志后重试。'
  }
}

function setupCloud(name: string) {
  if (uniCloud.config == null) throw new Error('SETUP_RESOURCE_ERROR')
  const object = uniCloud.importObject(name, { customUI: true })
  if (object == null) throw new Error('SETUP_RESOURCE_ERROR')
  return object
}

export async function getSetupStatus(): Promise<AdminSetupStatusResponse> {
  return await setupCloud('uni-admin-co').getSetupStatus<AdminSetupStatusResponse>()
}

export async function claimFirstAdmin(): Promise<ClaimFirstAdminResponse> {
  return await setupCloud('uni-admin-co').claimFirstAdmin<ClaimFirstAdminResponse>()
}

export async function initializeMenus(): Promise<InitializeMenusResponse> {
  return await setupCloud('uni-admin-co').initializeMenus<InitializeMenusResponse>()
}

export async function registerFirstAdmin(username: string, password: string, nickname: string): Promise<RegisterAdminResponse> {
  const payload: UTSJSONObject = { username, password }
  if (nickname.length > 0) payload['nickname'] = nickname
  return await setupCloud('uni-id-co').registerAdmin<RegisterAdminResponse>(payload)
}

export function loginForSetup() {
  uni.navigateTo({ url: accountRouteUrl(accountLoginPath, adminSetupPath) })
}

export function reloginForSetup() {
  clearAdminNavigation(store)
  logout(adminSetupPath)
}
