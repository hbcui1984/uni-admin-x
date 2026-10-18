// 所有云对象调用都直接传入下面的具体响应类型，不使用 ApiResponse<T> 嵌套泛型。
// 先检查 errCode === 0；hasAdmin === null 或 menuStatus === 'unknown' 绝不能视为未初始化。
export type AdminSetupStatusResponse = {
  errCode: number | string
  errMsg: string
  hasAdmin: boolean | null
  menuStatus: string
  // 仅管理员返回九个迁移基础菜单中已存在的数量，非集合总数；其他身份返回 null。
  menuCount: number | null
  currentUserIsAdmin: boolean
  canClaimAdmin: boolean
  canRegisterAdmin: boolean
  setupBlocked: boolean
}

export type ClaimFirstAdminResponse = {
  errCode: number | string
  errMsg: string
  requiresRelogin: boolean
}

export type InitializeMenusResponse = {
  errCode: number | string
  errMsg: string
  menusAdded: number | null
  permissionsAdded: number | null
  menuStatus: string
  menuCount: number | null
  requiresRelogin: boolean
}

export type RegisterAdminResponse = {
  errCode: number | string
  errMsg?: string
  uid?: string
  newToken?: {
    token: string
    tokenExpired: number
  }
  passwordConfirmed?: boolean
  requiresRelogin?: boolean
}

// 三个方法都不接受参数。显式确认后才能调用写方法，禁止页面加载时自动执行。
// uniCloud.importObject('uni-admin-co').getSetupStatus<AdminSetupStatusResponse>()
// uniCloud.importObject('uni-admin-co').claimFirstAdmin<ClaimFirstAdminResponse>()
// uniCloud.importObject('uni-admin-co').initializeMenus<InitializeMenusResponse>()
// menuStatus: empty / partial / ready / unknown；ready 仅表示业务键完整，不修改自定义内容。
// 官方 uni-id-co.registerAdmin 返回新管理员的 newToken，交由 loginSuccess 处理，无需再次登录。
// uniCloud.importObject('uni-id-co').registerAdmin<RegisterAdminResponse>({ username, password, nickname })
// SETUP_AUTH_REQUIRED: 缺少/无效 token；SETUP_ACCOUNT_UNAVAILABLE: 已删除/非正常账号。
// SETUP_ADMIN_REQUIRED: token 与数据库实际角色必须同时为 admin，认领后先重新登录。
// SETUP_ADMIN_EXISTS: 整个空间已有任意 admin（不区分 appId）。
// SETUP_GUARD_LOCKED: 一次性 guard 已占用，失败/中断也不自动回收，维护者人工核查。
// SETUP_INVALID_ARGUMENT: 传了参数（不接受 uid、role 等）。
// SETUP_RESOURCE_ERROR: 数据库/集合/schema/索引或返回结构异常，不能当作空状态。
// 初始化失败可能已补入部分记录；可以重新登录后重试，不回滚、不覆盖已有数据。
