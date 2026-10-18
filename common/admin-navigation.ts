import { computed, onMounted, onUnmounted, reactive, watch } from 'vue'
import { state as account } from '@/uni_modules/uni-id-pages-x/store.uts'

export const HOME_URL = '/pages/index/index'
export const LOGIN_URL = '/uni_modules/uni-id-pages-x/pages/login/login'
export const PROFILE_URL = '/uni_modules/uni-id-pages-x/pages/userinfo/userinfo'

export const coreEntries = [
  { name: '用户管理', module: 'user', icon: 'person', permissions: ['READ_UNI_ID_USERS'] },
  { name: '角色管理', module: 'role', icon: 'staff', permissions: ['READ_UNI_ID_ROLES'] },
  { name: '权限管理', module: 'permission', icon: 'locked', permissions: ['READ_UNI_ID_PERMISSIONS'] },
  { name: '菜单管理', module: 'menu', icon: 'list', permissions: ['CREATE_OPENDB_ADMIN_MENUS', 'UPDATE_OPENDB_ADMIN_MENUS', 'DELETE_OPENDB_ADMIN_MENUS'] },
  { name: '标签管理', module: 'tag', icon: 'tag', permissions: ['READ_UNI_ID_TAG'] },
  { name: '应用列表', module: 'app', icon: 'grid', permissions: ['READ_OPENDB_APP_LIST'] },
  { name: '用户日志', module: 'safety', icon: 'info', permissions: ['READ_UNI_ID_LOG'] }
]

export const demoEntries = [
  { name: '图标演示', url: '/pages/demo/icons/icons', icon: 'star' },
  { name: '表格演示', url: '/pages/demo/table/table', icon: 'list' }
]

export type AdminMenu = {
  menu_id: string
  parent_id: string
  name: string
  url: string
  icon: string
  permission: string[]
  enable: boolean
  sort: number
  children: AdminMenu[]
}

export function normalizeRoute(url: string): string {
  const path = (url || '').split('?')[0].split('#')[0]
  if (path === '/') return HOME_URL
  return path && path[0] !== '/' ? '/' + path : path
}

export function isAdminRoute(url: string): boolean {
  const path = normalizeRoute(url)
  return path === HOME_URL || demoEntries.some(entry => entry.url === path) || coreEntries.some(entry =>
    (entry.module === 'app' ? ['list', 'add'] : entry.module === 'safety' ? ['list'] : ['list', 'add', 'edit']).some(action => path === `/pages/system/${entry.module}/${action}`))
}

export function currentRoute(): string {
  const pages = getCurrentPages()
  return normalizeRoute(pages.length ? pages[pages.length - 1].route || '' : HOME_URL)
}

export function identity() {
  let user: ReturnType<typeof uniCloud.getCurrentUserInfo> | null = null
  try { user = uniCloud.config ? uniCloud.getCurrentUserInfo() : null } catch (_) { /* 损坏的本地 token 按未登录处理。 */ }
  return {
    uid: user?.uid || '',
    tokenExpired: user?.tokenExpired || 0,
    role: Array.isArray(user?.role) ? user.role : [],
    permission: Array.isArray(user?.permission) ? user.permission : []
  }
}

export function hasPermission(permission: string): boolean {
  const user = identity()
  return !!user.uid && user.tokenExpired > Date.now() &&
    (user.role.includes('admin') || user.permission.includes(permission))
}

export const navigation = reactive({
  menus: [] as AdminMenu[],
  status: 'idle',
  error: '',
  loggedIn: false,
  revision: 0
})

let sessionKey = ''
let requestId = 0

export function clearAdminNavigation(store: any) {
  requestId++
  sessionKey = ''
  navigation.menus = []
  navigation.status = 'idle'
  navigation.error = ''
  navigation.loggedIn = false
  navigation.revision++
  store.commit('app/SET_NAV_MENU', [])
  store.commit('app/SET_ROUTES', [])
}

