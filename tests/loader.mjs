// node:test 的模块解析钩子：让渲染层纯逻辑模块可被测试直接加载
// - `@shared/*` 别名 → src/shared/*（等价 tsconfig paths，vite 由打包器解析、node 不会）；
// - 相对导入无扩展名时补 `.ts` 再试（vite 风格导入）。
// 挂在 npm test 的 --import 上，只影响测试进程，不进入应用构建产物。
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@shared/')) {
      const target = path.resolve(repoRoot, 'src/shared', `${specifier.slice('@shared/'.length)}.ts`)
      return { url: pathToFileURL(target).href, shortCircuit: true }
    }
    try {
      return nextResolve(specifier, context)
    } catch (err) {
      // 相对导入补 .ts（vite 风格）；包子路径补 .js（dayjs/locale/zh-cn 等）
      const ext = specifier.startsWith('.') ? '.ts' : '.js'
      try {
        return nextResolve(specifier + ext, context)
      } catch {
        /* 落回原始错误 */
      }
      throw err
    }
  }
})
