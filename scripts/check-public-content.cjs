const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 })
const files = git(['ls-files', '-z']).toString().split('\0').filter(Boolean)
const privatePaths = [
  /^manifest\.json$/,
  /(^|\/)(node_modules|unpackage|\.hbuilderx|screenshots|test-results|playwright-report)\//,
  /(^|\/)uni-config-center\/.*\/config\.json$/,
  /(^|\/)(\.spaceInfo|\.DS_Store)$/,
  /(^|\/)\.env(?:\..+)?$/,
  /\.(pem|key|p12|pfx|jks|keystore|mobileprovision|cer|crt|log)$/i,
  /\.param\.(json|js|uts)$/,
  /(^|\/)uni-id-users\.init_data\.json$/,
  /^uniCloud-alipay\/database\/opendb-(news-articles|banner)\.init_data\.json$/
]
const knownPrivateValues = new Set()
const manifest = path.join(root, 'manifest.json')
if (fs.existsSync(manifest)) {
  for (const match of fs.readFileSync(manifest, 'utf8').matchAll(/"appid"\s*:\s*"([^"\r\n]+)"/g)) {
    knownPrivateValues.add(match[1])
  }
}

const configRoot = path.join(root, 'uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center')
function collectSecrets(value, key = '') {
  if (value != null && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) collectSecrets(child, childKey)
  } else if (typeof value === 'string' && value.length >= 6 && /secret|password|privatekey|accesskey|apikey|appid/i.test(key)) {
    if (!/填写|替换|示例|your|example|placeholder|^x+$|^\*+$/i.test(value)) knownPrivateValues.add(value)
  }
}
for (const name of ['uni-id', 'uni-sms-co', 'uni-open-bridge', 'uni-ad', 'uni-stat', 'uni-captcha']) {
  const file = path.join(configRoot, name, 'config.json')
  if (fs.existsSync(file)) collectSecrets(JSON.parse(fs.readFileSync(file, 'utf8')))
}

const highConfidencePatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bLTAI[A-Za-z0-9]{16,}\b/
]
let findings = 0
for (const file of files) {
  const issues = []
  if (file !== '.env.example' && privatePaths.some(pattern => pattern.test(file))) issues.push('private-path')
  const content = git(['show', ':' + file])
  if ([...knownPrivateValues].some(value => content.includes(Buffer.from(value)))) issues.push('local-private-value')
  if (!content.includes(0) && highConfidencePatterns.some(pattern => pattern.test(content.toString('utf8')))) issues.push('credential-pattern')
  if (issues.length) {
    findings++
    console.error(`${file}: ${issues.join(', ')}`)
  }
}
if (findings) {
  console.error(`暂存检查未通过：${findings} 个文件需要处理；未输出敏感值。`)
  process.exitCode = 1
} else {
  console.log(`暂存检查通过：${files.length} 个文件，未检出本机 AppID、已知配置密钥或高置信度凭据特征。`)
}
