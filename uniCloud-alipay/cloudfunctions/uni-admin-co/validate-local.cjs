'use strict'

// 仅静态读取明确列出的源码和公开 schema，不加载云函数、配置中心或 manifest。
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '../../..')
const pluginRoot = process.argv[2]
if (!pluginRoot) throw new Error('请传入 HBuilderX plugins 目录作为第一个参数')
const Ajv = require(path.join(pluginRoot, 'node_modules/ajv'))
const ts = require(path.join(pluginRoot, 'compile-typescript/node_modules/typescript'))
const ajv = new Ajv({ allErrors: true, strict: false })
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'))
const official = 'uni_modules/uni-id-pages-x/uniCloud/cloudfunctions/uni-id-co'
const base = 'uniCloud-alipay/cloudfunctions'
const jsFiles = [
  `${base}/uni-admin-co/index.obj.js`, `${base}/uni-admin-co/uni-admin-co.test.js`,
  `${base}/uni-admin-co/validate-local.cjs`, `${base}/common/uni-admin-setup/index.js`,
  `${official}/module/register/register-admin.js`
]
for (const file of jsFiles) execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' })
for (const file of [`${base}/uni-admin-co/package.json`, `${base}/common/uni-admin-setup/package.json`, `${official}/package.json`]) readJson(file)

function projectSchema(schema) {
  const projected = {}
  if (schema.bsonType) projected.type = ({ int: 'integer', long: 'integer', timestamp: 'number', bool: 'boolean' })[schema.bsonType] || schema.bsonType
  if (schema.required) projected.required = schema.required
  if (schema.enum) projected.enum = schema.enum
  if (schema.properties) projected.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, projectSchema(value)]))
  return projected
}

const guard = readJson('uniCloud-alipay/database/uni-admin-setup-guard.schema.json')
assert.deepEqual(guard.permission, { read: false, create: false, update: false, delete: false })
const guardValidator = ajv.compile(projectSchema(guard))
for (const source of ['claim', 'register']) {
  for (const state of ['pending', 'completed', 'failed', 'blocked']) {
    assert(guardValidator({ _id: 'first-admin-v1', source, state, created_at: 1, updated_at: 1 }))
  }
}
assert.equal(guardValidator({ source: 'client', state: 'pending', created_at: 1, updated_at: 1 }), false)
const menus = readJson(`${base}/common/uni-admin-setup/menus.json`)
const menuValidator = ajv.compile(projectSchema(readJson('uniCloud-alipay/database/opendb-admin-menus.schema.json')))
assert.equal(menus.length, 9)
assert.equal(new Set(menus.map(menu => menu.menu_id)).size, menus.length)
const allowedRoutes = ['', '/pages/index/index', ...['user', 'role', 'permission', 'menu', 'tag', 'app', 'safety'].map(name => `/pages/system/${name}/list`)]
for (const menu of menus) {
  assert(menuValidator(menu), JSON.stringify(menuValidator.errors))
  assert(allowedRoutes.includes(menu.url))
  assert(!menu.parent_id || menus.some(parent => parent.menu_id === menu.parent_id))
  if (menu.url.includes('/system/') && menu.menu_id !== 'system_menu') assert(menu.permission[0].startsWith('READ_'))
}
assert.deepEqual(menus.find(menu => menu.menu_id === 'system_menu').permission,
  ['CREATE_OPENDB_ADMIN_MENUS', 'UPDATE_OPENDB_ADMIN_MENUS', 'DELETE_OPENDB_ADMIN_MENUS'])
assert.deepEqual(menus.find(menu => menu.menu_id === 'system_safety'), {
  menu_id: 'system_safety', parent_id: 'system_management', name: '用户日志',
  url: '/pages/system/safety/list', icon: 'admin-icons-safety', sort: 1050,
  enable: true, permission: ['READ_UNI_ID_LOG']
})
const index = readJson('uniCloud-alipay/database/opendb-admin-menus.index.json')
assert(index.some(item => item.MgoKeySchema.MgoIsUnique && item.MgoKeySchema.MgoIndexKeys.some(key => key.Name === 'menu_id')))

const typeFile = path.join(root, 'common/admin-setup-types.ts')
const program = ts.createProgram([typeFile], { noEmit: true, strict: true, skipLibCheck: true, types: [] })
const diagnostics = ts.getPreEmitDiagnostics(program)
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: name => name, getCurrentDirectory: () => root, getNewLine: () => '\n'
}))
console.log(`静态验证通过：${jsFiles.length} 个 JS/CJS、3 个 package.json、菜单/guard schema 投影与样本、唯一索引、TS 类型。`)
console.log('schema 权限表达式与支付宝云服务端实际执行兼容性未连接云空间验证。')
