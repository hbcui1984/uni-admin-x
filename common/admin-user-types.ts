// 仅 errCode === 0 确认成功；失败时 null 不代表删除了零条，禁止自动重试或退回 JQL。
export type RemoveUsersResponse = {
  errCode: number | string
  errMsg: string
  deletedCount: number | null
}
