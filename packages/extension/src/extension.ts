/**
 * developed by
 * __________            _______    __________
 * \____    /___________ \   _  \   \____    /____ __  _  _______
 *   /     // __ \_  __ \/  /_\  \    /     /\__  \\ \/ \/ /\__  \
 *  /     /\  ___/|  | \/\  \_/   \  /     /_ / __ \\     /  / __ \_
 * /_______ \___  >__|    \_____  / /_______ (____  /\/\_/  (____  /
 *         \/   \/              \/          \/    \/             \/
 */

import * as vscode from 'vscode'
import * as aiChat from '@/modules/webviews/AIChat'

export let initing = false

// this method is called when vs code is activated
export const activate = async (context: vscode.ExtensionContext) => {
  initing = true
  // ------------------ setcontext ------------------
  const aiChatProvider = aiChat.provider(context)
  // ------------------ register ------------------
  context.subscriptions.push(
    aiChatProvider.command,
    aiChatProvider.commandRandomName,
    aiChatProvider.commandWordReplace,
    aiChatProvider.commandContinueWriting,
    aiChatProvider.commandCharacterDesign,
  )
  initing = false
}

export const deactivate = () => {}
