// 只运行 unittest：所有数据库终端均为内存 mock，不使用 seed/cleanup 或真实账号。
let tables
const clone = value => JSON.parse(JSON.stringify(value))
const collectionNames = ['uni-id-users', 'uni-admin-setup-guard', 'opendb-admin-menus', 'uni-id-permissions', 'uni-id-log', 'opendb-open-data', 'uni-id-device', 'opendb-verify-codes']
const clientInfo = { appId: '__UNI__MOCK', uniPlatform: 'web', locale: 'zh-Hans' }

function api(token) {
  return uniCloudTest.importObject('uni-admin-co', token ? { token } : {})
}

function registrationApi(token) {
  const object = uniCloudTest.importObject('uni-id-co', token ? { token } : {})
  return new Proxy(object, {
    get(target, method) {
      if (method === 'getAdminRegistrationStatus' || method === 'then') return target[method]
      // 当前测试器 importObject 不转交 clientInfo，使用真实 HTTP 适配层注入测试上下文。
      return params => uniCloudTest.triggerHttp('uni-id-co', {
        path: `/${method}`,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientInfo, params, uniIdToken: token || '' })
      }, token ? { token } : {})
    }
  })
}

function mockDatabase() {
  tables = Object.fromEntries(collectionNames.map(name => [name, []]))
  tables['uni-id-users'].push({ _id: 'mock-member', username: 'admin', role: ['member'], status: 0 })
  for (const name of collectionNames) {
    const mock = uniCloudTest.db.collection(name)
    mock.get.mockImplementation(query => {
      let data = tables[name]
      if (query.doc) data = data.filter(row => row._id === query.doc)
      if (query.where) {
        data = data.filter(row => Object.entries(query.where).every(([key, value]) => {
          if (value && value.$all) return Array.isArray(row[key]) && value.$all.every(item => row[key].includes(item))
          return row[key] === value
        }))
      }
      return { data: clone(data.slice(0, query.limit || data.length)) }
    })
    mock.add.mockImplementation(query => {
      const record = clone(query.data)
      const key = name === 'opendb-admin-menus' ? 'menu_id' : name === 'uni-id-permissions' ? 'permission_id' : '_id'
      if (tables[name].some(row => (record._id && row._id === record._id) || (record[key] && row[key] === record[key]))) {
        throw new Error('mock duplicate key')
      }
      record._id = record._id || `mock-${name}-${tables[name].length}`
      tables[name].push(record)
      return { id: record._id }
    })
    mock.update.mockImplementation(query => {
      const row = tables[name].find(item => item._id === query.doc)
      if (!row) return { updated: 0 }
      for (const [key, value] of Object.entries(query.data)) {
        if (value && value.$addToSet) row[key] = [...new Set([...(row[key] || []), value.$addToSet])]
        else row[key] = clone(value)
      }
      return { updated: 1 }
    })
  }
}

beforeEach(() => {
  mockDatabase()
  // 仅注入配置文件这一最终依赖，不替换配置解析或业务公共模块。
  uniCloudTest.mockModule('uni-config-center/uni-id/config.json', {
    dcloudAppid: '__UNI__MOCK',
    isDefaultConfig: true,
    passwordSecret: 'mock-only-password-secret',
    tokenSecret: 'mock-only-token-secret',
    passwordStrength: 'medium',
    autoSetInviteCode: false,
    forceInviteCode: false
  })
  // 官方 token 平台模块的边界替身；不 mock uni-admin-setup 等业务公共模块。
  uniCloudTest.mockModule('uni-id-common', {
    createInstance: () => ({
      checkToken: async token => token === 'mock-member-token'
        ? { errCode: 0, uid: 'mock-member', role: ['member'] }
        : token === 'mock-admin-token'
          ? { errCode: 0, uid: 'mock-member', role: ['admin'] }
          : { errCode: 'uni-id-check-token-failed' },
      createToken: async () => ({ errCode: 0, token: 'mock-created-token', tokenExpired: 1 })
    })
  })
})

