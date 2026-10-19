// 仅 unittest；所有账号、token 和数据库结果均为虚构 mock。
let actor
let targets
let survivors
let roles
let checked
let tokenPayload

function api(token = 'mock-delete-token') {
  return uniCloudTest.importObject('uni-admin-co', { token })
}

beforeEach(() => {
  actor = { _id: 'mock-actor', role: ['admin'], status: 0 }
  targets = [{ _id: 'mock-target', role: [], status: 0 }]
  survivors = [{ _id: 'mock-survivor', role: ['admin'], status: 0 }]
  roles = []
  checked = 0
  tokenPayload = { errCode: 0, uid: 'mock-actor', role: ['admin'] }
  uniCloudTest.mockModule('uni-id-common', {
    createInstance: () => ({ checkToken: async () => { checked++; return tokenPayload } })
  })
  uniCloudTest.db.collection('uni-id-users').get.mockImplementation(query => {
    if (query.doc) return { data: actor ? [actor] : [] }
    if (query.where && query.where.role) return { data: survivors }
    return { data: targets }
  })
  uniCloudTest.db.collection('uni-id-roles').get.mockImplementation(() => ({ data: roles }))
  uniCloudTest.db.collection('uni-id-users').remove.mockImplementation(() => ({ deleted: targets.length }))
})

async function refused(ids, code, object = api()) {
  expect(await object.removeUsers(ids)).toMatchObject({ errCode: code, deletedCount: null })
  expect(uniCloudTest.db.collection('uni-id-users').remove).not.toHaveBeenCalled()
}

test('缺少或无效 token 拒绝', async () => {
  await refused(['mock-target'], 'USER_DELETE_AUTH_REQUIRED', api(''))
  tokenPayload = { errCode: 'mock-invalid' }
  await refused(['mock-target'], 'USER_DELETE_AUTH_REQUIRED')
})

test('拒绝无权限及数据库已禁用账号', async () => {
  actor.role = ['member']
  await refused(['mock-target'], 'USER_DELETE_PERMISSION_DENIED')
  actor.status = 1
  await refused(['mock-target'], 'USER_DELETE_ACCOUNT_UNAVAILABLE')
})

test('本人单删、混合批删整批拒绝，不查询目标也不删除', async () => {
  await refused(['mock-actor'], 'USER_DELETE_SELF')
  await refused(['mock-target', 'mock-actor'], 'USER_DELETE_SELF')
  expect(uniCloudTest.db.collection('uni-id-users').get.mock.calls.every(([query]) => !!query.doc)).toBe(true)
})

test('删除其它用户，重复 ID 去重且二次复核身份', async () => {
  expect(await api().removeUsers(['mock-target', 'mock-target'])).toEqual({ errCode: 0, errMsg: '', deletedCount: 1 })
  expect(checked).toBe(2)
  expect(uniCloudTest.db.collection('uni-id-users').remove).toHaveBeenCalledWith(expect.objectContaining({
    where: { _id: { $in: [['mock-target']] } }
  }))
})

test('兼容普通角色 DELETE_UNI_ID_USERS 权限，不依赖 token role', async () => {
  actor.role = ['operator']
  tokenPayload.role = []
  roles = [{ role_id: 'operator', permission: ['DELETE_UNI_ID_USERS'] }]
  expect((await api().removeUsers(['mock-target'])).errCode).toBe(0)
})

test('非最后管理员可删，最后一个及仅剩禁用管理员时拒绝', async () => {
  targets[0].role = ['admin']
  survivors = []
  await refused(['mock-target'], 'USER_DELETE_LAST_ADMIN')
  survivors = [{ _id: 'mock-disabled', role: ['admin'], status: 1 }]
  await refused(['mock-target'], 'USER_DELETE_LAST_ADMIN')
  survivors = [{ _id: 'mock-survivor', role: ['admin'], status: 0 }]
  expect((await api().removeUsers(['mock-target'])).errCode).toBe(0)
})

