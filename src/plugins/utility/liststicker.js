import { resolveDisplayIdentity, mentionChip } from '../../lib/identity.js';
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

    const rows = await Promise.all(all.map(async (e) => { const id = await resolveDisplayIdentity(sock, e.addedBy, null); return [`.${e.command}`, e.shortHash, id.number ? '+' + id.number : id.label]; }))

    await replyTable(m, sock, {
      caption: `REGISTERED STICKER COMMANDS (${all.length})`,
      rows: [['Command', 'Hash', 'Added by'], ...rows],
    }, { contextInfo: buildEnrichedContextInfo() })
  }
}