test('匿名状态仅公开初始化信息，无账号记录或数量', async () => {
  const result = await api().getSetupStatus()
  expect(result).toMatchObject({ errCode: 0, hasAdmin: false, canClaimAdmin: false, canRegisterAdmin: true, menuCount: null })
  expect(JSON.stringify(result)).not.toContain('mock-member')
  expect(result).not.toHaveProperty('uid')
  expect(result).not.toHaveProperty('users')
})

test('公开注册状态在无/有效/过期/伪造/格式坏 token 下完全一致且只读', async () => {
  for (const adminExists of [false, true]) {
    if (adminExists) tables['uni-id-users'].push({ _id: 'mock-other-admin', role: ['admin'], dcloud_appid: ['other-app'], status: 1 })
    const expected = { errCode: 0, errMsg: '', hasAdmin: adminExists, canRegisterAdmin: !adminExists, registrationBlocked: adminExists }
    for (const token of [null, 'mock-member-token', 'mock-admin-token', 'mock-expired-token', 'forged.payload.signature', '{bad-token']) {
      expect(await registrationApi(token).getAdminRegistrationStatus()).toEqual(expected)
    }
  }
  for (const name of collectionNames) {
    for (const operation of ['add', 'update', 'set', 'remove']) {
      expect(uniCloudTest.db.collection(name)[operation]).not.toHaveBeenCalled()
    }
    if (!['uni-id-users', 'uni-admin-setup-guard'].includes(name)) {
      expect(uniCloudTest.db.collection(name).get).not.toHaveBeenCalled()
    }
  }
  expect(uniCloudTest.db.collection('uni-id-users').get).toHaveBeenCalledWith(expect.objectContaining({
    where: { role: { $all: ['admin'] } }, limit: 1
  }))
})

test('公开注册状态对任何遗留 guard 永久关闭注册', async () => {
  for (const state of ['pending', 'failed', 'blocked', 'completed']) {
    tables['uni-admin-setup-guard'] = [{ _id: 'first-admin-v1', state }]
    expect(await registrationApi('invalid-token').getAdminRegistrationStatus()).toEqual({
      errCode: 0, errMsg: '', hasAdmin: false, canRegisterAdmin: false, registrationBlocked: true
    })
  }
})

test('公开状态查询抛错或返回异常不推断无管理员，不泄露异常内容', async () => {
  for (const name of ['uni-id-users', 'uni-admin-setup-guard']) {
    const mock = uniCloudTest.db.collection(name).get
    mock.mockRejectedValueOnce(new Error('mock-sensitive-sentinel'))
    const result = await registrationApi().getAdminRegistrationStatus()
    expect(result).toMatchObject({ errCode: 'SETUP_RESOURCE_ERROR', hasAdmin: null, canRegisterAdmin: false, registrationBlocked: true })
    expect(JSON.stringify(result)).not.toContain('mock-sensitive-sentinel')
    for (const value of [{}, { data: [], errCode: 'mock-query-failed' }]) {
      mock.mockResolvedValueOnce(value)
      expect(await registrationApi().getAdminRegistrationStatus()).toMatchObject({
        errCode: 'SETUP_RESOURCE_ERROR', hasAdmin: null, canRegisterAdmin: false, registrationBlocked: true
      })
    }
  }
})

test('公开注册状态拒绝参数，不查询数据库', async () => {
  expect(await registrationApi().getAdminRegistrationStatus({ uid: 'mock-member' })).toMatchObject({
    errCode: 'SETUP_INVALID_ARGUMENT', hasAdmin: null, canRegisterAdmin: false, registrationBlocked: true
  })
  expect(uniCloudTest.db.collection('uni-id-users').get).not.toHaveBeenCalled()
})

test('只有新增只读方法豁免鉴权，其他账号与管理方法仍拒绝无效 token', async () => {
  for (const method of ['getAccountInfo', 'addUser', 'updateUser', 'setAuthorizedApp']) {
    for (const token of [null, 'mock-expired-token', '{bad-token']) {
      expect((await registrationApi(token)[method]()).errCode).toBe('uni-id-check-token-failed')
    }
  }
  expect((await registrationApi('mock-member-token').addUser()).errCode).toBe('uni-id-permission-error')
  expect((await api('mock-expired-token').getSetupStatus()).errCode).toBe('SETUP_AUTH_REQUIRED')
  expect(uniCloudTest.db.collection('uni-id-users').add).not.toHaveBeenCalled()
})

