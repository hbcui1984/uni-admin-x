# uni-id V2 本地安装迁移记录

## 范围与边界

- 日期：2026-10-16。项目为 uni-app x Vapor，优先 Web，云服务商为支付宝云。
- 复用本对话已成功获取的 info：未绑定云空间、未关联其他项目；未重复执行 info。
- 本次只安装和迁移本地文件；没有初始化、绑定、创建云空间，没有上传、执行云函数、查询数据库或访问业务。
- 未手工修改 pages.json、App.uvue、main.ts 或页面 UI。PC 宽屏适配交由前端代理；插件元数据 widescreen 为 x，不能视为开箱即用的 PC 后台。

## 安装来源与变更清单

1. 在已验证父目录的独立临时项目 `<临时项目>/uni-admin-x-id-v2-staging` 安装官方插件；该语义路径不属于仓库目录。
2. 使用后端及插件 skill，执行 `uni_module.js install uni-id-pages-x --project <临时项目>`，随后执行 inspect。安装器返回官方市场版本 2.0.1，内含 uni-id-co 1.1.28。
3. 将官方安装结果中的 `uni_modules/uni-id-pages-x` 原样复制到目标项目同名目录；不在目标项目运行安装器，以免自动合并页面和覆盖既有配置。
4. 原样移动 `uni_modules/uni-id-pages/uniCloud/cloudfunctions` 到 `legacy/uni-id-pages/uniCloud/cloudfunctions`。其中旧 uni-id-co 版本为 1.1.20，全部源码保留，但不再参与框架自动部署；归档后的相对 file 依赖不作为可运行安装处理。
5. 原样移动新版 `uni_modules/uni-id-pages-x/uniCloud/database` 到 `legacy/uni-id-pages-x-2.0.1/uniCloud/database`，保留官方 schema 快照，不部署重复资源。
6. 新增本记录；未修改业务后端、根 package.json 或任何既有公共模块配置、密钥。

没有删除旧代码。旧前端主要保留在 `uni_modules/uni-id-pages`；为消除 easycom 同名冲突，旧 `components/cloud-image/cloud-image.vue` 原样归档到 `legacy/uni-id-pages/components/cloud-image/cloud-image.vue`。旧云对象保存在上述 legacy 位置。不要把 legacy 放入 uni_modules 或 uniCloud 目录，也不要上传 legacy。

## 活动资源归属

- 唯一活动 uni-id-co：`uni_modules/uni-id-pages-x/uniCloud/cloudfunctions/uni-id-co`。
- 活动 schema 仍归属 `uni_modules/uni-id-pages/uniCloud/database`，共 8 份：users、roles、permissions、log、device、opendb-device、opendb-frv-logs、opendb-department。
- 其中新版自带的前 7 份与旧版比较，6 份 JSON 结构相同；users 唯一差异为新版删去 status=4 的“已注销”枚举及对应描述。保留旧版可避免管理端既有状态选项退化；新版云对象登录逻辑仍识别 status=4。
- 本阶段在本机保留根 `uniCloud-alipay/database` 下既有索引、初始化数据及其他业务资源，不自动导入任何 init_data。首次公开提交时另按 [安全文件清单](../SECURITY-FILES.md) 排除敏感初始化数据，原件仍保留在本机；schema、索引和菜单枚举数据继续留存。
- 没有将 uni_modules 云资源复制或移动到根 uniCloud-alipay。
- 后续更新官方插件可能重新带回 database，或更新旧插件后重新带回旧 uni-id-co；每次更新必须按本记录再次去重，不能直接全量上传。

## 依赖

8 个插件依赖已存在且与临时官方安装版本一致，因此全部复用、不覆盖：

- uni-captcha 0.8.3
- uni-cloud-s2s 1.0.1
- uni-config-center 0.0.3
- uni-id-common 1.0.19
- uni-open-bridge-common 1.2.1
- uni-popup 1.9.12
- uni-scss 1.0.3
- uni-transition 1.3.6

uni-id-co/package.json 的 5 个 file 依赖均指向各自 uni_modules 公共模块，并已验证目标 package.json 存在。不要再创建根目录同名公共模块。

## 前端接入交接

