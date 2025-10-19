import * as vscode from 'vscode'
import * as https from 'https'
import * as http from 'http'
import { ChatMessage, AIConfig, AIStreamDto, Theme } from 'common/types'

// 当前HTTP请求
let currentRequest: http.ClientRequest | undefined = undefined

// 获取 AI 配置
export const getAIConfig = (): AIConfig => {
  const config = vscode.workspace.getConfiguration('noveler')
  return {
    apiUrl: config.get<string>('ai.apiUrl', ''),
    apiKey: config.get<string>('ai.apiKey', ''),
    model: config.get<string>('ai.model', ''),
    prompts: config.get<object>('ai.prompts', {}),
  }
}

// 颜色主题转换
export const colorThemeKind2Theme = (kind: vscode.ColorThemeKind): Theme => {
  let theme: Theme
  switch (kind) {
    case vscode.ColorThemeKind.Dark:
    case vscode.ColorThemeKind.HighContrast:
      theme = 'dark'
      break
    default:
      theme = 'light'
      break
  }
  return theme
}

// 停止当前AI请求
export const stopCurrentRequest = () => {
  if (currentRequest) {
    currentRequest.destroy()
    currentRequest = undefined
  }
}

// 发送流式消息到webview
const sendStreamMessage = (
  panel: vscode.WebviewPanel,
  messageId: string,
  content: string,
  reasoningContent: string,
  isComplete: boolean,
  isReasoningComplete: boolean,
  themeKind: Theme,
) => {
  const streamDto: AIStreamDto = {
    type: 'stream',
    messageId,
    content,
    reasoning_content: reasoningContent,
    isComplete,
    isReasoningComplete,
    themeKind,
  }
  panel.webview.postMessage(streamDto)
}

// 发送错误消息到webview
const sendErrorMessage = (
  panel: vscode.WebviewPanel,
  messages: ChatMessage[],
  error: unknown,
  themeKind: Theme,
) => {
  const errorMessage: ChatMessage = {
    id: (Date.now() + 1).toString(),
    role: 'assistant',
    content: `调用 AI API 时出错: ${
      error instanceof Error ? error.message : '未知错误'
    }\n\n请检查您的 API 配置是否正确。`,
    timestamp: Date.now(),
  }

  messages.push(errorMessage)

  // 发送错误消息到 webview
  const dto = {
    messages,
    themeKind,
  }
  panel.webview.postMessage(dto)
}

// 处理AI响应
export const newAIResponse = async (
  userMessage: ChatMessage,
  panel: vscode.WebviewPanel,
  messages: ChatMessage[],
) => {
  const aiConfig = getAIConfig()

  // 如果配置了 API，则调用真实 API
  if (aiConfig.apiUrl && aiConfig.apiKey) {
    try {
      // 创建一个空的AI消息，用于流式更新
      const aiMessageId = (Date.now() + 1).toString()
      let aiContent = ''
      let reasoningContent = '' // 添加深度思考内容变量
      let isReasoningComplete = false // 添加深度思考完成标志

      // 发送初始空消息到webview，开始流式响应
      const themeKind = colorThemeKind2Theme(
        vscode.window.activeColorTheme.kind,
      )
      sendStreamMessage(panel, aiMessageId, '', '', false, false, themeKind)

      // 使用 Node.js https 模块替换 fetch，支持流式响应
      const url = new URL(aiConfig.apiUrl)
      const postData = JSON.stringify({
        model: aiConfig.model,
        messages: [
          {
            role: 'system',
            content:
              '你是一个专业的写作助手，能够帮助用户理解和改进他们的文本内容。',
          },
          {
            role: 'user',
            content: userMessage.content,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
        stream: true, // 启用流式响应
      })

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aiConfig.apiKey}`,
          'Content-Length': Buffer.byteLength(postData),
        },
      }

      const req = https.request(options, (res) => {
        let buffer = ''

        res.on('data', (chunk) => {
          buffer += chunk
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // 保留不完整的行

          for (const line of lines) {
            if (line.trim() === '') continue
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data.trim() === '[DONE]') {
                // 流式响应完成
                const themeKind = colorThemeKind2Theme(
                  vscode.window.activeColorTheme.kind,
                )
                sendStreamMessage(
                  panel,
                  aiMessageId,
                  aiContent,
                  reasoningContent,
                  true,
                  true,
                  themeKind,
                )

                // 将完整的AI消息添加到消息列表
                const completeAiMessage: ChatMessage = {
                  id: aiMessageId,
                  role: 'assistant',
                  content: aiContent,
                  reasoning_content: reasoningContent,
                  timestamp: Date.now(),
                }
                messages.push(completeAiMessage)
                currentRequest = undefined // 清除当前请求
                return
              }

              try {
                const json = JSON.parse(data)
                const delta = json.choices?.[0]?.delta

                // 处理深度思考内容
                if (delta?.reasoning_content) {
                  reasoningContent += delta.reasoning_content

                  // 发送深度思考内容的流式更新到webview
                  const themeKind = colorThemeKind2Theme(
                    vscode.window.activeColorTheme.kind,
                  )
                  sendStreamMessage(
                    panel,
                    aiMessageId,
                    aiContent,
                    reasoningContent,
                    false,
                    false,
                    themeKind,
                  )
                }

                // 处理常规内容
                if (delta?.content) {
                  aiContent += delta.content

                  // 发送流式更新到webview
                  const themeKind = colorThemeKind2Theme(
                    vscode.window.activeColorTheme.kind,
                  )
                  sendStreamMessage(
                    panel,
                    aiMessageId,
                    aiContent,
                    reasoningContent,
                    false,
                    isReasoningComplete,
                    themeKind,
                  )
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        })

        res.on('end', () => {
          // 处理可能剩余的数据
          if (buffer.trim() && buffer.startsWith('data: ')) {
            const data = buffer.slice(6)
            if (data.trim() !== '[DONE]') {
              try {
                const json = JSON.parse(data)
                const delta = json.choices?.[0]?.delta

                // 处理深度思考内容
                if (delta?.reasoning_content) {
                  reasoningContent += delta.reasoning_content
                }

                // 处理常规内容
                if (delta?.content) {
                  aiContent += delta.content
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }

          // 确保发送完成信号
          const themeKind = colorThemeKind2Theme(
            vscode.window.activeColorTheme.kind,
          )
          sendStreamMessage(
            panel,
            aiMessageId,
            aiContent,
            reasoningContent,
            true,
            true,
            themeKind,
          )

          // 将完整的AI消息添加到消息列表
          const completeAiMessage: ChatMessage = {
            id: aiMessageId,
            role: 'assistant',
            content: aiContent,
            reasoning_content: reasoningContent,
            timestamp: Date.now(),
          }
          messages.push(completeAiMessage)
          currentRequest = undefined // 清除当前请求
        })
      })

      req.on('error', (error) => {
        console.error('AI API call failed:', error)
        currentRequest = undefined // 清除当前请求

        // 如果 API 调用失败，显示错误信息
        const themeKind = colorThemeKind2Theme(
          vscode.window.activeColorTheme.kind,
        )
        sendErrorMessage(panel, messages, error, themeKind)
      })

      // 保存当前请求的引用
      currentRequest = req

      req.write(postData)
      req.end()
    } catch (error) {
      console.error('AI API call failed:', error)

      // 如果 API 调用失败，显示错误信息
      const themeKind = colorThemeKind2Theme(
        vscode.window.activeColorTheme.kind,
      )
      sendErrorMessage(panel, messages, error, themeKind)
    }
  }
}
