import React from 'react'
import { Affix } from 'antd'
import { IConfig } from 'noveler/src/types/config'
import { ExtRecDto } from 'noveler/src/types/webvDto'

const itemMap: {
  name: string
  handler: keyof IConfig
}[] = [
  { name: '字体', handler: 'previewFontSize' },
  { name: '缩进', handler: 'previewIndentionLength' },
  { name: '段落间距', handler: 'previewSpaceLines' },
]

export default () => {
  const options = [-1, 1]
  const handleReloadWebview = (signal: ExtRecDto) => {
    vscode.postMessage(signal)
  }

  return (
    <Affix offsetTop={0}>
      <div
        style={{
          backgroundColor: 'grey',
          // 居中
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
        {itemMap.map((item, index1) => (
          <div
            key={`${index1}`}
            style={{
              display: 'inline-block',
            }}>
            {item.name}
            {options.map((option, index2) => (
              <button
                key={`${index1}-${index2}`}
                style={{
                  display: 'inline-block',
                }}
                onClick={() => {
                  handleReloadWebview({ conf: item.handler, option })
                }}>
                {option > 0 ? '+' : '-'}
              </button>
            ))}
          </div>
        ))}
      </div>
    </Affix>
  )
}
