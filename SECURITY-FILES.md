# 安全文件清单

本清单用于首次公开提交及后续提交审查。以下本机原件保留，不修改、不删除，但不得提交至公共仓库。只记录文件路径与敏感类型，不记录真实 AppID、密钥、账号标识或资源地址。排除规则由项目 `.gitignore` 维护；本清单不是已完成 Git 暂存审计的证明。

## 应用标识

| 文件 | 排除原因 | 公开替代 |
| --- | --- | --- |
| `manifest.json` | 真实 DCloud AppID 及本机应用配置 | `manifest.example.json`，appid 为空；使用者自行配置 |

运行 `npm run setup:local` 仅从示例准备本地 manifest，不负责配置中心、云空间绑定或部署。文档需要说明应用授权时统一使用 `<YOUR_DCloud_APPID>`，不得填入本机真实值。

## 配置中心

以下六份实际 `config.json` 均排除。敏感类型是审查类别，不表示每个文件都已启用对应服务；不得因暂未启用而公开实际配置。

| 文件 | 敏感类型或配置边界 |
| --- | --- |
| `uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-id/config.json` | 令牌签名密钥、密码处理密钥、应用与 OAuth、短信等账号服务配置 |
| `uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-open-bridge/config.json` | 第三方平台应用标识、密钥及开放平台桥接配置 |
| `uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-captcha/config.json` | 验证码服务安全配置及资源配置 |
| `uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-sms-co/config.json` | 短信服务凭据、应用与模板配置 |
| `uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-stat/config.json` | 统计服务环境及业务配置 |
| `uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-ad/config.json` | 广告服务应用与业务配置 |

部署者按需要从对应 `config.example.json` 配置本地原件，自行保管密钥，不沿用生产凭据进行测试。公开示例是模板，不是实际凭据；只有保持空值或明确占位内容时才可公开，不得将本机配置复制进去。

## 数据与调试参数

| 文件 | 排除原因 |
| --- | --- |
| `uniCloud-alipay/database/uni-id-users.init_data.json` | 含一条真实账号记录，不公开用户身份、认证或授权数据 |
| `uniCloud-alipay/database/opendb-news-articles.init_data.json` | 文章作者标识及资源来源尚未确认，保守排除 |
| `uniCloud-alipay/database/opendb-banner.init_data.json` | 横幅内容及资源来源尚未确认，保守排除 |
| `uniCloud-alipay/cloudfunctions/uni-upgrade-center/uni-upgrade-center.param.json` | 本机调试 AppID 与调用参数，不作为公共示例 |

其他 `.schema.json`、`.index.json` 及经审查的菜单、枚举初始化数据留存，不应一概排除所有数据库文件。留存不表示可以直接部署或全量导入；按迁移记录逐项审查 schema 权限、索引和初始化内容，禁止导入旧账号、令牌及未知来源业务数据。

## 任意层级排除规则

以下规则覆盖根目录、插件、云函数及归档目录的所有深层副本：

| 目录或文件类型 | 排除范围与原因 |
| --- | --- |
| `**/node_modules/` | 依赖安装产物，可能包含实际配置的复制件 |
| `**/unpackage/` | 编译产物、缓存、打包资源及运行信息 |
| `**/.hbuilderx/` | 本机 IDE、运行和云空间关联配置 |
| `**/.DS_Store` | 本机文件系统元数据 |
| 任意层级 `.env`、`.env.*` | 环境变量及环境凭据；公开模板仅在确认无真实值且有明确例外规则时保留 |
| 任意层级证书、私钥、签名及描述文件 | 包括 `.pem`、`.key`、`.p12`、`.pfx`、`.jks`、`.keystore`、`.cer`、`.crt`、`.mobileprovision` 等；不公开原件 |

新增配置、日志、截图、测试夹具或导出文件也需检查，不得包含真实身份信息、密钥、令牌、本机绝对路径、临时路径或未经确认可公开的资源。`legacy` 仅用于技术归档，不可上传其中的旧云对象或归档 schema；归档目录并不豁免敏感文件排除规则。

## 提交前核对

1. 确认上述本机原件及其深层副本不在待提交文件中，且用户本机原件仍保留。
2. 确认 manifest 示例 appid 为空，配置示例不含真实凭据，文档仅使用语义路径和占位标识。
3. 确认 schema、索引及必要菜单枚举数据仍保留，不以删除技术记录或清空数据库目录替代脱敏。
4. 检查最终暂存内容，而非仅检查忽略规则；若敏感内容曾进入提交历史，单纯新增忽略规则或替换文档不足以移除历史，应停止发布并另行处理历史及凭据轮换。

暂存完成后运行 `npm run check:public`，检查 Git 索引中的实际内容。脚本只报告文件路径和问题类型，不输出敏感值；检测不能代替人工审查，也不能保证发现所有凭据格式。
