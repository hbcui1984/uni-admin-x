// 仅运行 unittest。没有真实号码、短信配置、网络请求或实际发送。
const calls = [
  ['createSmsTask', [{ type: 'user', receiver: ['mock-recipient'] }, 'mock-template', []]],
  ['createUserSmsMessage', ['mock-task']],
  ['sendSms', ['mock-task']],
  ['template', []],
  ['task', ['mock-task']],
  ['updateTemplates', [[{ templateId: 'mock-template', templateName: 'mock' }]]],
  ['preview', [{ type: 'user', receiver: ['mock-recipient'] }, 'mock-template', []]]
];
const businessCollections = ['batch-sms-template', 'batch-sms-task', 'batch-sms-result',
  'opendb-sms-template', 'opendb-sms-task', 'opendb-sms-log'];
let checkedTokens;
let smsCalls;
let user;
let tokenResult;

beforeEach(() => {
  checkedTokens = [];
  smsCalls = 0;
  user = { _id: 'mock-operator', status: 0, role: ['admin'] };
  tokenResult = { errCode: 0, uid: 'mock-operator', role: ['admin'] };
  uniCloudTest.mockModule('uni-id-common', {
    createInstance: () => ({
      checkToken: async (token, options) => {
        checkedTokens.push({ token, options });
        if (token === 'mock-expired') return { errCode: 'uni-id-token-expired' };
        if (token === 'mock-invalid') return { errCode: 'uni-id-check-token-failed' };
        if (token === 'mock-throw') throw new Error('mock-sensitive-token-error');
        return tokenResult;
      }
    })
  });
  uniCloudTest.db.collection('uni-id-users').get.mockImplementation(query => {
    if (!query.doc) throw new Error('Unexpected business user query');
    return { data: user ? [user] : [] };
  });
  for (const name of businessCollections) {
    for (const operation of ['get', 'count', 'add', 'update', 'set', 'remove']) {
      uniCloudTest.db.collection(name)[operation].mockImplementation(() => {
        throw new Error('Unexpected SMS business operation');
      });
    }
  }
  uniCloudTest.mock('sendSms', () => {
    smsCalls++;
    throw new Error('SMS is forbidden in authorization tests');
  });
  uniCloudTest.mockRequest(() => {
    throw new Error('HTTP is forbidden in authorization tests');
  });
});

function expectNoBusinessAccess() {
  expect(smsCalls).toBe(0);
  for (const name of businessCollections) {
    for (const operation of ['get', 'count', 'add', 'update', 'set', 'remove']) {
      expect(uniCloudTest.db.collection(name)[operation]).not.toHaveBeenCalled();
    }
  }
  for (const operation of ['add', 'update', 'set', 'remove', 'count']) {
    expect(uniCloudTest.db.collection('uni-id-users')[operation]).not.toHaveBeenCalled();
  }
}

for (const [method, args] of calls) {
  for (const token of [null, 'mock-expired', 'mock-invalid', 'mock-throw']) {
    test(`${method}: 拒绝 ${token || '匿名'}，身份核验先于适配器和业务副作用`, async () => {
      const api = uniCloudTest.importObject('uni-sms-co', token ? { token } : {});
      const result = await api[method](...args);
      expect(result.errCode).toBe('uni-sms-co-auth-required');
      expect(JSON.stringify(result)).not.toContain('mock-sensitive');
      expect(uniCloudTest.db.collection('uni-id-users').get).not.toHaveBeenCalled();
      expectNoBusinessAccess();
    });
  }

  const cases = [
    ['普通 token 角色', () => { tokenResult.role = ['member']; }],
    ['token 角色不是数组', () => { tokenResult.role = 'admin'; }],
    ['token admin 但数据库降权', () => { user.role = ['member']; }],
    ['数据库角色不是数组', () => { user.role = 'admin'; }],
    ['禁用账号', () => { user.status = 1; }],
    ['注销账号', () => { user.status = 4; }],
    ['缺少正常状态', () => { delete user.status; }],
    ['已删除账号', () => { user = null; }],
    ['数据库返回不同 uid', () => { user._id = 'mock-other-user'; }]
  ];
  for (const [label, arrange] of cases) {
    test(`${method}: 拒绝${label}`, async () => {
      arrange();
      const result = await uniCloudTest.importObject('uni-sms-co', { token: 'mock-valid' })[method](...args);
      expect(result.errCode).toBe('uni-sms-co-permission-denied');
      expectNoBusinessAccess();
    });
  }
}

test('身份数据库不可用或响应异常时默认拒绝且不透出内部错误', async () => {
  const get = uniCloudTest.db.collection('uni-id-users').get;
  const api = uniCloudTest.importObject('uni-sms-co', { token: 'mock-valid' });
  get.mockRejectedValueOnce(new Error('mock-sensitive-database-error'));
  expect(await api.template()).toEqual({ errCode: 'uni-sms-co-auth-unavailable', errMsg: '暂时无法核验管理员身份，请稍后重试' });
  get.mockResolvedValueOnce({});
  expect((await api.template()).errCode).toBe('uni-sms-co-auth-unavailable');
  expectNoBusinessAccess();
});

