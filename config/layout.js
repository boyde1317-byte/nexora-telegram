export const layoutConfig = {
  spacing: {
    paddingX: 2,
    lineGap: 1
  },
  icons: {
    success: '✅',
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    loading: '⏳',
    bullet: '◦',
    arrow: '↳'
  },
  borders: {
    modern: {
      topLeft: '╭─',
      headerStart: '「 ',
      headerEnd: ' 」',
      line: '│',
      divider: '├─',
      bulletLine: '├ ',
      bottomLeft: '╰'
    },
    classic: {
      topLeft: '┏',
      headerStart: '━━━━━━━━━━━━━━\n┃  ',
      headerEnd: '\n┣━━━━━━━━━━━━━━',
      line: '┃',
      divider: '┣',
      bulletLine: '┣ ',
      bottomLeft: '┗'
    },
    minimal: {
      topLeft: '──',
      headerStart: ' ',
      headerEnd: ' ──',
      line: '',
      divider: '──',
      bulletLine: '  ',
      bottomLeft: '──'
    }
  },
  headerStyle: 'uppercase', // uppercase | lowercase | capitalize | normal
  footerStyle: 'clean'     // clean | minimal | ornate
};

export default layoutConfig;