const mockRegistration = username => ({ username, password: 'Mock-Pass-2026!' })

test('官方注册返回新管理员 token，不要求重新登录，后续注册拒绝已有 admin', async () => {
  const result = await registrationApi().registerAdmin(mockRegistration('mockadminone'))
  expect(result).toMatchObject({ errCode: 0, newToken: { token: 'mock-created-token' } })
  expect(result.requiresRelogin).not.toBe(true)
  expect(tables['uni-id-users'].find(row => row._id === result.uid).role).toContain('admin')
  expect((await registrationApi().registerAdmin(mockRegistration('mockadmintwo'))).errCode).toBe('SETUP_ADMIN_EXISTS')
  expect(tables['uni-admin-setup-guard']).toHaveLength(1)
})

test('官方注册竞争同一个原子 guard，竞争者先占锁时不能创建管理员', async () => {
  uniCloudTest.db.collection('uni-admin-setup-guard').add.mockImplementationOnce(query => {
    tables['uni-admin-setup-guard'].push({ ...clone(query.data), source: 'claim' })
    throw new Error('mock competing claim won unique key')
  })
  expect((await registrationApi().registerAdmin(mockRegistration('mockadminrace'))).errCode).toBe('SETUP_GUARD_LOCKED')
  expect(uniCloudTest.db.collection('uni-id-users').add).not.toHaveBeenCalled()
  expect(tables['uni-admin-setup-guard']).toHaveLength(1)
})

test('官方注册取得锁后二次检查发现其他 admin 仍拒绝写入', async () => {
  uniCloudTest.db.collection('uni-admin-setup-guard').add.mockImplementationOnce(query => {
    tables['uni-admin-setup-guard'].push(clone(query.data))
    tables['uni-id-users'].push({ _id: 'mock-racing-admin', role: ['admin'] })
    return { id: query.data._id }
  })
  expect((await registrationApi().registerAdmin(mockRegistration('mockadminrace'))).errCode).toBe('SETUP_ADMIN_EXISTS')
  expect(uniCloudTest.db.collection('uni-id-users').add).not.toHaveBeenCalled()
  expect(tables['uni-admin-setup-guard'][0].state).toBe('blocked')
})

test('用户名 admin 不自动提权', async () => {
  const result = await api('mock-member-token').getSetupStatus()
  expect(result).toMatchObject({ errCode: 0, currentUserIsAdmin: false, canClaimAdmin: true })
  expect(tables['uni-id-users'][0].role).toEqual(['member'])
})

test('缺少或无效 token 不能认领，也不能初始化菜单', async () => {
  for (const token of [null, 'invalid-mock-token']) {
    expect((await api(token).claimFirstAdmin()).errCode).toBe('SETUP_AUTH_REQUIRED')
    expect((await api(token).initializeMenus()).errCode).toBe('SETUP_AUTH_REQUIRED')
  }
  expect(tables['uni-admin-setup-guard']).toHaveLength(0)
})

test('账号不存在或已禁用不能认领', async () => {
  tables['uni-id-users'][0].status = 1
  expect((await api('mock-member-token').claimFirstAdmin()).errCode).toBe('SETUP_ACCOUNT_UNAVAILABLE')
  tables['uni-id-users'] = []
  expect((await api('mock-member-token').claimFirstAdmin()).errCode).toBe('SETUP_ACCOUNT_UNAVAILABLE')
  expect(tables['uni-admin-setup-guard']).toHaveLength(0)
})

test('普通用户不能初始化菜单', async () => {
  expect((await api('mock-member-token').initializeMenus()).errCode).toBe('SETUP_ADMIN_REQUIRED')
  expect(tables['opendb-admin-menus']).toHaveLength(0)
})

test('不接受客户端 uid 或 role', async () => {
  expect((await api('mock-member-token').claimFirstAdmin({ uid: 'someone-else', role: ['admin'] })).errCode).toBe('SETUP_INVALID_ARGUMENT')
  expect(tables['uni-admin-setup-guard']).toHaveLength(0)
})

