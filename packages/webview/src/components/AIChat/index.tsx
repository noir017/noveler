import React, { useState, useEffect, useRef } from 'react'
import {
  AIChatDto,
  AIChatExtRecDto,
  AIStreamDto,
  ChatMessage,
} from 'common/types'
import './style.css'
console.log('AIChat 组件加载')

const AIChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [apiUrl, setApiUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-3.5-turbo')
  // 存储每个消息的深度思考内容收起状态
  const [reasoningCollapsed, setReasoningCollapsed] = useState<{
    [key: string]: boolean
  }>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // 初始化时从 VSCode 扩展获取数据
    const initMessages = async () => {
      try {
        // 使用全局的vscode变量，不再重复获取
        const vscode = (window as any).vscode
        if (!vscode) {
          console.error('VSCode API not available')
          return
        }
        // 请求获取 AI 配置
        vscode.postMessage({ type: 'getConfig' })
      } catch (error) {
        console.error('Failed to initialize messages:', error)
      }
    }

    initMessages()

    // 监听来自 VSCode 扩展的消息
    const handleMessage = (event: MessageEvent) => {
      const message: AIChatDto | AIStreamDto | any = event.data

      // 处理完整的消息数组
      if (message && message.type === 'message') {
        console.log('接收到消息:', message)
        setMessages((prev) => [...prev, message.message])
        setIsLoading(false)
        scrollToBottom()
      }
      // 处理流式消息
      else if (message && message.type === 'stream') {
        const streamMessage = message as AIStreamDto

        // 如果是新的流式消息开始，确保设置加载状态
        if (!messages.find((msg) => msg.id === streamMessage.messageId)) {
          setIsLoading(true)
        }

        // 查找是否已存在该消息ID的消息
        setMessages((prevMessages) => {
          const existingMessageIndex = prevMessages.findIndex(
            (msg) => msg.id === streamMessage.messageId,
          )

          if (existingMessageIndex !== -1) {
            // 更新现有消息内容和深度思考内容
            const updatedMessages = [...prevMessages]
            updatedMessages[existingMessageIndex] = {
              ...updatedMessages[existingMessageIndex],
              content: streamMessage.content,
              reasoning_content: streamMessage.reasoning_content,
            }
            return updatedMessages
          } else {
            // 添加新的AI消息
            const newMessage: ChatMessage = {
              id: streamMessage.messageId,
              role: 'assistant',
              content: streamMessage.content,
              reasoning_content: streamMessage.reasoning_content,
              timestamp: Date.now(),
            }

            // 如果消息包含深度思考内容，默认设置为收起状态
            if (streamMessage.reasoning_content) {
              setReasoningCollapsed((prev) => ({
                ...prev,
                [streamMessage.messageId]: true,
              }))
            }

            return [...prevMessages, newMessage]
          }
        })

        // 如果流式消息已完成，停止加载状态
        if (streamMessage.isComplete) {
          setIsLoading(false)
        }
      }
      // 处理配置消息
      else if (message && message.type === 'config') {
        if (message.config) {
          setApiUrl(message.config.apiUrl || '')
          setApiKey(message.config.apiKey || '')
          setModel(message.config.model || '')
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  useEffect(() => {
    // 自动滚动到最新消息
    // scrollToBottom()
  }, [messages, isLoading])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSendMessage = () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')

    // 确保设置加载状态为true
    setIsLoading(true)

    // 使用全局的vscode变量发送消息到 VSCode 扩展
    const vscode = (window as any).vscode
    if (vscode) {
      vscode.postMessage({
        type: 'message',
        message: userMessage,
      } as AIChatExtRecDto)
    }
  }

  const handleClearChat = () => {
    setMessages([])
    const vscode = (window as any).vscode
    if (vscode) {
      vscode.postMessage({ type: 'clear' } as AIChatExtRecDto)
    }
  }

  const handleStopChat = () => {
    // 确保设置加载状态为false
    setIsLoading(false)

    const vscode = (window as any).vscode
    if (vscode) {
      vscode.postMessage({ type: 'stop' } as AIChatExtRecDto)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // 获取 VSCode API - 现在直接使用全局变量
  const getVsCodeApi = () => {
    return (window as any).vscode
  }

  // 切换深度思考内容的收起/展开状态
  const toggleReasoning = (messageId: string) => {
    setReasoningCollapsed((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }))
  }

  return (
    <div className='ai-chat-container'>
      <div className='ai-chat-header'>
        <h2>AI 助手</h2>
        <div className='header-buttons'>
          <button
            className='config-button'
            onClick={() => setShowConfig(!showConfig)}>
            配置
          </button>
          <button className='clear-button' onClick={handleClearChat}>
            清空对话
          </button>
        </div>
      </div>

      {showConfig && (
        <div className='config-panel'>
          <h3>AI 配置</h3>
          <div className='config-form'>
            <div className='form-group'>
              <label htmlFor='apiUrl'>API URL:</label>
              <input
                id='apiUrl'
                type='text'
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder='https://api.openai.com/v1/chat/completions'
              />
            </div>
            <div className='form-group'>
              <label htmlFor='apiKey'>API 密钥:</label>
              <input
                id='apiKey'
                type='password'
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder='您的 API 密钥'
              />
            </div>
            <div className='form-group'>
              <label htmlFor='model'>模型:</label>
              <input
                id='model'
                type='text'
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder='gpt-3.5-turbo'
              />
            </div>
            <div className='form-actions'>
              <button
                className='save-config-button'
                onClick={() => {
                  const vscode = (window as any).vscode
                  if (vscode) {
                    vscode.postMessage({
                      type: 'saveConfig',
                      config: { apiUrl, apiKey, model },
                    })
                  }
                  setShowConfig(false)
                }}>
                保存配置
              </button>
              <button
                className='cancel-config-button'
                onClick={() => setShowConfig(false)}>
                取消
              </button>
            </div>
          </div>
          <div className='config-note'>
            <p>
              注意：配置将保存在 VSCode 设置中。配置后需要重新打开 AI
              助手面板才能生效。
            </p>
          </div>
        </div>
      )}

      <div className='messages-container'>
        {messages.length === 0 ? (
          <div className='empty-state'>
            <p>开始与 AI 助手对话吧！</p>
            {(!apiUrl || !apiKey) && (
              <p className='config-warning'>请先配置 AI API 设置</p>
            )}
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`message ${
                message.role === 'user' ? 'user-message' : 'assistant-message'
              }`}>
              {message.role === 'assistant' && message.reasoning_content && (
                <div className='reasoning-container'>
                  <div
                    className='reasoning-header'
                    onClick={() => toggleReasoning(message.id)}>
                    <span className='reasoning-title'>
                      {reasoningCollapsed[message.id] ? '深度思考' : '深度思考'}
                    </span>
                    <span className='reasoning-toggle'>
                      {reasoningCollapsed[message.id] ? '▶' : '▼'}
                    </span>
                  </div>
                  {!reasoningCollapsed[message.id] && (
                    <div className='reasoning-content'>
                      {message.reasoning_content}
                    </div>
                  )}
                </div>
              )}
              <div className='message-content'>{message.content}</div>
              <div className='message-timestamp'>
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className='message assistant-message'>
            <div className='message-content loading'>
              <span>AI 正在输入中...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className='input-container'>
        <textarea
          ref={inputRef}
          className='message-input'
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='输入您的问题...'
          rows={3}
          disabled={isLoading}
        />
        <button
          className={isLoading ? 'stop-button send-button' : 'send-button'}
          onClick={isLoading ? handleStopChat : handleSendMessage}
          disabled={!inputValue.trim() && !isLoading}>
          {isLoading ? '停止' : '发送'}
        </button>
      </div>
    </div>
  )
}

export default AIChat
