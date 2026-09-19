import { buildEnrichedContextInfo } from '../../lib/enrichContext.js'
import { listStickerCommands } from '../../lib/stickerCommand.js'
import { replyTable } from '../../lib/cosmetics.js'

export default {
  name: 'liststicker',
  aliases: ['stickerlist', 'stickercmds'],
  category: 'utility',
  description: 'Show all registered sticker to command mappings',
  permissions: { owner: true },

  execute: async ({ m, sock }) => {
    const all = listStickerCommands()

    if (all.length === 0) {
      return m.reply(
        'No sticker commands registered yet.\n' +
        'Use *.addsticker <command>* while replying to a sticker.'
      )
    }

    const rows = all.map(e => [`.${e.command}`, e.shortHash, e.addedBy.split('@')[0]])

    await replyTable(m, sock, {
      caption: `REGISTERED STICKER COMMANDS (${all.length})`,
      rows: [['Command', 'Hash', 'Added by'], ...rows],
    }, { contextInfo: buildEnrichedContextInfo() })
  }
}