test('已有任意其他应用的管理员也拒绝认领', async () => {
  tables['uni-id-users'].push({ _id: 'mock-other-admin', role: ['admin'], dcloud_appid: ['mock-other-app'] })
  expect((await api('mock-member-token').claimFirstAdmin()).errCode).toBe('SETUP_ADMIN_EXISTS')
  expect(tables['uni-admin-setup-guard']).toHaveLength(0)
})

test('显式认领保留原账户、已有角色，并要求重新登录', async () => {
  const result = await api('mock-member-token').claimFirstAdmin()
  expect(result).toMatchObject({ errCode: 0, requiresRelogin: true })
  expect(tables['uni-id-users']).toHaveLength(1)
  expect(tables['uni-id-users'][0]).toMatchObject({ _id: 'mock-member', username: 'admin', role: ['member', 'admin'] })
  expect(tables['uni-admin-setup-guard'][0].state).toBe('completed')
  expect((await api('mock-member-token').initializeMenus()).errCode).toBe('SETUP_ADMIN_REQUIRED')
})

test('竞争者在 guard add 前先写入，认领端必须拒绝', async () => {
  uniCloudTest.db.collection('uni-admin-setup-guard').add.mockImplementationOnce(query => {
    tables['uni-admin-setup-guard'].push({ ...clone(query.data), source: 'register' })
    throw new Error('mock competing register won unique key')
  })
  expect((await api('mock-member-token').claimFirstAdmin()).errCode).toBe('SETUP_GUARD_LOCKED')
  expect(tables['uni-admin-setup-guard']).toHaveLength(1)
  expect(uniCloudTest.db.collection('uni-id-users').update).not.toHaveBeenCalled()
})

test('取得 guard 后再次查到管理员，禁止执行提权', async () => {
  uniCloudTest.db.collection('uni-admin-setup-guard').add.mockImplementationOnce(query => {
    tables['uni-admin-setup-guard'].push(clone(query.data))
    tables['uni-id-users'].push({ _id: 'mock-racing-admin', role: ['admin'] })
    return { id: query.data._id }
  })
  expect((await api('mock-member-token').claimFirstAdmin()).errCode).toBe('SETUP_ADMIN_EXISTS')
  expect(tables['uni-admin-setup-guard'][0].state).toBe('blocked')
  expect(uniCloudTest.db.collection('uni-id-users').update).not.toHaveBeenCalled()
})

test('遗留 pending/failed/completed guard 都不回收或重开', async () => {
  for (const state of ['pending', 'failed', 'completed']) {
    tables['uni-admin-setup-guard'] = [{ _id: 'first-admin-v1', state }]
    expect((await api('mock-member-token').claimFirstAdmin()).errCode).toBe('SETUP_GUARD_LOCKED')
    expect((await api().getSetupStatus()).setupBlocked).toBe(true)
  }
})

test('提权写入异常后保留 failed guard', async () => {
  uniCloudTest.db.collection('uni-id-users').update.mockRejectedValue(new Error('mock write unavailable'))
  expect((await api('mock-member-token').claimFirstAdmin()).errCode).toBe('SETUP_RESOURCE_ERROR')
  expect(tables['uni-admin-setup-guard'][0].state).toBe('failed')
  expect((await api('mock-member-token').claimFirstAdmin()).errCode).toBe('SETUP_GUARD_LOCKED')
})

test('账号写成功但 guard 完成更新失败也不再次开放', async () => {
  uniCloudTest.db.collection('uni-admin-setup-guard').update.mockRejectedValue(new Error('mock uncertain acknowledgement'))
  expect((await api('mock-member-token').claimFirstAdmin()).errCode).toBe('SETUP_RESOURCE_ERROR')
  expect(tables['uni-id-users'][0].role).toContain('admin')
  expect((await api('mock-member-token').claimFirstAdmin()).errCode).toBe('SETUP_ADMIN_EXISTS')
})