// 旧菜单规则：普通账号的叶子菜单必须命中任一权限；分组随可见子项保留。
export function buildMenuTree(rows: AdminMenu[], user: ReturnType<typeof identity>): AdminMenu[] {
  const enabled = rows.filter(row => row.enable === true && row.menu_id)
  const admin = user.role.includes('admin')
  const visit = (row: AdminMenu, ancestors: string[]): AdminMenu | null => {
    if (ancestors.includes(row.menu_id)) return null
    const rawChildren = enabled.filter(child => child.parent_id === row.menu_id)
    const children = rawChildren.map(child => visit(child, [...ancestors, row.menu_id]))
      .filter((child): child is AdminMenu => child !== null)
    const url = row.url ? normalizeRoute(row.url) : ''
    const leafAllowed = admin || (Array.isArray(row.permission) &&
      row.permission.some(permission => user.permission.includes(permission)))
    const target = isAdminRoute(url) && (rawChildren.length > 0 || leafAllowed) ? url : ''
    if (!children.length && !target) return null
    return { ...row, url: target, children }
  }
  return enabled.filter(row => !row.parent_id).map(row => visit(row, []))
    .filter((row): row is AdminMenu => row !== null)
}

export async function loadAdminMenus(store: any, force = false) {
  const user = identity()
  if (!user.uid || user.tokenExpired <= Date.now() || !account.isLogin) {
    if (sessionKey || navigation.loggedIn) clearAdminNavigation(store)
    return
  }
  const key = JSON.stringify(user)
  if (!force && key === sessionKey && navigation.status !== 'idle') return
  clearAdminNavigation(store)
  sessionKey = key
  navigation.loggedIn = true
  navigation.status = 'loading'
  const id = ++requestId
  try {
    const rows: AdminMenu[] = []
    const db = uniCloud.databaseForJQL()
    // 分页拉取完整菜单，避免 100 条默认上限截断父子关系。
    for (let offset = 0; ; offset += 100) {
      const result = await db.collection('opendb-admin-menus').where('enable == true')
        .field('menu_id,parent_id,name,url,icon,permission,enable,sort')
        .orderBy('sort asc,menu_id asc').skip(offset).limit(100).get()
      if (id !== requestId) return
      const page = result.data as unknown as AdminMenu[]
      rows.push(...page)
      if (page.length < 100) break
    }
    if (id !== requestId) return
    if (identity().tokenExpired <= Date.now() || !account.isLogin || JSON.stringify(identity()) !== key) {
      clearAdminNavigation(store)
      return
    }
    navigation.menus = buildMenuTree(rows, user)
    navigation.status = rows.length ? 'ready' : 'empty'
    navigation.revision++
    store.commit('app/SET_NAV_MENU', navigation.menus)
  } catch (error: any) {
    if (id !== requestId) return
    navigation.status = 'error'
    navigation.error = error?.errMsg || error?.message || '请检查服务空间关联及菜单集合部署状态'
  }
}

export function navigateAdmin(url: string) {
  if (!isAdminRoute(url)) return
  const user = identity()
  if (!user.uid || user.tokenExpired <= Date.now() || !account.isLogin) {
    uni.reLaunch({ url: LOGIN_URL })
    return
  }
  uni.redirectTo({
    url: normalizeRoute(url) + (url.includes('?') ? '?' + url.split('?').slice(1).join('?') : ''),
    success: () => { if (uni.getWindowInfo().windowWidth < 768) uni.hideLeftWindow() },
    fail: () => uni.showToast({ title: '页面暂不可用，请确认已注册并完成迁移', icon: 'none' })
  })
}

export function useAdminNavigation(store: any) {
  let timer: ReturnType<typeof setInterval> | undefined
  const refresh = () => { void loadAdminMenus(store) }
  const changed = () => { void loadAdminMenus(store, true) }
  const stop = watch(() => [account.isLogin, account.userInfo], refresh, { deep: true })
  onMounted(() => {
    refresh()
    timer = setInterval(refresh, 1000)
    uni.$on('uni-id-pages-x-login-success', refresh)
    uni.$on('uni-id-pages-x-logout', refresh)
    uni.$on('uni-admin-menus-changed', changed)
  })
  onUnmounted(() => {
    stop()
    if (timer !== undefined) clearInterval(timer)
    uni.$off('uni-id-pages-x-login-success', refresh)
    uni.$off('uni-id-pages-x-logout', refresh)
    uni.$off('uni-admin-menus-changed', changed)
  })
  const entries = computed(() => {
    navigation.revision
    return navigation.loggedIn ? coreEntries.filter(entry => entry.permissions.some(hasPermission)) : []
  })
  return { navigation, entries, retry: () => loadAdminMenus(store, true) }
}
