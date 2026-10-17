## uni-admin-x

本项目正在从 uni-admin 3.0.2 迁移到 uni-app x。保留 Vapor 配置，当前交付和验证平台为桌面 Web，不代表已完成 App 适配；Web 目前由框架以 VDOM 渲染。

已接入官方 uni-id-pages-x 2.0.1 的 PC 账号界面、后台多窗口、菜单/用户/角色/权限/标签页面及应用列表。已确认关联支付宝云空间；当前运行实例仍需重新运行以载入绑定，真实登录、权限和数据库增删改查仍待部署后联调。

迁移范围、验证结果、保留的旧源码及下一阶段工作见 [MIGRATION.md](./MIGRATION.md)。账号云资源归属与测试空间准备见 [账号迁移记录](./legacy/UNI-ID-V2-MIGRATION.md)。

## 首次使用与本地配置

本项目仍是迁移中的 Web 项目，尚未完成全平台适配或真实云端业务验收。

1. 安装项目依赖后运行 `npm run setup:local`，从 `manifest.example.json` 生成本地 `manifest.json`。该脚本仅处理 manifest 复制，不生成云端配置、不绑定云空间、不部署资源。
2. 模板的 appid 为空，请自行在本地设置自己的真实 DCloud AppID，并核对账号服务中的应用授权。真实 `manifest.json` 不得上传或提交。
3. 按实际部署需求，从配置中心对应的 `config.example.json` 准备本地 `config.json`，自行配置测试环境密钥及所需服务；示例模板不是可直接使用的凭据，也不能代替部署配置。
4. 按迁移记录逐项准备云资源，不要上传 `legacy` 中的旧云对象或归档 schema，也不要全量导入旧初始化数据。

敏感原件仅保留在用户本机。提交前核对 [安全文件清单](./SECURITY-FILES.md)，不要将真实 AppID、配置中心密钥、账号数据、证书或本机调试信息加入仓库。

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
