'use strict'

const uniIdCommon = require('uni-id-common')
const messages = {
  USER_DELETE_INVALID_ARGUMENT: '请提供 1 至 500 个有效用户 ID',
  USER_DELETE_AUTH_REQUIRED: '登录状态无效，请重新登录',
  USER_DELETE_ACCOUNT_UNAVAILABLE: '当前账号不存在或已停用',
  USER_DELETE_PERMISSION_DENIED: '没有删除用户的权限',
  USER_DELETE_SELF: '不能删除当前登录账号，整批操作已拒绝',
  USER_DELETE_NOT_FOUND: '部分用户不存在，请刷新列表后重试',
  USER_DELETE_LAST_ADMIN: '必须保留至少一个正常状态的管理员',
  USER_DELETE_RESOURCE_ERROR: '删除结果无法确认，请刷新列表核查，勿自动重试'
}

function fail(errCode) {
  return { errCode, errMsg: messages[errCode] }
}

function rows(result) {
  if (!result || result.errCode || !Array.isArray(result.data)) throw fail('USER_DELETE_RESOURCE_ERROR')
  return result.data
}

function normal(user) {
  return user && (user.status === undefined || user.status === 0)
}

async function authorize(context, db) {
  const token = context.getUniIdToken()
  if (!token) throw fail('USER_DELETE_AUTH_REQUIRED')
  let payload
  try {
    payload = await uniIdCommon.createInstance({ clientInfo: context.getClientInfo() })
      .checkToken(token, { autoRefresh: false })
  } catch (_) { throw fail('USER_DELETE_AUTH_REQUIRED') }
  if (!payload || payload.errCode || typeof payload.uid !== 'string' || !payload.uid) {
    throw fail('USER_DELETE_AUTH_REQUIRED')
  }
  const records = rows(await db.collection('uni-id-users').doc(payload.uid)
    .field({ _id: true, role: true, status: true }).get())
  const user = records[0]
  if (records.length !== 1 || !normal(user) || user._id !== payload.uid) {
    throw fail('USER_DELETE_ACCOUNT_UNAVAILABLE')
  }
  if (!Array.isArray(user.role) || !user.role.every(role => typeof role === 'string')) {
    throw fail('USER_DELETE_PERMISSION_DENIED')
  }
  if (user.role.includes('admin')) return payload.uid
  // 权限取自数据库当前角色，不信任客户端或 token 中的过期权限。
  if (!user.role.length || user.role.length > 500) throw fail('USER_DELETE_PERMISSION_DENIED')
  const roles = rows(await db.collection('uni-id-roles').where({ role_id: db.command.in(user.role) })
    .field({ role_id: true, permission: true }).limit(500).get())
  if (!roles.some(role => user.role.includes(role.role_id) && Array.isArray(role.permission) &&
    role.permission.includes('DELETE_UNI_ID_USERS'))) throw fail('USER_DELETE_PERMISSION_DENIED')
  return payload.uid
}

async function checkBatch(db, ids) {
  const users = rows(await db.collection('uni-id-users').where({ _id: db.command.in(ids) })
    .field({ _id: true, role: true, status: true }).limit(500).get())
  if (users.length !== ids.length || new Set(users.map(user => user._id)).size !== ids.length ||
    users.some(user => !ids.includes(user._id))) throw fail('USER_DELETE_NOT_FOUND')
  if (users.some(user => !Array.isArray(user.role) && user.role !== undefined)) {
    throw fail('USER_DELETE_RESOURCE_ERROR')
  }
  if (users.some(user => Array.isArray(user.role) && user.role.includes('admin'))) {
    const survivors = rows(await db.collection('uni-id-users').where({
      _id: db.command.nin(ids), role: db.command.all(['admin'])
    }).field({ _id: true, role: true, status: true }).limit(500).get())
    if (!survivors.some(user => !ids.includes(user._id) && typeof user._id === 'string' &&
      normal(user) && Array.isArray(user.role) && user.role.includes('admin'))) {
      throw fail('USER_DELETE_LAST_ADMIN')
    }
  }
}

module.exports = async function removeUsers(context, args) {
  try {
    const input = args[0]
    if (args.length !== 1 || !Array.isArray(input) || !input.length || input.length > 500 ||
      input.some(id => typeof id !== 'string' || !id.trim() || id !== id.trim() || id.length > 128)) {
      throw fail('USER_DELETE_INVALID_ARGUMENT')
    }
    const ids = [...new Set(input)]
    const db = uniCloud.database()
    const uid = await authorize(context, db)
    if (ids.includes(uid)) throw fail('USER_DELETE_SELF')
    await checkBatch(db, ids)
    if (await authorize(context, db) !== uid) throw fail('USER_DELETE_AUTH_REQUIRED')
    // 单次整批删除，不通过筛除本人或未知 ID 形成部分成功；并发边界见交付说明。
    const result = await db.collection('uni-id-users').where({ _id: db.command.in(ids) }).remove()
    if (!result || result.errCode || result.deleted !== ids.length) throw fail('USER_DELETE_RESOURCE_ERROR')
    return { errCode: 0, errMsg: '', deletedCount: result.deleted }
  } catch (error) {
    const code = error && error.errCode
    return { ...fail(Object.prototype.hasOwnProperty.call(messages, code) ? code : 'USER_DELETE_RESOURCE_ERROR'),
      deletedCount: null }
  }
}
