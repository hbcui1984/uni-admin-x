const { db } = require('../../common/constants')
const { withFirstAdminGuard } = require('uni-admin-setup')
const {
  preRegisterWithPassword,
  postRegister
} = require('../../lib/utils/register')

/**
 * 注册管理员
 * @tutorial https://uniapp.dcloud.net.cn/uniCloud/uni-id-pages.html#register-admin
 * @param {Object} params
 * @param {String} params.username   用户名
 * @param {String} params.password   密码
 * @param {String} params.nickname   昵称
 * @returns
 */
module.exports = async function (params = {}) {
  const schema = {
    username: 'username',
    password: 'password',
    nickname: {
      type: 'nickname',
      required: false
    }
  }
  this.middleware.validate(params, schema)
  const {
    username,
    password,
    nickname
  } = params
  const {
    user,
    extraData
  } = await preRegisterWithPassword.call(this, {
    user: {
      username
    },
    password
  })
  return withFirstAdminGuard(db, 'register', async () => {
    const result = await postRegister.call(this, {
      user,
      extraData: {
        ...extraData,
        nickname,
        role: ['admin']
      }
    })
    return result
  })
}