- 初始化：默认导入 `@/uni_modules/uni-id-pages-x/init.uts`，由应用启动入口调用一次。官方默认 debug=true，会请求 getSupportedLoginType；当前“不得访问业务”阶段不得实际执行初始化或登录请求。启用网络前由前端代理明确处理 debug 和运行时接入。
- Store：从 `@/uni_modules/uni-id-pages-x/store.uts` 导入 `state` 和 `mutations`。state 包含 isLogin、userInfo、pendingAgreements；`mutations.updateUserInfo(null)` 从云端刷新用户资料，传对象则合并资料，且部分分支会写数据库，不能把它当作纯本地赋值。
- 本地资料键为 `uni-id-pages-x-userInfo`；令牌使用 `uni_id_token` 和 `uni_id_token_expired`。不要混用旧 uni-id-pages 的 store。
- 登录页：`/uni_modules/uni-id-pages-x/pages/login/login`；注册页：`/uni_modules/uni-id-pages-x/pages/register/register`；找回密码：`/uni_modules/uni-id-pages-x/pages/retrieve/retrieve`；资料页：`/uni_modules/uni-id-pages-x/pages/userinfo/userinfo`。
- 登录回跳参数为 `uniIdRedirectUrl`，传编码后的目标路径；完整路由清单在插件 pages_init.json，由前端代理合并，本次未改 pages.json。
- `common/common.uts` 导出 loginSuccess、logout、checkPassword。登录事件 `uni-id-pages-x-login-success`、退出事件 `uni-id-pages-x-logout`，载荷为空字符串而非用户对象。登录成功事件触发时资料刷新可能尚未完成；权限身份取可信 token/后端鉴权，不依赖事件载荷。
- 插件 init 的路由拦截不能替代后台鉴权，也不能覆盖所有首屏、tab 和浏览器直接进入场景；管理端需要独立处理登录态及无权访问。

## 云对象请求与响应契约

所有方法均通过 `uniCloud.importObject('uni-id-co', { customUI: true })` 调用，customUI=true 时由调用方捕获异常并显示错误。不是 HTTP REST，也不是 `{code,data}` 包装。

- `login({username, password, captcha?})`：也可使用 mobile 或 email，但 username/mobile/email 只能选一个；成功返回 `{errCode:0,newToken:{token,tokenExpired},uid,passwordConfirmed}`。失败可能需要图形验证码，必须保留官方验证码交互，不自行绕过。
- `addUser({username,password,authorizedApp?,nickname?,role?,mobile?,email?,tags?,status?})`：username/password 必传；成功返回 `{errCode:0,errMsg:''}`，不返回新 uid，成功后刷新用户列表。
- `updateUser({uid,username,password?,authorizedApp?,nickname?,role?,mobile?,email?,tags?,status?})`：uid 和 username 必传；不改密码时完全省略 password，不传空串；省略的可选字段不更新，显式空数组会清空相应字段。成功返回 `{errCode:0}`。
- authorizedApp 对应数据库字段 dcloud_appid。创建时省略或传空数组将不能在任何应用登录；应用 AppID 使用占位符 `<YOUR_DCloud_APPID>`，需要允许该应用登录时应明确传入与本地 manifest 匹配的实际值，不在文档中记录真实值。
- addUser/updateUser 的服务端配置要求 admin 角色。只有 CREATE_UNI_ID_USERS/UPDATE_UNI_ID_USERS 权限但无 admin 的用户不能调用；不要为迁就 UI 自动放宽权限。
- 密码必须走云对象进行哈希，不能通过 clientDB 直接写 password。额外表单字段（如 department_id）不在这两个接口的参数契约中，不能假设透传即会保存；需要另行按既有 schema 权限设计保存流程。
- 错误通常抛出带 errCode/errMsg 的异常，errCode 可能为字符串；不要只判断数字错误码或假设所有失败都作为普通返回值。未联网实测。

UTS 新增接入代码必须对每个云对象方法显式传响应泛型，使用自包含的具体类型，禁止 ApiResponse<T> 等嵌套泛型：