test('有效管理员仅在 token 和数据库复核完成后进入适配器和模板只读路径', async () => {
  const order = [];
  uniCloudTest.db.collection('uni-id-users').get.mockImplementation(query => {
    order.push('identity');
    expect(query).toMatchObject({ doc: 'mock-operator', field: { _id: true, status: true, role: true } });
    return { data: [user] };
  });
  uniCloudTest.db.collection('batch-sms-template').count.mockImplementation(() => {
    order.push('adapter');
    return { total: 0 };
  });
  uniCloudTest.db.collection('opendb-sms-template').get.mockImplementation(() => {
    order.push('method');
    return { data: [] };
  });
  expect(await uniCloudTest.importObject('uni-sms-co', { token: 'mock-valid' }).template()).toEqual([]);
  expect(order).toEqual(['identity', 'adapter', 'method']);
  expect(checkedTokens).toEqual([{ token: 'mock-valid', options: { autoRefresh: false } }]);
  expect(smsCalls).toBe(0);
});

test('管理员 token 过期/角色过时后，每次请求重新核验而不缓存放行', async () => {
  uniCloudTest.db.collection('batch-sms-template').count.mockResolvedValue({ total: 0 });
  uniCloudTest.db.collection('opendb-sms-template').get.mockResolvedValue({ data: [] });
  const api = uniCloudTest.importObject('uni-sms-co', { token: 'mock-valid' });
  await api.template();
  user.role = ['member'];
  expect((await api.template()).errCode).toBe('uni-sms-co-permission-denied');
  expect(checkedTokens).toHaveLength(2);
  expect(uniCloudTest.db.collection('batch-sms-template').count).toHaveBeenCalledTimes(1);
  expect(uniCloudTest.db.collection('opendb-sms-template').get).toHaveBeenCalledTimes(1);
  expect(smsCalls).toBe(0);
});

const safeAdminCalls = [
  ['createSmsTask', [{}, '', []], 'uni-sms-co-template-id-required'],
  ['createUserSmsMessage', ['mock-missing-task'], 'uni-sms-co-task-id-not-found'],
  ['sendSms', ['mock-empty-task'], 0],
  ['template', [], undefined],
  ['task', ['mock-missing-task'], null],
  ['updateTemplates', [[]], 'uni-sms-co-template-is-null'],
  ['preview', [{ type: 'user', receiver: ['mock-recipient'] }, 'mock-template', []], 'uni-sms-co-users-is-null']
];
for (const [method, args, expectedCode] of safeAdminCalls) {
  test(`${method}: 有效管理员可进入原业务的无发送/无写入分支`, async () => {
    uniCloudTest.db.collection('batch-sms-template').count.mockResolvedValue({ total: 0 });
    uniCloudTest.db.collection('opendb-sms-template').get.mockResolvedValue({ data: [] });
    uniCloudTest.db.collection('opendb-sms-task').get.mockImplementation(query => ({
      data: query.where?._id === 'mock-empty-task' ? [{ _id: 'mock-empty-task', vars: [] }] : []
    }));
    uniCloudTest.db.collection('opendb-sms-log').get.mockResolvedValue({ data: [] });
    uniCloudTest.db.collection('uni-id-users').get.mockImplementation(query => ({ data: query.doc ? [user] : [] }));
    uniCloudTest.db.collection('uni-id-users').count.mockResolvedValue({ total: 0 });
    const result = await uniCloudTest.importObject('uni-sms-co', { token: 'mock-valid' })[method](...args);
    if (expectedCode === null) expect(result).toBeNull();
    else if (expectedCode === undefined) expect(result).toEqual([]);
    else expect(result.errCode).toBe(expectedCode);
    expect(checkedTokens).toHaveLength(1);
    expect(smsCalls).toBe(0);
    for (const name of [...businessCollections, 'uni-id-users']) {
      for (const operation of ['add', 'update', 'set', 'remove']) {
        expect(uniCloudTest.db.collection(name)[operation]).not.toHaveBeenCalled();
      }
    }
  });
}

test('七个公开方法均被覆盖，前置处理第一步必须等待鉴权，不能按 source/uid 绕过', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ts = require('/Applications/HBuilderX-Alpha.app/Contents/HBuilderX/plugins/compile-typescript/node_modules/typescript');
  const source = ts.createSourceFile('index.obj.js', fs.readFileSync(path.join(__dirname, 'index.obj.js'), 'utf8'), ts.ScriptTarget.Latest, true);
  let exportsObject;
  let authFunction;
  for (const statement of source.statements) {
    if (ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression) &&
      statement.expression.left.getText(source) === 'module.exports') exportsObject = statement.expression.right;
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === 'requireSmsAdmin') authFunction = statement;
  }
  expect(exportsObject).toBeDefined();
  expect(exportsObject.properties.map(property => property.name.text).filter(name => !name.startsWith('_')).sort())
    .toEqual(calls.map(([method]) => method).sort());
  const before = exportsObject.properties.find(property => property.name.text === '_before').initializer;
  expect(before.body.statements[0].getText(source)).toBe('await requireSmsAdmin(this);');
  const authSource = authFunction.getText(source);
  expect(authSource).toContain('context.getUniIdToken()');
  expect(authSource).toContain('.doc(payload.uid)');
  expect(authSource).not.toMatch(/\.source|\.uid\s*===\s*context|clientInfo\.uid|getMethodName/);
  // 未使用的短信配置读取已移除；静态检查不加载配置中心或任何真实配置。
  expect(source.text).not.toContain('createConfig');
  expect(source.text).not.toContain('smsConfig');
});
