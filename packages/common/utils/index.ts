import { NovelerRouter } from '../types'
import { promises as fs, existsSync } from 'fs'
import * as vscode from 'vscode'

const getStrLength = (str: string) => {
  // eslint-disable-next-line no-control-regex
  const cArr = str.match(/[^\x00-\xff]/gi)
  return str.length + (cArr == null ? 0 : cArr.length)
}
export const isMultipleWorkspaces = () => {
  // 检测当前是否多个工作区
  return vscode.workspace.workspaceFolders?.length != 1
}
export const mkdirs = async (path: string) => {
  // 创建导出文件的目录(如果不存在)
  if (!existsSync(path)) {
    try {
      fs.mkdir(path, { recursive: true })
    } catch (err) {
      vscode.window.showErrorMessage(`导出文件夹创建失败: ${err}`)
      return false
    }
  }
  return true
}
export const formatTime = () => {
  const now = new Date()
  return `${now.getFullYear()}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now
    .getHours()
    .toString()
    .padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now
    .getSeconds()
    .toString()
    .padStart(2, '0')}`
}

export const splitStr = (sChars: string) => {
  let str = ''
  for (let i = 0; i < sChars.length; i++) {
    const schar = sChars.charAt(i)
    if (
      typeof schar == 'undefined' ||
      typeof sChars.charAt(i + 1) == 'undefined'
    )
      break
    str += schar
    if (getStrLength(schar) != getStrLength(sChars.charAt(i + 1))) {
      str += ' '
    }
  }
  return str.substring(0, str.length - 1)
}

export const isAbsolutePath = (path: string) => {
  return (
    path.startsWith('/') || path.startsWith('\\') || /^[a-zA-Z]:/.test(path)
  )
}

/**
 * @returns 一维数组，数组中的每一项都是一个绝对路径
 */
export const getAbsolutePaths = async (path: string, suffix: string) => {
  const paths: string[] = []
  if (!isAbsolutePath(path)) {
    paths.push(`${vscode.workspace.workspaceFolders?.[0].uri.fsPath}/${path}`)
  } else {
    paths.push(path)
  }
  const stat = await fs.stat(paths[0])
  if (stat.isDirectory()) {
    // read all suffix in this dir
    const p = paths.pop()
    if (!p) return
    const files = await fs.readdir(p)
    for (let i = 0; i < files.length; i++) {
      const f = `${p}/${files[i]}`
      if (files[i].endsWith(suffix) && (await fs.stat(f)).isFile()) {
        paths.push(f)
      }
    }
  }
  return paths
}

export const getRelativePathAndRoot = (
  path: string,
  platForm: NodeJS.Platform,
) => {
  const roots = vscode.workspace.workspaceFolders?.map(
    (item) => item.uri.fsPath,
  )
  if (!roots) return undefined
  // 匹配前缀
  for (let i = 0; i < roots.length; i++) {
    if (path.startsWith(roots[i])) {
      const splitChar = platForm === 'win32' ? '\\' : '/'
      return {
        root: roots[i],
        path: path.replace(`${roots[i]}${splitChar}`, ''),
      }
    }
  }
}

export const createWebviewHtml = (
  router: NovelerRouter,
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  showScrollbar = false,
) => {
  const bundleScriptPath = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'out', 'app', 'bundle.js'),
  )
  return `
  <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>React App</title>
    </head>
    <body>
      <div id="root"></div>
      <script>
        const vscode = acquireVsCodeApi();
        const home = '${router}'
        const showScrollbar = ${showScrollbar}
      </script>
      <script src="${bundleScriptPath}"></script>
    </body>
  </html>
`
}