```uts
type AddUserResponse = { errCode: number; errMsg: string }
type UpdateUserResponse = { errCode: number }
const userApi = uniCloud.importObject('uni-id-co', { customUI: true })
const created = await userApi.addUser<AddUserResponse>(payload)
const updated = await userApi.updateUser<UpdateUserResponse>(updatePayload)
```

登录响应应定义独立 LoginResponse，显式声明 uid、passwordConfirmed、errCode 和具体 newToken 结构；不能用泛型包装别名。官方前端包原始源码存在未指定泛型的调用，本次未修改页面或 UTS 接入代码，前端代理需在其负责的改动中核对，不应把官方原包视为已完成类型安全改造。

## 本地验证与未验证项

- 通过 node --check：新版、归档旧版云对象的后端 JS 共 259 个文件。
- 通过 JSON.parse：两套云对象 package.json、活动 8 份 schema、归档 7 份 schema 及相关 JSON 共 18 个文件。
- 8 个插件依赖及 5 个云对象 file 依赖均存在。
- 遍历活动 uni_modules 与 uniCloud-alipay，uni-id-co/index.obj.js 仅 1 份；users/roles/permissions schema 各 1 份。
- 按编译 skill 检查了 Web 运行状态，返回“未能获取日志：请先在 HBuilder 中启动项目”，并非明确的“未发现在指定平台运行的实例”；依照 skill 前置约束未继续启动编译，未运行应用或访问业务。前端编译和 PC 宽屏验收由前端代理统一完成。
- 未进行云端或本地云函数运行测试，没有真实账号登录、数据库读写或部署验证。

## 新测试云空间部署前提（本次未执行）

1. 用户另行创建并确认绑定全新支付宝测试云空间，确保不关联生产空间；本轮不创建、不绑定。
2. 人工审查现有 uni-config-center/uni-id/config.json，使用测试环境独立 tokenSecret/passwordSecret、匹配 AppID。不要直接沿用生产密钥；本次既有配置未读取输出、未覆盖。
3. 部署唯一活动的新 uni-id-co 和所需公共模块、活动旧 schema 及必要索引。不要上传 legacy，不要全量导入根 init_data，尤其需要先审查 users 等敏感初始化数据。
4. 按官方安全流程准备测试管理员并确认 admin 角色、应用授权、用户权限；不要为引导登录降低数据库权限。公共配置完整后再启用前端初始化及联网测试。
5. 核对 uni-captcha 配置和验证码资源；短信、第三方登录、实名认证、扩展存储等未启用能力不应冒用生产配置。云服务商为支付宝云不等于必须启用支付宝账号登录。
6. 完成 Web 编译、管理员登录、验证码、用户新增编辑、禁用状态、角色权限、退出回跳、PC 宽屏验证后，再评估其他平台。

## 补充：新测试空间从零准备超级管理员（只读核对，尚未执行）

### 官方依据及本地实现

- 官方本地知识库中的 `uniCloud/docs/uni-id/cloud-object.md:150` 明确记录 registerAdmin，参数为 username、password、可选 nickname，并注明系统仅允许一个超级管理员。
- 官方本地知识库中的 `uniCloud/docs/admin.md:276` 说明首次通过登录页链接创建超级管理员，完成后建议移除入口。
- 官方本地知识库中的 `uniCloud/docs/hellodb.md:550` 说明目录级“初始化数据库”会同时上传 schema、索引、init_data 等文件。因此本项目禁止直接对根 database 执行全量初始化。
- 当前官方 uni-id-pages-x 2.0.1 的 pages 和 pages_init.json 没有 register-admin 页面；普通 register 页面不能替代管理员创建。
- 当前 uni-id-co 1.1.28 的 index.obj.js:270 仍导出 registerAdmin；实现位于 module/register/register-admin.js。
- registerAdmin 在校验参数后先查询全空间 admin 用户，已有管理员时返回 `uni-id-admin-exists`，包括管理员只授权其他应用的情况。它不是“每个 AppID 可以分别创建一个首任管理员”。
- 当前接口没有强制登录或现有 admin 身份前置要求，也没有注册验证码校验；这是首次引导能力，不是应长期公开的普通注册入口。服务端现有管理员检查是必要约束，但源码是先查询后插入，没有原子唯一锁，不能承诺并发调用绝对只创建一个。
- postRegister 会在服务端哈希密码、写入 role=['admin']，将当前客户端 AppID 写入 dcloud_appid，创建 token 并写注册日志；无需也不应手工插入明文密码或预置 users 初始数据。

