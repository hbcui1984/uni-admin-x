## uni-admin-x

本项目正在从 uni-admin 3.0.2 迁移到 uni-app x。保留 Vapor 配置，当前交付和验证平台为桌面 Web，不代表已完成 App 适配；Web 目前由框架以 VDOM 渲染。

已接入官方 uni-id-pages-x 2.0.2 的 PC 账号界面、后台多窗口、专用超级管理员注册、基础菜单维护、用户/角色/权限/菜单/标签管理、应用基础新增编辑、用户日志和密码修改。首次使用恢复旧 uni-admin 的分步流程，不以自建认领向导作为默认入口。旧版完整功能差距见 [FEATURE-GAPS.md](./FEATURE-GAPS.md)，有路由或保留源码不等于功能已经完整验收。

迁移范围、验证结果、保留的旧源码及下一阶段工作见 [MIGRATION.md](./MIGRATION.md)。账号云资源归属与测试空间准备见 [账号迁移记录](./legacy/UNI-ID-V2-MIGRATION.md)。

## 首次使用与本地配置

本项目仍是迁移中的 Web 项目，尚未完成全平台适配或真实云端业务验收。

1. 安装项目依赖后运行 `npm run setup:local`，从 `manifest.example.json` 生成本地 `manifest.json`。该脚本仅处理 manifest 复制，不生成云端配置、不绑定云空间、不部署资源。
2. 模板的 appid 为空，请自行在本地设置自己的真实 DCloud AppID，并核对账号服务中的应用授权。真实 `manifest.json` 不得上传或提交。
3. 按实际部署需求，从配置中心对应的 `config.example.json` 准备本地 `config.json`，自行配置测试环境密钥及所需服务；示例模板不是可直接使用的凭据，也不能代替部署配置。
4. 按迁移记录逐项准备云资源，不要上传 `legacy` 中的旧云对象或归档 schema，也不要全量导入旧初始化数据。

敏感原件仅保留在用户本机。提交前核对 [安全文件清单](./SECURITY-FILES.md)，不要将真实 AppID、配置中心密钥、账号数据、证书或本机调试信息加入仓库。

## 本地调试与首次使用

首次使用按旧 uni-admin 的职责分开处理：检测管理员状态 → 专用管理员注册 → 返回登录 → 数据库基础数据准备/可选菜单维护。空空间不要求先登录，也不要求认领已有普通账号。

1. 在 HBuilderX 运行 Web，运行控制台选择“连接本地云函数”，使用当前项目关联的支付宝云空间。按各云函数 `package.json` 安装依赖，确保 `uni-admin-co` 和模块内 `uni-id-co` 都能解析 `uni-admin-setup` 公共模块。当前本地 debug 无需上传云函数/云对象，不要为此自动部署。
2. 打开登录页。公开零参数 `uni-id-co.getAdminRegistrationStatus` 只查询全空间管理员及 guard，不读取或校验来访者 token，也不查询菜单表。仅服务器确认无管理员且未被 guard 锁定时，显示“注册超级管理员”；已有管理员则隐藏注册入口、保留登录。残留无效 token 不阻挡此状态查询，错误、未知或锁定都不开注册。
3. 点击“注册超级管理员”，进入 `uni_modules/uni-id-pages-x/pages/register/register-admin`，填写专用表单并明确提交 `registerAdmin`。成功后清理注册会话并返回登录，不自动登录、不创建菜单、不认领普通账号。用户名叫 admin 不代表已有管理员权限；同名账号冲突应由维护者核查，不能默认转为认领。
4. 使用创建的管理员账号登录，再按数据库资源清单单独准备所需基础数据。注册所需 schema、索引等依赖须事先就绪；基础数据准备不是自动写入许可，不全量导入旧 `init_data`、旧账号或未迁移菜单。
5. 如需补齐当前基础菜单，管理员可从工作台、顶栏或菜单管理进入 `pages/setup/index`“基础菜单维护”，明确确认后仅补 **9 条基础菜单和 24 条权限定义**，不覆盖现有自定义记录；完成后按提示重新登录刷新导航。该维护页是本项目扩展，不是旧版原有向导。旧 setup URL 在无管理员且允许注册时转专用注册，有管理员但未登录时转登录，只有具备权限的管理员才可确认补齐。

本地调试是本机执行代码，数据库仍是关联云数据库，不是独立的本地数据库，不自动写入。首次注册窗口只应向维护者开放；一次性锁成功或失败后均不自动回收，遗留锁需维护者核查实际账号结果。仅查看页面不会创建账号、提权或初始化菜单；缺少 schema、索引或服务时按提示逐项准备。

本项目的 `uni-id-co.registerAdmin` 带共享一次性锁补丁。后续升级账号插件时必须保留该补丁、纯状态接口及 `uni-admin-setup` 依赖。认领入口和表单已从默认前端移除，但后端旧 `claimFirstAdmin` 仍保留为非默认流程，属于待审查技术债，并未删除；不能因前端不可达而视为服务端风险已关闭。

普通自助注册默认关闭，登录页不提供普通注册或“后台初始化”入口。旧普通注册书签在无管理员且允许注册时也转专用管理员注册；已有管理员只提示登录。后台用户由管理员创建。群发短信及账号注销因仍有安全/调度验收缺口而禁用，不能只打开配置就宣称可用。各项边界和后续验收详见功能差距清单。

最新已有验证记录：真实本地浏览器匿名及 invalid-token 状态均能看到“注册超级管理员”，无向导链接、无 pageerrors；全新前端隔离套件 **146 项断言**及后端 **29 项 mock** 通过，覆盖范围与历史证据见功能差距清单。真实注册 **0**、无部署，不代表端到端真实创建已验证；本轮仅更新文档，未重跑上述测试。

以下为原 uni-admin 项目说明，保留用于来源说明，不作为本项目全部功能已完成迁移的承诺。

## 原项目 uni-admin

uni-admin，是基于 uni-app 和 uniCloud 的管理后台项目模版。

对于 uniCloud 的开发者而言，其后台管理系统应该使用本框架。

我们搭建了[uni-admin 演示站点](http://hellouniadmin.dcloud.net.cn/admin/)，你登录后即可快速体验 uni-admin。

uni-admin 是开源的，遵循 MIT 协议，你可以从[Github](https://github.com/dcloudio/uni-admin)或[码云](https://gitee.com/dcloud/uni-admin)获取源码，也可以从[DCloud 插件市场](https://ext.dcloud.net.cn/plugin?id=3268)快捷下载。

## 框架特征

- 基于 uni-app 的宽屏适配，可自动适配 PC 宽屏和手机各端。了解[宽屏适配](https://uniapp.dcloud.io/adapt)
- 基于 uniCloud，是 serverless 的云开发。了解[uniCloud](https://uniapp.dcloud.io/uniCloud/README)
- 基于 uni-id，使用 uni-id 的用户账户、角色、权限系统。了解[uni-id](https://uniapp.dcloud.io/uniCloud/uni-id)

## 看视频，15 分钟掌握 uni-admin

<a target="_blank" href="https://www.bilibili.com/video/BV17p4y1a71x?p=13">
    <img src="https://vkceyugu.cdn.bspapp.com/VKCEYUGU-f184e7c3-1912-41b2-b81f-435d1b37c7b4/4332911b-6624-4587-8c77-78b68f1f8c78.jpg" alt="uni-admin视频教程" style="width: 60%;">
</a>