test('查询异常或非规范响应不能误判无管理员，也不返回异常私密内容', async () => {
  const mock = uniCloudTest.db.collection('uni-id-users').get
  mock.mockRejectedValueOnce(new Error('mock-sensitive-sentinel'))
  const result = await api().getSetupStatus()
  expect(result).toMatchObject({ errCode: 'SETUP_RESOURCE_ERROR', hasAdmin: null, canRegisterAdmin: false, canClaimAdmin: false })
  expect(JSON.stringify(result)).not.toContain('mock-sensitive-sentinel')
  mock.mockResolvedValueOnce({})
  expect((await api().getSetupStatus()).hasAdmin).toBeNull()
})

test('菜单或 guard 集合故障必须返回未知状态', async () => {
  for (const name of ['opendb-admin-menus', 'uni-admin-setup-guard']) {
    uniCloudTest.db.collection(name).get.mockRejectedValueOnce(new Error('mock missing collection'))
    expect(await api().getSetupStatus()).toMatchObject({ errCode: 'SETUP_RESOURCE_ERROR', hasAdmin: null, menuStatus: 'unknown', canRegisterAdmin: false })
  }
})

test('token 为 admin 但数据库已撤权不能初始化', async () => {
  expect((await api('mock-admin-token').initializeMenus()).errCode).toBe('SETUP_ADMIN_REQUIRED')
})

test('菜单和权限重复初始化幂等，普通角色不获授权', async () => {
  tables['uni-id-users'][0].role.push('admin')
  const object = api('mock-admin-token')
  expect(await object.initializeMenus()).toMatchObject({ errCode: 0, menusAdded: 9, permissionsAdded: 24, menuStatus: 'ready' })
  expect(await object.initializeMenus()).toMatchObject({ errCode: 0, menusAdded: 0, permissionsAdded: 0, menuCount: 9 })
  expect(tables['opendb-admin-menus']).toHaveLength(9)
  expect(tables['uni-id-permissions']).toHaveLength(24)
  expect(tables['uni-id-permissions'].filter(row => row.permission_id.endsWith('_UNI_ID_LOG'))
    .map(row => row.permission_id)).toEqual(['READ_UNI_ID_LOG'])
  expect(tables['opendb-admin-menus'].find(row => row.menu_id === 'system_safety')).toMatchObject({
    parent_id: 'system_management', url: '/pages/system/safety/list', permission: ['READ_UNI_ID_LOG']
  })
  expect(await object.getSetupStatus()).toMatchObject({ errCode: 0, menuStatus: 'ready', menuCount: 9 })
  tables['opendb-admin-menus'] = tables['opendb-admin-menus'].filter(row => row.menu_id !== 'system_safety')
  tables['uni-id-permissions'] = tables['uni-id-permissions'].filter(row => row.permission_id !== 'READ_UNI_ID_LOG')
  expect(await object.getSetupStatus()).toMatchObject({ errCode: 0, menuStatus: 'partial', menuCount: 8 })
  expect(await object.initializeMenus()).toMatchObject({ errCode: 0, menusAdded: 1, permissionsAdded: 1, menuStatus: 'ready', menuCount: 9 })
  expect(await object.initializeMenus()).toMatchObject({ errCode: 0, menusAdded: 0, permissionsAdded: 0, menuCount: 9 })
  expect(uniCloudTest.db.collection('uni-id-users').update).not.toHaveBeenCalled()
  for (const operation of ['get', 'count', 'add', 'update', 'set', 'remove']) {
    expect(uniCloudTest.db.collection('uni-id-log')[operation]).not.toHaveBeenCalled()
  }
  for (const menu of tables['opendb-admin-menus']) {
    expect(menu.url).not.toMatch(/statistics|upgrade|portal|account|init/)
    if (menu.url.includes('/system/')) expect(menu.permission.length).toBeGreaterThan(0)
  }
})

test('只补新记录，不覆盖已存在菜单及权限，即使已禁用或自定义路由', async () => {
  tables['uni-id-users'][0].role.push('admin')
  const custom = { _id: 'mock-custom', menu_id: 'system_safety', name: 'custom', url: '/custom', enable: false }
  const permission = { _id: 'mock-custom-permission', permission_id: 'READ_UNI_ID_LOG', permission_name: 'custom' }
  tables['opendb-admin-menus'].push(clone(custom))
  tables['uni-id-permissions'].push(clone(permission))
  expect(await api('mock-admin-token').initializeMenus()).toMatchObject({ errCode: 0, menusAdded: 8, permissionsAdded: 23 })
  expect(tables['opendb-admin-menus'][0]).toEqual(custom)
  expect(tables['uni-id-permissions'][0]).toEqual(permission)
  expect(uniCloudTest.db.collection('opendb-admin-menus').update).not.toHaveBeenCalled()
})

