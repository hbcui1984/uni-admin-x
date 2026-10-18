'use strict'

const GUARD_COLLECTION = 'uni-admin-setup-guard'
const GUARD_ID = 'first-admin-v1'
const menus = require('./menus.json')
const messages = {
  SETUP_AUTH_REQUIRED: '请先登录有效账号',
  SETUP_ADMIN_REQUIRED: '仅管理员可以执行此操作',
  SETUP_ADMIN_EXISTS: '空间已有管理员，不允许认领或注册首任管理员',
  SETUP_GUARD_LOCKED: '首任管理员初始化已锁定，请等待或由空间维护者核查，禁止自动重置',
  SETUP_INVALID_ARGUMENT: '此方法不接受参数',
  SETUP_RESOURCE_ERROR: '初始化资源不可用，请检查集合、schema、唯一索引及部署状态',
  SETUP_ACCOUNT_UNAVAILABLE: '当前账号不存在或状态不可用'
}

function fail(errCode) {
  return { errCode, errMsg: messages[errCode] || messages.SETUP_RESOURCE_ERROR }
}

function rows(result) {
  if (!result || (result.errCode && result.errCode !== 0) || !Array.isArray(result.data)) {
    throw fail('SETUP_RESOURCE_ERROR')
  }
  return result.data
}

async function hasAdmin(db) {
  const result = await db.collection('uni-id-users')
    .where({ role: db.command.all(['admin']) }).field({ _id: true }).limit(1).get()
  return rows(result).length > 0
}

async function getGuard(db) {
  const data = rows(await db.collection(GUARD_COLLECTION).doc(GUARD_ID).get())
  return data[0] || null
}

async function setGuardState(db, state) {
  const result = await db.collection(GUARD_COLLECTION).doc(GUARD_ID)
    .update({ state, updated_at: Date.now() })
  if (!result || result.updated !== 1) throw fail('SETUP_RESOURCE_ERROR')
}

async function acquireFirstAdmin(db, source) {
  if (await hasAdmin(db)) throw fail('SETUP_ADMIN_EXISTS')
  try {
    // 固定 _id 的 add 是两个入口共同的原子竞争点；永不 set、删除或按时间回收。
    const result = await db.collection(GUARD_COLLECTION).add({
      _id: GUARD_ID, source, state: 'pending', created_at: Date.now(), updated_at: Date.now()
    })
    if (!result || result.id !== GUARD_ID) throw fail('SETUP_RESOURCE_ERROR')
  } catch (error) {
    if (await getGuard(db)) throw fail('SETUP_GUARD_LOCKED')
    throw fail('SETUP_RESOURCE_ERROR')
  }
  if (await hasAdmin(db)) {
    await setGuardState(db, 'blocked')
    throw fail('SETUP_ADMIN_EXISTS')
  }
}

async function withFirstAdminGuard(db, source, operation) {
  try {
    await acquireFirstAdmin(db, source)
  } catch (error) {
    throw error && messages[error.errCode] ? fail(error.errCode) : fail('SETUP_RESOURCE_ERROR')
  }
  try {
    const result = await operation()
    if (!result || result.errCode !== 0 || !(await hasAdmin(db))) {
      throw fail('SETUP_RESOURCE_ERROR')
    }
    await setGuardState(db, 'completed')
    return result
  } catch (error) {
    // 写入可能已成功（例如后续签发 token 失败）；failed 也永久关闭入口。
    try { await setGuardState(db, 'failed') } catch (_) {}
    if (error && (messages[error.errCode] || (typeof error.errCode === 'string' && error.errCode.startsWith('uni-id-')))) {
      throw error
    }
    throw fail('SETUP_RESOURCE_ERROR')
  }
}

async function findByKey(db, collection, key, value) {
  return rows(await db.collection(collection).where({ [key]: value }).limit(1).get())[0] || null
}

async function insertMissing(db, collection, key, record) {
  if (await findByKey(db, collection, key, record[key])) return false
  try {
    const result = await db.collection(collection).add({
      ...record, _id: record[key], create_date: Date.now()
    })
    if (!result || !result.id) throw fail('SETUP_RESOURCE_ERROR')
    return true
  } catch (error) {
    // 唯一键冲突只在读回相同业务键后视为并发成功，其他错误不得吞掉。
    if (await findByKey(db, collection, key, record[key])) return false
    throw fail('SETUP_RESOURCE_ERROR')
  }
}

function permissionSeeds() {
  const entities = ['UNI_ID_USERS', 'UNI_ID_ROLES', 'UNI_ID_PERMISSIONS', 'OPENDB_ADMIN_MENUS', 'UNI_ID_TAG', 'OPENDB_APP_LIST']
  return entities.flatMap(entity => ['READ', 'CREATE', 'UPDATE', 'DELETE']
    .filter(action => entity !== 'OPENDB_ADMIN_MENUS' || action !== 'READ')
    .map(action => ({ permission_id: `${action}_${entity}`, permission_name: `${action}_${entity}` })))
    .concat([{ permission_id: 'READ_UNI_ID_LOG', permission_name: 'READ_UNI_ID_LOG' }])
}

async function menuState(db) {
  let present = 0
  for (const menu of menus) {
    if (await findByKey(db, 'opendb-admin-menus', 'menu_id', menu.menu_id)) present++
  }
  return { menuStatus: present === menus.length ? 'ready' : present === 0 ? 'empty' : 'partial', menuCount: present }
}

async function initializeMenus(db) {
  let permissionsAdded = 0
  let menusAdded = 0
  for (const permission of permissionSeeds()) {
    if (await insertMissing(db, 'uni-id-permissions', 'permission_id', permission)) permissionsAdded++
  }
  for (const menu of menus) {
    if (await insertMissing(db, 'opendb-admin-menus', 'menu_id', menu)) menusAdded++
  }
  return { menusAdded, permissionsAdded, ...(await menuState(db)) }
}

module.exports = { fail, rows, hasAdmin, getGuard, withFirstAdminGuard, menuState, initializeMenus }
