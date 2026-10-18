import type { AdminRegistrationStatusResponse } from './admin-registration-types'

export const adminRegisterPath = '/uni_modules/uni-id-pages-x/pages/register/register-admin'

export async function getAdminRegistrationStatus(): Promise<AdminRegistrationStatusResponse> {
  if (uniCloud.config == null) throw new Error('管理员状态检查不可用')
  const account = uniCloud.importObject('uni-id-co', { customUI: true })
  if (account == null) throw new Error('本地账号服务不可用')
  return await account.getAdminRegistrationStatus<AdminRegistrationStatusResponse>()
}

export function registrationStatusKnown(status: AdminRegistrationStatusResponse | null): boolean {
  return status != null && status.errCode === 0 && typeof status.hasAdmin === 'boolean' &&
    typeof status.canRegisterAdmin === 'boolean' && typeof status.registrationBlocked === 'boolean'
}

export function firstAdminRegistrationOpen(status: AdminRegistrationStatusResponse | null): boolean {
  return registrationStatusKnown(status) && status!.hasAdmin === false &&
    status!.canRegisterAdmin && !status!.registrationBlocked
}
