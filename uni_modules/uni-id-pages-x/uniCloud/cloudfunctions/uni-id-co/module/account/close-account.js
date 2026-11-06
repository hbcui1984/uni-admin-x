module.exports = async function () {
  throw { errCode: 'ACCOUNT_DEACTIVATION_DISABLED', errMsg: '账号注销暂未开放' }
}
