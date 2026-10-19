const {
  findUser
} = require('../../lib/utils/account')
const {
  ERROR
} = require('../../common/error')
const {
  userCollection
} = require('../../common/constants')
const PasswordUtils = require('../../lib/utils/password')

/**
 * 修改用户
 * @tutorial https://uniapp.dcloud.net.cn/uniCloud/uni-id-pages.html#update-user
 * @param {Object}  params
 * @param {String}  params.uid            要更新的用户id
 * @param {String}  params.username       用户名
 * @param {String}  params.password       密码
 * @param {String}  params.nickname       昵称
 * @param {Array}   params.authorizedApp  允许登录的AppID列表
 * @param {Array}   params.role           用户角色列表
 * @param {String}  params.mobile         手机号
 * @param {String}  params.email          邮箱
 * @param {Array}   params.tags           用户标签
 * @param {Number}  params.status         用户状态
 * @returns
 */
module.exports = async function (params = {}) {
  const schema = {
    uid: 'string',
    username: 'username',
    password: {
      required: false,
      type: 'password'
    },
    authorizedApp: {
      required: false,
      type: 'array<string>'
    }, // 指定允许登录的app，传空数组或不传时表示可以不可以在任何端登录
    nickname: {
      required: false,
      type: 'nickname'
    },
    role: {
      require: false,
      type: 'array<string>'
    },
    mobile: {
      required: false,
      type: 'mobile'
    },
    email: {
      required: false,
      type: 'email'
    },
    tags: {
      required: false,
      type: 'array<string>'
    },
    status: {
      required: false,
      type: 'number'
    }
  }

  this.middleware.validate(params, schema)

  const {
    uid,
    username,
    password,
    authorizedApp,
    nickname,
    role,
    mobile,
    email,
    tags,
    status
  } = params

  // 不沿用中间件缓存的角色，避免旧 token 在数据库降权后继续管理用户。
  const verified = await this.uniIdCommon.checkToken(this.getUniIdToken(), { autoRefresh: false })
  if (!verified || verified.errCode || !verified.uid) {
    throw { errCode: 'uni-id-check-token-failed' }
  }
  const actorResult = await userCollection.doc(verified.uid).field({ _id: true, role: true, status: true }).get()
  const actor = actorResult && Array.isArray(actorResult.data) && actorResult.data[0]
  if (!actorResult || actorResult.errCode || !actor || actor._id !== verified.uid ||
    (actor.status !== undefined && actor.status !== 0) || !Array.isArray(actor.role) || !actor.role.includes('admin')) {
    throw { errCode: ERROR.PERMISSION_ERROR }
  }
  if (uid === verified.uid) {
    if (status !== undefined && status !== 0) {
      throw { errCode: 'USER_UPDATE_SELF_DISABLED', errMsg: '不能停用当前登录账号' }
    }
    if (role !== undefined && !role.includes('admin')) {
      throw { errCode: 'USER_UPDATE_SELF_DEMOTION', errMsg: '不能移除当前登录账号的管理员角色' }
    }
  }

  // 更新的用户数据字段
  const data = {
    username,
    dcloud_appid: authorizedApp,
    nickname,
    role,
    mobile,
    email,
    tags,
    status
  }

  const realData = Object.keys(data).reduce((res, key) => {
    const item = data[key]
    if (item !== undefined) {
      res[key] = item
    }
    return res
  }, {})

  // 更新用户名时验证用户名是否重新
  if (username) {
    const {
      userMatched
    } = await findUser({
      userQuery: {
        username
      },
      authorizedApp
    })
    if (userMatched.filter(user => user._id !== uid).length) {
      throw {
        errCode: ERROR.ACCOUNT_EXISTS
      }
    }
  }
  if (password) {
    const passwordUtils = new PasswordUtils({
      clientInfo: this.getUniversalClientInfo(),
      passwordSecret: this.config.passwordSecret
    })
    const {
      passwordHash,
      version
    } = passwordUtils.generatePasswordHash({
      password
    })

    realData.password = passwordHash
    realData.password_secret_version = version
  }

  await userCollection.doc(uid).update(realData)

  return {
    errCode: 0
  }
}
