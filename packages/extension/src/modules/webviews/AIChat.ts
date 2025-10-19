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

// 获取当前激活编辑器的所有文本
const getContentText = (): string | null => {
  const editor = vscode.window.activeTextEditor
  if (!editor) return null

  return editor.document.getText()
}

// 获取当前段落文本
const getParagraphText = (): string | null => {
  const editor = vscode.window.activeTextEditor
  if (!editor) return null

  const document = editor.document
  const position = editor.selection.active

  // 获取当前行
  const currentLine = document.lineAt(position.line)

  // 简单的段落定义：以空行分隔的文本块
  // 向上查找段落开始
  let paragraphStart = position.line
  while (paragraphStart > 0) {
    const prevLine = document.lineAt(paragraphStart - 1)
    if (prevLine.text.trim() === '') {
      break
    }
    paragraphStart--
  }

  // 向下查找段落结束
  let paragraphEnd = position.line
  const lineCount = document.lineCount
  while (paragraphEnd < lineCount - 1) {
    const nextLine = document.lineAt(paragraphEnd + 1)
    if (nextLine.text.trim() === '') {
      break
    }
    paragraphEnd++
  }

  // 提取段落文本
  let paragraphText = ''
  for (let i = paragraphStart; i <= paragraphEnd; i++) {
    paragraphText += document.lineAt(i).text
    if (i < paragraphEnd) {
      paragraphText += '\n'
    }
  }

  return paragraphText
}

// 获取选中的文本
const getSelectedText = (): string | null => {
  const editor = vscode.window.activeTextEditor
  if (!editor) return null

  const selection = editor.selection
  if (selection.isEmpty) return null

  return editor.document.getText(selection)
}

// 替换prompt模板中的占位符
const replacePromptPlaceholders = (template: string): string => {
  const selectedText = getSelectedText() || ''
  const selectedTextWithContext = getSelectedTextWithContext() || ''
  const contentText = getContentText() || ''
  const paragraphText = getParagraphText() || ''
  // console.log('selectedText,selectedTextWithContext,contentText,paragraphText',selectedText,selectedTextWithContext,contentText,paragraphText);

  return template
    .replace(/\${selectedText}/g, selectedText)
    .replace(/\${selectedTextWithContext}/g, selectedTextWithContext)
    .replace(/\${contentText}/g, contentText)
    .replace(/\${paragraphText}/g, paragraphText)
}