### hasAdmin 与登录方式检测的边界

- 新版 uni-id-co 没有导出的 hasAdmin 方法；已核对的官方 uni-id 文档也没有该接口。不要调用不存在的 uniIdCo.hasAdmin。
- getSupportedLoginType 返回 errCode、errMsg、supportedLoginType，仅检测登录方式；没有 hasAdmin 字段，不是 registerAdmin 的调用前提，也不证明管理员是否存在。
- 所有云对象方法都会先进入 _before：有效客户端 appId/uniPlatform、匹配的 uni-id 配置及依赖均须就绪。getSupportedLoginType 也不能绕过这些基础条件。
- 旧登录页 `uni_modules/uni-id-pages/pages/login/login-withpwd.vue:69` 通过 clientDB 对 role='admin' 计数；异常分支会设 existAdmin=false。迁移时不能沿用“网络/SDK/权限出错即无管理员”的判断。
- 可选管理员预检只有在用户另外允许联网后、SDK 可用且 schema 权限允许时才执行；失败必须标记“未知”，不能解锁初始化入口。客户端预检无论结果如何都不能替代 registerAdmin 的服务端检查。本次没有执行任何预检查询。

### 旧创建页能否迁移

- 可以复用旧 register-admin.vue 的官方 registerAdmin 请求流程和字段契约，但不能把该 Vue/旧 store 页面原样注册成 uni-app x 页面。
- 需要前端代理另行将表单迁移为当前 Vapor/uvue 页面，去除旧 login-page mixin、旧 config/store 和 DOM 事件依赖，复用现有未配置保护。未配置、SDK 不可用或管理员状态未知时，不得伪装初始化成功。
- 仅提交 username、password、可选 nickname；确认密码只在本地校验，不传 role、authorizedApp、password2 等字段。username/password 均应符合当前服务端验证规则，账号应使用明确的用户名而非依赖登录表单的手机号/邮箱自动识别。
- 调用必须显式指定自包含的具体响应泛型（例如 RegisterAdminResponse），包含 errCode（string|number）、可选 errMsg，以及成功时的 uid、newToken、passwordConfirmed；禁止 ApiResponse<T> 嵌套泛型。错误分支不一定有 token，必须先检查成功再读取。
- 不要照搬旧页“Promise resolved 就直接返回”的行为：显式确认 errCode=0 和成功字段，同时捕获拒绝/异常。已有管理员时提示改用登录，不自动重试、不删除管理员、不自动另建账号。
- 推荐创建成功后回到现有 V2 登录页重新进行一次密码登录，完成当前 store/权限初始化；也可由前端按现有 loginSuccess 契约接入，不能沿用旧 store。本次没有新增初始化页面或任何逻辑。

### 获得另行授权后的人工作业顺序

1. 用户在 HBuilderX/控制台手动选择并确认全新支付宝测试空间，核对与生产隔离；确认后才关联项目。不要运行项目全量初始化向导，不把本节当作当前执行授权。
2. 由可信操作者在本机为测试环境准备独立 uni-id 配置，确认 AppID 与当前应用匹配、Web 使用 web 配置段、密码规则匹配；自行保管 tokenSecret/passwordSecret，不在聊天、截图、运行参数文件或日志中暴露。不要把普通用户默认角色配置为 admin。按最小配置审查 hooks 和第三方服务，避免注册钩子访问真实业务。
3. 逐项部署下面的账号最小资源，先建立空表及 schema、必要索引；不导入任何旧账号、token、日志、验证码、角色权限或业务初始数据。
4. 仅由指定可信操作者，在尚未公开发布的本地 Web 管理入口串行调用一次官方 registerAdmin；首次凭据在操作者本地输入。不要开放自动重试或并发提交，不把初始化表单长期公开。尚无管理员的窗口应尽可能短；隐藏页面本身不是服务端安全边界，云空间客户端访问控制需按实际支持能力人工核对。
5. 成功后确认管理员身份与当前应用授权，随后移除/关闭管理员初始化入口，使用现有 V2 登录页验收。若请求超时或在 token/日志步骤失败，用户记录可能已写入：先尝试已创建账号登录或由可信操作者在测试控制台核查，禁止盲目重试或删除用户。
6. 若服务端返回已有管理员，立即停止首任初始化流程；由用户确认该空间是否真为空测试空间、是否应由现有管理员管理或授权当前应用，不通过放宽权限或删除账号解决。

