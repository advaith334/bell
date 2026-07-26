import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'

/**
 * The macOS application menu. Beyond looking native, the Edit menu is load
 * bearing: without its roles, the standard clipboard shortcuts do not work in
 * any text field, so pasting an API key would silently fail.
 */

interface MenuActions {
  openHome: () => void
  openSettings: () => void
  readSelection: () => void
  stop: () => void
}

export function buildApplicationMenu(actions: MenuActions): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Bell',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => actions.openSettings(),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Read',
      submenu: [
        {
          label: 'Read Selection',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => actions.readSelection(),
        },
        {
          label: 'Stop',
          accelerator: 'Escape',
          click: () => actions.stop(),
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
        { type: 'separator' },
        {
          label: 'Bell Home',
          accelerator: 'CmdOrCtrl+0',
          click: () => actions.openHome(),
        },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Bell on GitHub',
          click: () => void shell.openExternal('https://github.com/advaith334/bell'),
        },
      ],
    },
  ]

  // A Developer menu only when running unpackaged, so a shipped build stays clean.
  if (!app.isPackaged) {
    template.push({
      label: 'Developer',
      submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }],
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
