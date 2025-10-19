import * as vscode from 'vscode'
import { createWebviewHtml } from 'common/utils'
import {
  AIChatDto,
  AIChatExtRecDto,
  ChatMessage,
  Commands,
  Theme,
} from 'common/types'
import {
  newAIResponse,
  getAIConfig,
  colorThemeKind2Theme,
  stopCurrentRequest,
} from '../ai'
import { log } from 'console'

let currentPanel: vscode.WebviewPanel | undefined = undefined
let context: vscode.ExtensionContext | undefined = undefined
let disposables: vscode.Disposable[] | undefined = undefined
let messages: ChatMessage[] = []

// 获取选中文本及其上下文
const getSelectedTextWithContext = (): string | null => {
  const editor = vscode.window.activeTextEditor
  if (!editor) return null

  const selection = editor.selection
  if (selection.isEmpty) return null

  const selectedText = editor.document.getText(selection)
  const document = editor.document

  // 获取选中文本的起始和结束位置
  const startLine = selection.start.line
  const endLine = selection.end.line

  // 计算上下文范围（前后各100字）
  const contextStartChar = Math.max(0, selection.start.character - 100)
  const contextEndChar = Math.min(
    document.lineAt(endLine).text.length,
    selection.end.character + 100,
  )

  // 如果选中文本在同一行
  if (startLine === endLine) {
    const lineText = document.lineAt(startLine).text
    return lineText.substring(contextStartChar, contextEndChar)
  }

  // 如果选中文本跨越多行
  let contextText = ''

  // 第一行（从上下文起始位置到行尾）
  contextText +=
    document.lineAt(startLine).text.substring(contextStartChar) + '\n'

  // 中间的所有行
  for (let i = startLine + 1; i < endLine; i++) {
    contextText += document.lineAt(i).text + '\n'
  }

  // 最后一行（从行首到上下文结束位置）
  contextText += document.lineAt(endLine).text.substring(0, contextEndChar)

  return contextText
}

const init = (cnt: vscode.ExtensionContext) => {
  context = cnt
  disposables = []

  const panel = vscode.window.createWebviewPanel(
    'NovelerAIChat',
    'AI 助手',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  )

  panel.webview.html = createWebviewHtml('/ai-chat', panel.webview, context)

  // 发送初始数据
  const themeKind = colorThemeKind2Theme(vscode.window.activeColorTheme.kind)
  sendInitialData(themeKind)

  panel.webview.onDidReceiveMessage(
    (message: AIChatExtRecDto) => {
      handleWebviewMessage(message)
    },
    null,
    disposables,
  )

  panel.onDidDispose(
    () => {
      currentPanel = undefined
      // Clean up our resources
      panel.dispose()
      while (disposables?.length) {
        const x = disposables.pop()
        if (x) x.dispose()
      }
    },
    null,
    disposables,
  )

  // 监听主题变化
  vscode.window.onDidChangeActiveColorTheme(
    () => {
      const themeKind = colorThemeKind2Theme(
        vscode.window.activeColorTheme.kind,
      )
      sendThemeUpdate(themeKind)
    },
    null,
    disposables,
  )

  return panel
}

const showWebview = async (context: vscode.ExtensionContext) => {
  const column = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : undefined

  if (currentPanel) {
    currentPanel.reveal(column)
  } else {
    currentPanel = init(context)
  }

  // 检查是否有选中文本，如果有则自动添加到输入框
  const selectedTextWithContext = getSelectedTextWithContext()
  if (selectedTextWithContext) {
    const editor = vscode.window.activeTextEditor
    if (editor && !editor.selection.isEmpty) {
      const selectedText = editor.document.getText(editor.selection)

      // 创建包含上下文的问题
      const question = `[${selectedTextWithContext}]解释以上内容，并说明[${selectedText}]`

      // 发送问题到 webview
      if (currentPanel) {
        const message: ChatMessage = {
          id: Date.now().toString(),
          role: 'user',
          content: question,
          timestamp: Date.now(),
        }

        // 发送用户消息到 webview
        // 有个小bug，在开启新webview时，这个消息会丢失，但影响不大，就暂时不修了吧
        currentPanel.webview.postMessage({
          type: 'message',
          message: message,
        })

        console.log('postMessage', question, message)

        // 添加到消息列表并处理
        messages.push(message)
        newAIResponse(message, currentPanel!, messages)
      }
    }
  }
}

const sendInitialData = (themeKind: Theme) => {
  if (currentPanel) {
    const dto: AIChatDto = {
      messages,
      themeKind,
    }
    currentPanel.webview.postMessage(dto)
  }
}

const sendThemeUpdate = (themeKind: Theme) => {
  if (currentPanel) {
    currentPanel.webview.postMessage({
      type: 'theme-update',
      themeKind,
    })
  }
}

const handleWebviewMessage = (message: AIChatExtRecDto) => {
  switch (message.type) {
    case 'getConfig':
      // 发送配置到 webview
      const config = getAIConfig()
      if (currentPanel) {
        currentPanel.webview.postMessage({
          type: 'config',
          config,
        })
      }
      break
    case 'saveConfig':
      // 保存配置
      const configToSave = message.config
      if (configToSave) {
        vscode.workspace
          .getConfiguration('noveler')
          .update(
            'ai.apiUrl',
            configToSave.apiUrl,
            vscode.ConfigurationTarget.Global,
          )
        vscode.workspace
          .getConfiguration('noveler')
          .update(
            'ai.apiKey',
            configToSave.apiKey,
            vscode.ConfigurationTarget.Global,
          )
        vscode.workspace
          .getConfiguration('noveler')
          .update(
            'ai.model',
            configToSave.model,
            vscode.ConfigurationTarget.Global,
          )
        vscode.window.showInformationMessage('AI 配置已保存')
      }
      break
    case 'message':
      // 处理用户消息
      if (message.message) {
        messages.push(message.message)
        newAIResponse(message.message, currentPanel!, messages)
      }
      break
    case 'clear':
      // 清空消息列表
      messages = []
      if (currentPanel) {
        currentPanel.webview.postMessage({
          type: 'cleared',
        })
      }
      break
    case 'stop':
      // 停止当前的AI响应
      stopCurrentRequest()
      break
  }
}

export const provider = (context: vscode.ExtensionContext) => {
  return {
    command: vscode.commands.registerCommand(Commands.AIChat, async () => {
      await showWebview(context)
    }),
  }
}
