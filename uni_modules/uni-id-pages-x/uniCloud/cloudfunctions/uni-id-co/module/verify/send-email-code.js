module.exports = async function () {
  throw { errCode: 'EMAIL_SERVICE_UNAVAILABLE', errMsg: '邮箱验证码服务未启用' }
}
