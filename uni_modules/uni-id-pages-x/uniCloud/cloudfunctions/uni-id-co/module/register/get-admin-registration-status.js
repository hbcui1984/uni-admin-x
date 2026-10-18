const { db } = require('../../common/constants')
const { hasAdmin, getGuard, fail } = require('uni-admin-setup')

module.exports = async function () {
  const closed = { hasAdmin: null, canRegisterAdmin: false, registrationBlocked: true }
  if (arguments.length > 0) {
    return { ...fail('SETUP_INVALID_ARGUMENT'), ...closed }
  }
  try {
    const adminExists = await hasAdmin(db)
    const guard = await getGuard(db)
    return {
      errCode: 0,
      errMsg: '',
      hasAdmin: adminExists,
      canRegisterAdmin: !adminExists && !guard,
      registrationBlocked: adminExists || !!guard
    }
  } catch (_) {
    return { ...fail('SETUP_RESOURCE_ERROR'), ...closed }
  }
}