test('未知 ID、目标查询异常均在删除前失败关闭', async () => {
  await refused(['mock-target', 'mock-unknown'], 'USER_DELETE_NOT_FOUND')
  uniCloudTest.db.collection('uni-id-users').get.mockResolvedValue({})
  await refused(['mock-target'], 'USER_DELETE_RESOURCE_ERROR')
})

test('非法输入、身份冒充对象、超过500均拒绝', async () => {
  for (const ids of [null, [], 'mock-target', [''], [' mock-target'], [3], [{ uid: 'mock-target' }], Array(501).fill('mock-target')]) {
    await refused(ids, 'USER_DELETE_INVALID_ARGUMENT')
  }
  expect((await api().removeUsers(['mock-target'], { uid: 'mock-other', role: ['admin'] })).errCode)
    .toBe('USER_DELETE_INVALID_ARGUMENT')
})

test('执行期间数据库身份降权或禁用，二次复核拒绝', async () => {
  uniCloudTest.db.collection('uni-id-users').get.mockImplementation(query => {
    if (query.doc) return { data: [{ ...actor, role: checked > 1 ? ['member'] : ['admin'] }] }
    return { data: targets }
  })
  await refused(['mock-target'], 'USER_DELETE_PERMISSION_DENIED')
})

test('删除返回数量不符或异常，绝不报告成功且不泄露底层错误', async () => {
  for (const result of [{ deleted: 0 }, {}, { deleted: 1, errCode: 'mock-error' }]) {
    uniCloudTest.db.collection('uni-id-users').remove.mockResolvedValueOnce(result)
    expect(await api().removeUsers(['mock-target'])).toMatchObject({ errCode: 'USER_DELETE_RESOURCE_ERROR', deletedCount: null })
  }
  uniCloudTest.db.collection('uni-id-users').remove.mockRejectedValueOnce(new Error('mock-private-sentinel'))
  expect(JSON.stringify(await api().removeUsers(['mock-target']))).not.toContain('mock-private-sentinel')
})

test('500个有效目标一次整批删除', async () => {
  targets = Array.from({ length: 500 }, (_, index) => ({ _id: `mock-target-${index}`, role: [] }))
  expect(await api().removeUsers(targets.map(user => user._id))).toMatchObject({ errCode: 0, deletedCount: 500 })
  expect(uniCloudTest.db.collection('uni-id-users').remove).toHaveBeenCalledTimes(1)
})

test('混合批次删除所有可用管理员时整批拒绝', async () => {
  actor.role = ['operator']
  roles = [{ role_id: 'operator', permission: ['DELETE_UNI_ID_USERS'] }]
  targets = [{ _id: 'mock-admin-a', role: ['admin'] }, { _id: 'mock-admin-b', role: ['admin'] },
    { _id: 'mock-target', role: [] }]
  survivors = []
  await refused(targets.map(user => user._id), 'USER_DELETE_LAST_ADMIN')
})

test('第二次校验 token 身份变化拒绝', async () => {
  uniCloudTest.mockModule('uni-id-common', {
    createInstance: () => ({ checkToken: async () => {
      checked++
      return { errCode: 0, uid: checked > 1 ? 'mock-changed' : 'mock-actor' }
    } })
  })
  uniCloudTest.db.collection('uni-id-users').get.mockImplementation(query => {
    if (query.doc) return { data: [{ ...actor, _id: query.doc }] }
    return { data: targets }
  })
  await refused(['mock-target'], 'USER_DELETE_AUTH_REQUIRED')
})

test('复核时账号禁用或删除权限被收回均拒绝', async () => {
  uniCloudTest.db.collection('uni-id-users').get.mockImplementation(query => {
    if (query.doc) return { data: [{ ...actor, status: checked > 1 ? 1 : 0 }] }
    return { data: targets }
  })
  await refused(['mock-target'], 'USER_DELETE_ACCOUNT_UNAVAILABLE')
})
