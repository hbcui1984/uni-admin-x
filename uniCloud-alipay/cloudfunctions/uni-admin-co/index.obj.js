'use strict'

const uniIdCommon = require('uni-id-common')
const setup = require('uni-admin-setup')
const removeUsers = require('./remove-users')

function checkArguments(args) {
  if (args.length) throw setup.fail('SETUP_INVALID_ARGUMENT')
}

function publicError(error) {
  const code = error && error.errCode
  return setup.fail(typeof code === 'string' && code.startsWith('SETUP_') ? code : 'SETUP_RESOURCE_ERROR')
}

async function identity(context, db, required) {
  const token = context.getUniIdToken()
  if (!token) {
    if (required) throw setup.fail('SETUP_AUTH_REQUIRED')
    return null
  }
  const payload = await uniIdCommon.createInstance({ clientInfo: context.getClientInfo() })
    .checkToken(token, { autoRefresh: false })
  if (!payload || payload.errCode || typeof payload.uid !== 'string' || !payload.uid) {
    throw setup.fail('SETUP_AUTH_REQUIRED')
  }
  const user = setup.rows(await db.collection('uni-id-users').doc(payload.uid)
    .field({ _id: true, role: true, status: true }).get())[0]
  if (!user || (user.status !== undefined && user.status !== 0)) {
    throw setup.fail('SETUP_ACCOUNT_UNAVAILABLE')
  }
  return { uid: payload.uid, tokenRole: payload.role, user }
}

function isAdmin(auth) {
  return !!auth && Array.isArray(auth.tokenRole) && auth.tokenRole.includes('admin') &&
    Array.isArray(auth.user.role) && auth.user.role.includes('admin')
}

module.exports = {
  async removeUsers(...args) {
    return removeUsers(this, args)
  },

  async getSetupStatus(...args) {
    try {
      checkArguments(args)
      const db = uniCloud.database()
      const auth = await identity(this, db, false)
      const hasAdmin = await setup.hasAdmin(db)
      const guard = await setup.getGuard(db)
      const menu = await setup.menuState(db)
      return {
        errCode: 0, errMsg: '', hasAdmin,
        menuStatus: menu.menuStatus, menuCount: isAdmin(auth) ? menu.menuCount : null,
        currentUserIsAdmin: isAdmin(auth), canClaimAdmin: !!auth && !hasAdmin && !guard,
        canRegisterAdmin: !hasAdmin && !guard, setupBlocked: !hasAdmin && !!guard
      }
    } catch (error) {
      return { ...publicError(error), hasAdmin: null, menuStatus: 'unknown', menuCount: null,
        currentUserIsAdmin: false, canClaimAdmin: false, canRegisterAdmin: false, setupBlocked: true }
    }
  },

  async claimFirstAdmin(...args) {
    try {
      checkArguments(args)
      const db = uniCloud.database()
      const auth = await identity(this, db, true)
      return await setup.withFirstAdminGuard(db, 'claim', async () => {
        const result = await db.collection('uni-id-users').doc(auth.uid)
          .update({ role: db.command.addToSet('admin') })
        if (!result || result.updated !== 1) throw setup.fail('SETUP_RESOURCE_ERROR')
        return { errCode: 0, errMsg: '已认领首任管理员，请退出后重新登录以刷新 token 和导航', requiresRelogin: true }
      })
    } catch (error) {
      return { ...publicError(error), requiresRelogin: true }
    }
  },

  async initializeMenus(...args) {
    try {
      checkArguments(args)
      const db = uniCloud.database()
      const auth = await identity(this, db, true)
      if (!isAdmin(auth)) throw setup.fail('SETUP_ADMIN_REQUIRED')
      const result = await setup.initializeMenus(db)
      return { errCode: 0, errMsg: '基础菜单已补齐，请重新登录并刷新导航', ...result, requiresRelogin: true }
    } catch (error) {
      return { ...publicError(error), menusAdded: null, permissionsAdded: null,
        menuStatus: 'unknown', menuCount: null, requiresRelogin: false }
    }
  }
}
