/**
 * AppleScript templates for iTerm automation
 */

/**
 * Spawn a new iTerm window with pi worker
 * Returns the session ID
 * 
 * @param {string} workerId - Identifier for the worker
 * @param {string} socketPath - Optional socket path for manager communication
 * @param {object} options - Optional settings
 * @param {object} options.bounds - Window bounds {x, y, width, height}
 */
export function spawnWorkerScript(workerId, socketPath = null, options = {}) {
  const envVars = socketPath 
    ? `write text "export PI_MANAGER_SOCKET=${socketPath}"
    write text "export PI_WORKER_ID=${workerId}"`
    : '';

  // Set bounds if provided: {x: 100, y: 100, width: 800, height: 600}
  const setBounds = options.bounds 
    ? `set bounds of front window to {${options.bounds.x}, ${options.bounds.y}, ${options.bounds.x + options.bounds.width}, ${options.bounds.y + options.bounds.height}}`
    : '';

  return `
tell application "iTerm"
  create window with default profile
  ${setBounds}
  tell current session of current window
    set sessionId to id
    set name to "pi-worker-${workerId}"
    ${envVars}
    write text "pi"
    return sessionId
  end tell
end tell
  `.trim();
}

/**
 * Close a specific iTerm session by ID
 * Returns "found" or "not_found"
 */
export function closeSessionScript(sessionId) {
  return `
tell application "iTerm"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if id of aSession is "${sessionId}" then
          close aSession
          return "found"
        end if
      end repeat
    end repeat
  end repeat
  return "not_found"
end tell
  `.trim();
}

/**
 * Simple spawn for testing (with custom commands)
 */
export function spawnTestWindowScript(name, commands) {
  const commandLines = Array.isArray(commands) 
    ? commands.map(cmd => `write text "${cmd}"`).join('\n    ')
    : `write text "${commands}"`;

  return `
tell application "iTerm"
  create window with default profile
  tell current session of current window
    set sessionId to id
    set name to "${name}"
    ${commandLines}
    return sessionId
  end tell
end tell
  `.trim();
}