const init = (cnt: vscode.ExtensionContext) => {
  context = cnt
  disposables = []

  const panel = vscode.window.createWebviewPanel(
    'NovelerAIChat',
    'AI 助手',
    vscode.ViewColumn.Two, // 改为右侧显示
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

const showWebview = async (
  context: vscode.ExtensionContext,
  customPrompt?: string,
) => {
  // 获取当前编辑器的列位置
  const activeEditorColumn = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : vscode.ViewColumn.One

  if (currentPanel) {
    // 如果面板已存在，显示在右侧，并保持当前编辑器焦点
    currentPanel.reveal(vscode.ViewColumn.Two)

    // 保持当前编辑器的焦点
    if (vscode.window.activeTextEditor) {
      await vscode.window.showTextDocument(
        vscode.window.activeTextEditor.document,
        activeEditorColumn,
      )
    }
  } else {
    currentPanel = init(context)

    // 创建面板后，保持当前编辑器的焦点
    if (vscode.window.activeTextEditor) {
      await vscode.window.showTextDocument(
        vscode.window.activeTextEditor.document,
        activeEditorColumn,
      )
    }
  }

  // 如果提供了自定义prompt，则使用它；否则使用默认行为
  if (customPrompt) {
    // 替换prompt模板中的占位符
    const question = replacePromptPlaceholders(customPrompt)

    // 发送问题到 webview
    if (currentPanel) {
      const message: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: question,
        timestamp: Date.now(),
      }

      // 发送用户消息到 webview
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
  // else {
  //   console.log('检查是否有选中文本，如果有则自动添加到输入框');

  //   // 默认行为：检查是否有选中文本，如果有则自动添加到输入框
  //   const selectedTextWithContext = getSelectedTextWithContext()
  //   if (selectedTextWithContext) {
  //     console.log("selectedTextWithContext",selectedTextWithContext);

  //     const editor = vscode.window.activeTextEditor
  //     if (editor && !editor.selection.isEmpty) {
  //       console.log('const editor = vscode.window.activeTextEditor',vscode.window.activeTextEditor);

  //       const selectedText = editor.document.getText(editor.selection)

  //       // 使用默认prompt模板
  //       const defaultPrompt = '[${selectedTextWithContext}]解释以上内容，并说明[${selectedText}]'
  //       const question = replacePromptPlaceholders(defaultPrompt)

  //       // 发送问题到 webview
  //       if (currentPanel) {
  //         const message: ChatMessage = {
  //           id: Date.now().toString(),
  //           role: 'user',
  //           content: question,
  //           timestamp: Date.now(),
  //         }

  //         // 发送用户消息到 webview
  //         // 有个小bug，在开启新webview时，这个消息会丢失，但影响不大，就暂时不修了吧
  //         currentPanel.webview.postMessage({
  //           type: 'message',
  //           message: message,
  //         })

  //         console.log('postMessage', question, message)

  //         // 添加到消息列表并处理
  //         messages.push(message)
  //         newAIResponse(message, currentPanel!, messages)
  //       }
  //     }
  //   }
  // }
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

        // 保存prompts配置
        if (configToSave.prompts) {
          vscode.workspace
            .getConfiguration('noveler')
            .update(
              'ai.prompts',
              configToSave.prompts,
              vscode.ConfigurationTarget.Global,
            )
        }

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
    commandRandomName: vscode.commands.registerCommand(
      Commands.AIRandomName,
      async () => {
        const editor = vscode.window.activeTextEditor
        const config = getAIConfig()
        let prompt = ''

        if (!editor || editor.selection.isEmpty) {
          // 未选中文本的情况
          prompt =
            config.prompts?.randomName?.withoutSelection ||
            '请随机生成十个人物姓名'
        } else {
          // 有选中文本的情况
          prompt =
            config.prompts?.randomName?.withSelection ||
            '请根据以下内容生成相关人物姓名：\n${selectedText}'
        }

        await showWebview(context, prompt)
      },
    ),
    commandWordReplace: vscode.commands.registerCommand(
      Commands.AIWordReplace,
      async () => {
        const editor = vscode.window.activeTextEditor
        const config = getAIConfig()
        let prompt = ''

        if (!editor || editor.selection.isEmpty) {
          // 未选中文本的情况
          prompt =
            config.prompts?.wordReplace?.withoutSelection ||
            '请提供一些词汇替换建议'
          await showWebview(context, prompt)
          return
        } else {
          // 有选中文本的情况
          prompt =
            config.prompts?.wordReplace?.withSelection ||
            '[${paragraphText}]\n${selectedText}能替换成什么？'
          await showWebview(context, prompt)
        }
      },
    ),
    commandContinueWriting: vscode.commands.registerCommand(
      Commands.AIContinueWriting,
      async () => {
        const editor = vscode.window.activeTextEditor
        const config = getAIConfig()
        let prompt = ''

        if (!editor || editor.selection.isEmpty) {
          // 未选中文本的情况
          prompt =
            config.prompts?.continueWriting?.withoutSelection ||
            '请根据当前文档内容继续续写'
        } else {
          // 有选中文本的情况
          prompt =
            config.prompts?.continueWriting?.withSelection ||
            '请根据以下内容继续续写：\n${selectedText}'
        }

        await showWebview(context, prompt)
      },
    ),
    commandCharacterDesign: vscode.commands.registerCommand(
      Commands.AICharacterDesign,
      async () => {
        const editor = vscode.window.activeTextEditor
        const config = getAIConfig()
        let prompt = ''

        if (!editor || editor.selection.isEmpty) {
          // 未选中文本的情况
          prompt =
            config.prompts?.characterDesign?.withoutSelection ||
            '请帮我设计一个小说角色'
        } else {
          // 有选中文本的情况
          prompt =
            config.prompts?.characterDesign?.withSelection ||
            '请根据以下内容设计一个角色：\n${selectedText}'
        }

        await showWebview(context, prompt)
      },
    ),
  }
}

// 导出showWebview函数，以便其他模块可以直接调用
export { showWebview }