### 最小部署白名单

本白名单覆盖“首任管理员创建 + Web 账号密码登录 + 验证码 + 用户/角色/权限核心管理”，不承诺覆盖已迁移全部核心业务页面。

- 云对象 1：`uni_modules/uni-id-pages-x/uniCloud/cloudfunctions/uni-id-co`，唯一活动版本 1.1.28。
- 云对象 2：`uni_modules/uni-captcha/uniCloud/cloudfunctions/uni-captcha-co`。当前密码登录组件会使用 uni-popup-captcha -> uni-captcha，组件请求此云对象；不能只部署 uni-id-co.createCaptcha 后就假设组件可用。纯 registerAdmin 本身不需要验证码，但完整密码登录验收需要。
- 公共模块：按各云对象 package.json 安装/打包其实际依赖。uni-id-co 的 5 项为 uni-captcha、uni-cloud-s2s、uni-config-center、uni-id-common、uni-open-bridge-common，全部使用各自 uni_modules 原路径。不要在根云目录复制同名公共模块。
- 空表/schema：`uni_modules/uni-id-pages/uniCloud/database/` 的 uni-id-users、uni-id-roles、uni-id-permissions、uni-id-log；以及 `uni_modules/uni-captcha/uniCloud/database/opendb-verify-codes.schema.json`。admin 是内置超级角色，首任创建不要求预插入 admin 角色文档或权限数据。
- 索引：仅按需选择根 `uniCloud-alipay/database/` 的 uni-id-users、uni-id-roles、uni-id-permissions、uni-id-log、opendb-verify-codes 对应 `.index.json` 文件，逐项审查上传；不要连同同名 `.init_data.json` 导入。users 现有 role 索引非唯一，不能将它当成首任创建的并发锁。
- 可暂不部署：uni-stat、uni-portal、uni-upgrade-center、uni-sms-co、ext-storage-co 等其他业务云函数；短信、OAuth、实名认证、外部存储、Redis 实例等也不是该最小流程的业务前提。保留官方云对象声明的依赖和 extensions，不为精简列表擅改官方 package.json。
- device、opendb-device、opendb-frv-logs、department、tag、admin-menus、应用表等随对应功能逐项准备；若现有核心页会查询这些表，先准备经过审查的空 schema/索引，或继续保持未准备保护，不使用旧全量 init_data 补齐。
- legacy 中的旧云对象和新版 schema 快照一律不部署。尤其不要上传 users.init_data.json、任何旧 token、旧验证码、日志或未知来源管理员记录。

### 本次只读复核结果与待用户决策

- 当前活动 uni-id-co 仍只有 1 份，版本 1.1.28；users/roles/permissions/验证码 schema 也各只有 1 份；5 个本地云对象依赖均存在。
- 本轮仅追加本文档；未读取密钥内容，未重复 info，未关联/创建/初始化/上传任何资源，未执行云对象或数据库查询。
- 用户仍需手动选择确认独立支付宝测试空间及隔离范围；后续再明确授权关联、逐项部署、单次管理员创建及测试读写。无需在聊天中提供空间 ID 或密钥。
- 用户需指定首任管理员操作者、用户名/昵称、测试专用凭据与配置保管方式；密码和密钥在本地输入，不发送给代理。
- 前端方案需确认：是否允许迁移旧 register-admin 表单为仅用于首次引导的 uvue 页面，以及创建成功后移除/关闭入口；默认不自动新增该入口。
- 用户需确认首批测试范围：仅账号/用户角色权限，还是同时纳入部门、标签、菜单等核心页面，以便扩展空表白名单；旧业务数据导入不在此授权范围。
