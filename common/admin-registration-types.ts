// 直接作为云对象方法泛型传入，不使用 ApiResponse<T> 等嵌套泛型。
export type AdminRegistrationStatusResponse = {
  errCode: number | string
  errMsg: string
  hasAdmin: boolean | null
  canRegisterAdmin: boolean
  registrationBlocked: boolean
}

// 零参数、公开只读，不受本机残留 token 影响，不通过 getSetupStatus 检测首任注册。
// uniCloud.importObject('uni-id-co').getAdminRegistrationStatus<AdminRegistrationStatusResponse>()
// 仅 errCode === 0 && hasAdmin === false && canRegisterAdmin && !registrationBlocked 时显示注册入口。
// hasAdmin === true 时隐藏注册入口，提供登录；未知/异常状态关闭注册，不得推断无管理员。
// guard 存在即阻止注册，包括 pending / failed / blocked / completed，不自动回收。
// registerAdmin 保留旧版响应，成功后返回登录页，不要求自动登录；claimFirstAdmin 仍须重新登录。
