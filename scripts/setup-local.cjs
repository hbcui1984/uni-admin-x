const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const destination = path.join(root, 'manifest.json')

try {
  fs.copyFileSync(path.join(root, 'manifest.example.json'), destination, fs.constants.COPYFILE_EXCL)
  console.log('已生成本地 manifest.json，请在 HBuilderX 中设置自己的 AppID。')
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  console.log('本地 manifest.json 已存在，保持原配置不变。')
}