test('竞争者在菜单 add 前先写入相同业务键，读回后幂等成功', async () => {
  tables['uni-id-users'][0].role.push('admin')
  uniCloudTest.db.collection('opendb-admin-menus').add.mockImplementationOnce(query => {
    tables['opendb-admin-menus'].push(clone(query.data))
    throw new Error('mock concurrent menu initialization won unique key')
  })
  expect(await api('mock-admin-token').initializeMenus()).toMatchObject({ errCode: 0, menusAdded: 8 })
  expect(tables['opendb-admin-menus']).toHaveLength(9)
  expect(new Set(tables['opendb-admin-menus'].map(row => row.menu_id)).size).toBe(9)
})

test('新增失败不能吞成重复成功，已补入的记录可在重试中保留', async () => {
  tables['uni-id-users'][0].role.push('admin')
  uniCloudTest.db.collection('opendb-admin-menus').add.mockRejectedValueOnce(new Error('mock schema unavailable'))
  expect(await api('mock-admin-token').initializeMenus()).toMatchObject({ errCode: 'SETUP_RESOURCE_ERROR', menuStatus: 'unknown' })
  expect(await api('mock-admin-token').initializeMenus()).toMatchObject({ errCode: 0, permissionsAdded: 0, menusAdded: 9 })
})

test('官方注册入口与认领入口依赖同一公共 guard，注册写入位于 guard 回调内', async () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const ts = require('/Applications/HBuilderX-Alpha.app/Contents/HBuilderX/plugins/compile-typescript/node_modules/typescript')
  const root = path.resolve(__dirname, '../../..')
  const official = path.join(root, 'uni_modules/uni-id-pages-x/uniCloud/cloudfunctions/uni-id-co')
  const packageJson = JSON.parse(fs.readFileSync(path.join(official, 'package.json'), 'utf8'))
  const adminPackage = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'))
  expect(path.resolve(official, packageJson.dependencies['uni-admin-setup'].slice(5)))
    .toBe(path.resolve(__dirname, adminPackage.dependencies['uni-admin-setup'].slice(5)))
  const source = ts.createSourceFile('register-admin.js', fs.readFileSync(path.join(official, 'module/register/register-admin.js'), 'utf8'), ts.ScriptTarget.Latest, true)
  let guardedWrites = 0
  let unguardedWrites = 0
  const positions = {}
  function visit(node, guarded) {
    const inside = guarded || (ts.isCallExpression(node) && node.expression.getText(source) === 'withFirstAdminGuard')
    if (ts.isCallExpression(node)) positions[node.expression.getText(source)] = node.pos
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'postRegister.call') {
      if (inside) guardedWrites++
      else unguardedWrites++
    }
    ts.forEachChild(node, child => visit(child, inside))
  }
  visit(source, false)
  expect(guardedWrites).toBe(1)
  expect(unguardedWrites).toBe(0)
  expect(positions['this.middleware.validate']).toBeLessThan(positions['preRegisterWithPassword.call'])
  expect(positions['preRegisterWithPassword.call']).toBeLessThan(positions.withFirstAdminGuard)
  const registerUtils = fs.readFileSync(path.join(official, 'lib/utils/register.js'), 'utf8')
  const precheck = registerUtils.slice(registerUtils.indexOf('async function realPreRegister'), registerUtils.indexOf('async function thirdPartyRegister'))
  expect(precheck).toContain('await findUser(')
  expect(precheck).toContain('userMatched.length > 0')
  expect(precheck).toContain('errCode: ERROR.ACCOUNT_EXISTS')
  expect(precheck.indexOf('await preRegister.call')).toBeLessThan(precheck.indexOf('passwordUtils.generatePasswordHash'))
  // 注册源的竞争写入交错由前面的 guard add 冲突测试覆盖；执行器不支持双入口真实并发。
})
