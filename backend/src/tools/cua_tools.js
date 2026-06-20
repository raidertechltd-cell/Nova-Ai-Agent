// ── CUA (Computer-Using Agent) Tools ──
// These tools return structured cuaAction objects that the frontend
// executes via the Electron novaDesktop bridge.
// The backend stays platform-agnostic (deployable on Render).

const SCREEN_TOOL = {
  description: 'Capture and analyze the current desktop screen. Takes a screenshot and returns a description of visible UI elements, windows, and their positions.',
  params: { query: { type: 'string', description: 'Specific element or area to look for on screen (e.g., "VS Code editor", "Figma prototype button", "Chrome address bar")' } },
  destructive: false,
  handler: async ({ query }) => {
    return {
      status: 'success',
      cuaAction: { type: 'screen_capture', params: { query } },
      data: `Preparing to analyze screen for: ${query || 'all visible elements'}`,
    }
  },
}

const MOUSE_CLICK_TOOL = {
  description: 'Click at a specific screen coordinate or on a UI element. Use after screen_analyze to know coordinates.',
  params: { x: { type: 'number', description: 'X coordinate on screen (optional if element described)' }, y: { type: 'number', description: 'Y coordinate on screen (optional if element described)' }, button: { type: 'string', description: '"left" or "right". Defaults to left.' }, element: { type: 'string', description: 'Description of element to click (e.g., "the Save button"). Coordinates or element required.' } },
  destructive: false,
  handler: async ({ x, y, button, element }) => {
    return {
      status: 'success',
      cuaAction: { type: 'mouse_click', params: { x: x ?? null, y: y ?? null, button: button || 'left', element: element || null } },
      data: element ? `Clicking ${element}` : `Clicking at (${x}, ${y})`,
    }
  },
}

const KEYBOARD_TYPE_TOOL = {
  description: 'Type text at the currently focused input field or text editor.',
  params: { text: { type: 'string', description: 'The text to type. Can include newlines with \\n.' } },
  destructive: false,
  handler: async ({ text }) => {
    return {
      status: 'success',
      cuaAction: { type: 'keyboard_type', params: { text } },
      data: `Typing: ${text.slice(0, 60)}${text.length > 60 ? '...' : ''}`,
    }
  },
}

const KEYBOARD_SHORTCUT_TOOL = {
  description: 'Execute a keyboard shortcut (e.g., Ctrl+S, Alt+Tab, Ctrl+C).',
  params: { keys: { type: 'string', description: 'The key combination, e.g., "ctrl+s", "alt+tab", "ctrl+shift+n"' } },
  destructive: false,
  handler: async ({ keys }) => {
    return {
      status: 'success',
      cuaAction: { type: 'keyboard_shortcut', params: { keys } },
      data: `Executing shortcut: ${keys}`,
    }
  },
}

const APP_LAUNCH_TOOL = {
  description: 'Launch or open an application on the desktop (VS Code, Figma, Chrome, etc.).',
  params: { name: { type: 'string', description: 'Application name or path. Common names: "Code", "Figma", "chrome", "notepad", "explorer"' }, path: { type: 'string', description: 'Exe path if known. Optional.' } },
  destructive: false,
  handler: async ({ name, path: appPath }) => {
    return {
      status: 'success',
      cuaAction: { type: 'launch_app', params: { name, path: appPath } },
      data: `Launching ${name}`,
    }
  },
}

const APP_TERMINATE_TOOL = {
  description: 'Terminate or close a running application by name or process ID.',
  params: { name: { type: 'string', description: 'Process name to terminate (e.g., "Code.exe", "chrome.exe", "notepad.exe")' }, pid: { type: 'number', description: 'Process ID to kill. Use list_processes to find PIDs.' } },
  destructive: true,
  handler: async ({ name, pid }) => {
    return {
      status: 'success',
      cuaAction: { type: 'terminate_process', params: { name, pid } },
      data: `Terminating ${name || pid}`,
    }
  },
}

const LIST_PROCESSES_TOOL = {
  description: 'List all running applications and their process IDs on the desktop. Use this before terminate_process to find the right PID.',
  params: {},
  destructive: false,
  handler: async () => {
    return {
      status: 'success',
      cuaAction: { type: 'list_processes', params: {} },
      data: 'Fetching running processes...',
    }
  },
}

const WINDOW_FOCUS_TOOL = {
  description: 'Focus or bring a specific application window to the foreground.',
  params: { title: { type: 'string', description: 'Window title to focus (e.g., "Visual Studio Code", "Figma", "Nova HUD"). Use list_windows to see open windows.' } },
  destructive: false,
  handler: async ({ title }) => {
    return {
      status: 'success',
      cuaAction: { type: 'focus_window', params: { title } },
      data: `Focusing window: ${title}`,
    }
  },
}

const LIST_WINDOWS_TOOL = {
  description: 'List all visible desktop windows with their titles and process names.',
  params: {},
  destructive: false,
  handler: async () => {
    return {
      status: 'success',
      cuaAction: { type: 'list_windows', params: {} },
      data: 'Fetching open windows...',
    }
  },
}

module.exports = { SCREEN_TOOL, MOUSE_CLICK_TOOL, KEYBOARD_TYPE_TOOL, KEYBOARD_SHORTCUT_TOOL, APP_LAUNCH_TOOL, APP_TERMINATE_TOOL, LIST_PROCESSES_TOOL, WINDOW_FOCUS_TOOL, LIST_WINDOWS_TOOL }
