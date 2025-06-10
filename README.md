# MCP Desktop Pro

An advanced Model Context Protocol server for comprehensive **computer use** and **AI agent automation** with **advanced window management**, visual debugging, and Retina display support. This server enables **AI operators** and LLMs to intelligently control mouse movements, keyboard inputs, capture screenshots, **manage and target specific windows**, and perform precise **autonomous computer control** tasks with visual feedback and window-relative coordinate systems.

Ideal for **AI-powered automation**, testing apps, games, and running desktop tasks locally with AI agents through Model Context Protocol.

## 🚀 Main Advantages

- 🪟 **Advanced Window Management**: Target specific windows with precise coordinate conversion and cross-platform integration
- ⚡ **Multi-Action Chaining**: Execute complex **AI automation** sequences with timing control and error handling
- 🖼️ **AI-Optimized Screenshots**: Aggressive compression, scaling, and WebP format optimized for **computer vision** processing
- 🌐 **Cross-Platform Support**: Full support for macOS, Windows, and Linux with platform-specific optimizations
- 🎯 **Visual Debugging**: Real-time cursor position verification with visual feedback for **intelligent UI automation**

## ⚠️ Important Limitation

**Secondary Display Screenshots**: AI agents cannot capture screenshots of windows on secondary/external displays. Both `screen_capture` and `window_capture` only work on the primary display. **Workaround**: Use `move_window_to_primary_screen` to relocate windows for capture. Mouse/keyboard automation works across all displays using window-relative coordinates.

## Configuration to use MCP Desktop Pro

Here's how to configure Claude Desktop to use the MCP Desktop Pro server:

### NPX

```json
{
  "mcpServers": {
    "desktop-pro": {
      "command": "npx",
      "args": ["-y", "mcp-desktop-pro"]
    }
  }
}
```

### Local Development

```json
{
  "mcpServers": {
    "desktop-pro": {
      "command": "node",
      "args": ["/path/to/mcp-desktop-pro/server.js"]
    }
  }
}
```

### Local Development with Debug Mode

```json
{
  "mcpServers": {
    "desktop-pro": {
      "command": "node",
      "args": ["/path/to/mcp-desktop-pro/server.js", "--debug"]
    }
  }
}
```

## Command Line Options

The server supports the following command line arguments:

- `--debug`: Enable comprehensive debug logging
  - Creates `debug.log` file with detailed operation logs
  - Saves debug screenshots for mouse operations
  - Logs coordinate transformations and error details
- `--help, -h`: Show help message with usage information

**Examples:**
```bash
node server.js              # Start server in normal mode
node server.js --debug      # Start server with debug logging enabled
node server.js --help       # Show help message
```

### Permissions

This server requires system-level permissions to:

* Capture screenshots of your screen
* Control mouse movement and clicks
* Simulate keyboard input
* Access window information and focus windows
* Execute AppleScript commands (macOS)

When first running this MCP server, you may need to grant these permissions in your operating system's security settings.

## Key Features

- **AI-Optimized Screenshots**: Aggressive 50% scaling, WebP compression (quality 15), and strict size limits (max 300KB) for optimal **computer vision** processing
- **Multi-Action Automation**: Execute sequences of **AI agent** actions with precise timing control and configurable error handling
- **Advanced Window Management**: List, focus, capture, and precisely target specific windows with **intelligent UI automation**
- **Window-Relative Coordinates**: Click elements within specific windows accurately with automatic coordinate transformation for **vision-guided automation**
- **Visual Debugging**: Mouse position verification with red circle overlay for **autonomous computer control**
- **Cross-Platform Support**: Full support for macOS, Windows, and Linux with platform-specific **AI operator** optimizations
- **Press Duration Control**: Hold keys or mouse buttons for specified durations
- **WebP Format**: Optimized WebP format for better compression and faster AI processing
- **AppleScript Integration**: Reliable window focusing on macOS

## Components

### Tools

#### Screen and Window Management

- **get_screen_size**
  - Gets the screen dimensions
  - Returns: `{ width, height }` in logical coordinates

- **screen_capture**
  - Captures the current screen content (PRIMARY DISPLAY ONLY - cannot capture secondary/external displays)
  - Inputs:
    - `x1`, `y1`, `x2`, `y2` (numbers, optional): Coordinates for partial capture
  - Features: Automatic Retina scaling, 50% scaling with 1920x1080 cap, WebP compression (quality 40)
  - ⚠️ **Limitation**: Only works on primary display - use `window_capture` for windows on secondary displays

- **list_windows**
  - Lists all open windows with their properties
  - Returns: Array of windows with `id`, `title`, `owner`, `bounds`, `processId`, etc.

- **focus_window**
  - Focuses on a specific window to bring it to the front
  - Input: `windowId` (number, required): Window ID from list_windows
  - Uses AppleScript for reliable window focusing on macOS

- **move_window_to_primary_screen**
  - Moves a window from secondary display to the primary screen, enabling screenshot capture
  - Inputs:
    - `windowId` (number, required): Window ID from list_windows
    - `preserveSize` (boolean, optional, default: true): Keep original window size or resize to fit primary screen
  - Automatically positions window on primary display and optionally resizes
  - Enables window_capture for windows that were previously on secondary displays

- **window_capture**
  - Focuses on a window and captures a screenshot of just that window (automatically optimized for AI analysis)
  - Inputs:
    - `windowId` (number, optional): Window ID from list_windows
    - `windowTitle` (string, optional): Window title (partial match)
  - Features: Automatic focusing, precise window bounds capture, 50% scaling with WebP compression
  - ⚠️ **Secondary display limitation**: Window capture not supported on secondary displays - use `move_window_to_primary_screen` first

#### Mouse Control

- **mouse_move**
  - Moves the mouse to specified coordinates with automatic Retina scaling. When targeting buttons (especially in grids like calculators), aim for the center of the button rather than edges to ensure reliable clicks.
  - Inputs:
    - `x`, `y` (numbers, required): Target coordinates relative to the **TOP-LEFT corner (0,0) of the window screenshot/image**. NOT relative to any internal UI elements or content areas. Use coordinates exactly as they appear in the captured window image.
    - `windowId` (number, required): Window ID for coordinate conversion. All mouse movements must be relative to a window.
    - `debug` (boolean, optional): Show red circle at cursor position for verification
  - Features: Automatic scaling, visual debugging, window-relative positioning

- **mouse_click**
  - Performs a mouse click, optionally moving to coordinates first. When clicking buttons (especially in grids like calculators), aim for the center of the button rather than edges to ensure reliable clicks.
  - Inputs:
    - `button` (string, optional, default: "left"): "left", "right", "middle"
    - `double` (boolean, optional): Whether to perform a double click (works correctly with native robotjs)
    - `windowId` (number, required): Focus window before clicking. This is a required parameter.
    - `pressLength` (number, optional, 0-5000ms): Duration to hold mouse button
    - `x`, `y` (numbers, optional): Coordinates relative to the **TOP-LEFT corner (0,0) of the window screenshot/image** to move to before clicking. NOT relative to any internal UI elements. Use coordinates exactly as they appear in the captured window image. Aim for button centers, not edges.
  - Features: Move and click in one action, or click at current position within a focused window.

#### Keyboard Control

- **keyboard_press**
  - Presses a keyboard key or key combination with duration control
  - Inputs:
    - `key` (string, required): Key to press (e.g., 'enter', 'a', 'space')
    - `modifiers` (array, optional): ["control", "shift", "alt", "command"]
    - `windowId` (number, optional): Focus window before pressing key
    - `pressLength` (number, optional, 0-5000ms): Duration to hold key

- **keyboard_type**
  - Types text at the current cursor position
  - Inputs:
    - `text` (string, required): Text to type
    - `windowId` (number, optional): Focus window before typing

#### Multi-Action Automation

- **multiple_desktop_actions**
  - Action chaining: executes a sequence of desktop actions with optional delays and error handling
  - Inputs:
    - `actions` (array, required): Array of action objects
    - `continueOnError` (boolean, optional, default: false): Continue executing remaining actions even if one fails
  - Each action object contains:
    - `type` (string, required): Action type ("mouse_move", "mouse_click", "keyboard_press", "keyboard_type", "screen_capture", "window_capture", "focus_window")
    - `params` (object, optional): Parameters for the action (same as individual method parameters)
    - `delay` (number, optional, 0-60000ms): Delay after this action (up to 60 seconds)
  - Features: Sequential execution, configurable error handling, timing control
  - Returns: Combined result with array of individual action results
    
    **Success (all actions completed):**
    ```json
    {
      "success": true,
      "message": "Executed 3 actions successfully", 
      "results": [
        {
          "action": 0,
          "type": "mouse_move",
          "result": { "success": true }
        },
        {
          "action": 1, 
          "type": "mouse_click",
          "result": { "success": true }
        },
        {
          "action": 2,
          "type": "keyboard_type", 
          "result": { "success": true }
        }
      ]
    }
    ```
    
    **With continueOnError=true (some actions failed):**
    ```json
    {
      "success": false,
      "message": "Executed 3 actions with 1 errors",
      "results": [
        {
          "action": 0,
          "type": "mouse_move",
          "result": { "success": true }
        },
        {
          "action": 1,
          "type": "mouse_click", 
          "result": { "success": false, "error": "Window not found" }
        },
        {
          "action": 2,
          "type": "keyboard_type",
          "result": { "success": true }
        }
      ],
      "errors": ["Action 1 (mouse_click): Window not found"]
    }
    ```

### Resources

The server provides access to screenshots:

1. **Screenshot List** (`screenshot://list`)
   - Lists all available screenshots by name

2. **Screenshot Content** (`screenshot://{id}`)
   - JPEG images of captured screenshots
   - Accessible via the screenshot ID (timestamp-based naming)

## Advanced Usage Examples

### Window-Based Automation

**Option 1: Basic workflow (simple, 1:1 coordinates)**
```javascript
// 1. List windows to find target
list_windows()

// 2. Click directly (coordinates will be mapped 1:1 to window)
mouse_click({
  x: 150, y: 200,
  windowId: 12345
})
```

**Option 2: Precise workflow (with AI-optimized coordinate scaling)**
```javascript
// 1. List windows to find target
list_windows()

// 2. Capture specific window (creates precise coordinate metadata)
window_capture({ windowId: 12345 })

// 3. Option A: Move then click (two steps)
mouse_move({ 
  x: 150, y: 200, 
  windowId: 12345,
  debug: true  // Show red circle for verification
})
mouse_click({ windowId: 12345 })

// 3. Option B: Move and click in one action
mouse_click({
  x: 150, y: 200,
  windowId: 12345
})
```

### Secondary Display to Primary Screen Workflow
```javascript
// 1. List windows to find target on secondary display
list_windows()

// 2. Move window from secondary to primary screen
move_window_to_primary_screen({ 
  windowId: 12345,
  preserveSize: true  // Keep original size (default)
})

// 3. Now you can capture the window (was impossible before)
window_capture({ windowId: 12345 })

// 4. Perform automation as normal
mouse_click({
  x: 150, y: 200,
  windowId: 12345
})
```

### Visual Debugging Workflow
```javascript
// 1. Take screenshot and analyze
screen_capture()

// 2. Move mouse with visual verification
mouse_move({ x: 400, y: 300, debug: true })
// Returns screenshot with red circle showing exact cursor position

// 3. Adjust if needed, then click
mouse_click()
```

### Move and Click in One Action
```javascript
// Traditional approach (two separate calls)
mouse_move({ x: 150, y: 200, windowId: 12345 })
mouse_click({ windowId: 12345 })

// New approach (single call with coordinates)
mouse_click({
  x: 150, y: 200,
  windowId: 12345,
  button: "left",
  pressLength: 500  // Hold for 500ms
})

// Double-click support
mouse_click({
  x: 150, y: 200,
  windowId: 12345,
  double: true  // Performs a double-click
})
```

### Gaming and Duration Control
```javascript
// Hold W key for movement (2 seconds)
keyboard_press({ key: 'w', pressLength: 2000 })

// Charge attack at specific location (hold left mouse for 1 second)
mouse_click({ 
  x: 400, y: 300,
  button: 'left', 
  pressLength: 1000 
})

// Sprint with shift
keyboard_press({ key: 'shift', pressLength: 3000 })
```

### Optimized Screenshots
```javascript
// Full screen capture (automatically optimized)
screen_capture()

// Partial screen capture
screen_capture({
  x1: 0, y1: 0,
  x2: 800, y2: 600
})

// Window capture (automatically optimized)
window_capture({
  windowId: 12345
})
```

### Multi-Action Automation
```javascript
// Complex automation sequence
multiple_desktop_actions({
  actions: [
    {
      type: "focus_window",
      params: { windowId: 12345 },
      delay: 300
    },
    {
      type: "window_capture",
      params: { 
        windowId: 12345
      },
      delay: 200
    },
    {
      type: "mouse_click",
      params: { 
        x: 150, y: 200, 
        windowId: 12345
      },
      delay: 500
    },
    {
      type: "keyboard_type",
      params: { text: "Hello World", windowId: 12345 },
      delay: 200
    },
    {
      type: "keyboard_press",
      params: { key: "enter", windowId: 12345 }
    }
  ]
})

// Gaming combo sequence with error handling
multiple_desktop_actions({
  continueOnError: true,  // Continue even if one action fails
  actions: [
    {
      type: "keyboard_press",
      params: { key: "shift", pressLength: 100 },
      delay: 50
    },
    {
      type: "mouse_click", 
      params: { button: "left", pressLength: 500 },
      delay: 200
    },
    {
      type: "keyboard_press",
      params: { key: "space" }
    }
  ]
})

// Robust automation with long delays
multiple_desktop_actions({
  continueOnError: false,  // Stop on first error (default)
  actions: [
    {
      type: "screen_capture",
      delay: 1000  // Wait 1 second
    },
    {
      type: "focus_window",
      params: { windowId: 12345 },
      delay: 5000  // Wait 5 seconds for app to load
    },
    {
      type: "mouse_move",
      params: { x: 200, y: 300 },
      delay: 30000  // Wait 30 seconds for long operation
    }
  ]
})
```

## Coordinate Systems

### IMPORTANT: Coordinate Reference Point
**All mouse coordinates (x, y) are relative to the TOP-LEFT corner (0,0) of the window screenshot/image that you see.**

- ✅ **Correct**: Use coordinates as they appear in the captured window image
- ✅ **Reference point**: Top-left corner of the window screenshot is (0,0)
- ❌ **Incorrect**: Don't use coordinates relative to internal UI elements, content areas, or tabs
- ❌ **Incorrect**: Don't add offsets for title bars, menus, or toolbars

**Example**: If you see a button at position (150, 200) in the window screenshot, use exactly `x: 150, y: 200` - the system handles all scaling and positioning automatically.

### Screenshot Scaling and Coordinate Handling
The server automatically handles multiple scaling factors:
- **Screenshots**: Always scaled to 50% for AI optimization with aspect ratio preservation
- **Retina displays**: Automatic detection and coordinate conversion
- **Mouse coordinates**: Automatically scaled up 2x to account for 50% screenshot scaling
- **Window coordinates**: Properly scaled for accurate positioning without title bar offsets

### Window-Relative Coordinates
All mouse operations use window-relative coordinates:
1. Coordinates are relative to the window's screenshot (0,0 = top-left of captured image)
2. **Automatic scaling**: Handles different window sizes and display densities
3. **Precise positioning**: No manual offset calculations needed
4. **Required windowId**: Ensures accurate coordinate transformation

### Recent Fixes and Improvements
- **Aspect ratio preservation**: Window captures now use `fit: 'inside'` to maintain proper aspect ratios
- **Title bar offset removed**: Fixed Y-axis positioning errors by removing incorrect title bar height offset (previous implementation detail)
- **Double-click fixed**: Native robotjs double-click now works correctly with proper syntax
- **Button center targeting**: Tool descriptions updated to guide users to click button centers for reliability

## System Requirements

### Core Requirements
- **Node.js**: >=14.x
- **Python**: >=3.8 with build tools (required for robotjs compilation)
  - Install with: `pip3 install setuptools` (for Python 3.12+)
  - Or use Python 3.8-3.11 which include distutils by default
- **Permissions**: Screen recording, accessibility, automation permissions required

### Platform Support
- **macOS**: Full support with AppleScript integration for advanced window management
- **Windows**: Full support with PowerShell and Win32 API integration
- **Linux**: Full support with wmctrl/xdotool integration
  - Requires: `sudo apt-get install wmctrl` (Ubuntu/Debian)
  - Optional: `sudo apt-get install xdotool` (for additional window control options)

## Performance Optimizations for AI Computer Use

- **Automatic AI Model Optimization**: All screenshots are automatically optimized for **computer vision** and AI processing
- **50% Scaling**: Images are scaled to 50% of original size for faster **AI agent** processing
- **Size Capping**: Maximum dimensions limited to 1920x1080 even after 50% scaling
- **WebP Compression**: Aggressive WebP compression (quality 40) for smallest file sizes and optimal **autonomous decision making**
- **Coordinate Caching**: Window information cached during operations for efficient **AI operator** workflows
- **Efficient Scaling**: Automatic Retina detection minimizes unnecessary processing
- **Size Limits**: Optimized to stay well under 1MB response limits for fast **computer use** automation

### Screenshot Optimization Details:
- **Original 4K screenshot**: ~8MB → **Optimized**: ~200KB (40x smaller!)
- **Retina display handling**: Automatic scaling factor detection
- **WebP format**: 25-35% smaller than equivalent JPEG
- **Quality 40**: Optimal balance between file size and AI readability

## Multi-Display & AI Computer Use Support

✅ **Full multi-display automation support!**
- **Window detection**: Finds windows across all displays
- **Window capture**: ⚠️ Limited to primary display only  
- **Window focusing**: Brings windows to front on any display
- **Cross-display mouse control**: Mouse movement works across all displays using `windowInsideCoordinates`
- **Cross-display automation**: Window management and mouse/keyboard actions work with windows on secondary displays

**Best practices for multi-display setups:**
- Use `list_windows()` to see display location (`displayLocation` field)
- Use `move_window_to_primary_screen()` to move windows from secondary displays for screenshot capture
- Use `windowInsideCoordinates: true` for reliable cross-display mouse positioning
- ⚠️ **Screenshot limitation**: Neither `screen_capture()` nor `window_capture()` can capture windows on secondary displays
- **Workaround**: Use `move_window_to_primary_screen()` to bring windows to primary display, then capture

## Limitations

- **Screenshot capture**: Both `screen_capture()` and `window_capture()` are limited to primary display only
  - **Workaround**: Use `move_window_to_primary_screen()` to relocate windows for capture
- **Direct coordinate mouse control**: Limited to primary display (use `windowInsideCoordinates` for cross-display)
- Primarily tested with Claude Desktop, Claude Code and Cursor

## Troubleshooting

### Installation Issues

**Error: `ModuleNotFoundError: No module named 'distutils'`**
- This occurs with Python 3.12+ when installing robotjs
- Solution: `pip3 install setuptools`
- Alternative: Use Python 3.8-3.11 with pyenv

**robotjs compilation fails**
- Ensure you have Xcode Command Line Tools: `xcode-select --install`
- On Linux: Install build-essential and python3-dev

### Node.js Version Mismatch

**Error: `The module '...robotjs.node' was compiled against a different Node.js version using NODE_MODULE_VERSION X. This version of Node.js requires NODE_MODULE_VERSION Y.`**

This error occurs when Claude Desktop uses a different Node.js version than the one used to install the dependencies.

**Solution:**
1. Check which Node.js version you're using: `which node && node --version`
2. Update your Claude Desktop configuration to use the specific Node.js path:
   ```json
   {
     "mcpServers": {
       "desktop-pro": {
         "command": "/full/path/to/your/node",
         "args": ["/path/to/mcp-desktop-pro/server.js"]
       }
     }
   }
   ```
   
   **Example for nvm users:**
   ```json
   {
     "mcpServers": {
       "desktop-pro": {
         "command": "/Users/username/.nvm/versions/node/v22.16.0/bin/node",
         "args": ["/path/to/mcp-desktop-pro/server.js"]
       }
     }
   }
   ```

3. If the error persists, rebuild the native modules:
   ```bash
   cd /path/to/mcp-desktop-pro
   rm -rf node_modules package-lock.json
   npm install
   ```

4. Restart Claude Desktop after making configuration changes.

### Screenshots Too Large
- Use coordinate-based cropping: `screen_capture({ x1: 0, y1: 0, x2: 800, y2: 600 })`
- Compression is automatically applied

### Mouse Positioning Issues
- Use `debug: true` in `mouse_move` for visual verification
- Use `windowInsideCoordinates` for window-relative positioning
- For `mouse_click` with coordinates: same coordinate logic as `mouse_move` applies
- Screenshot coordinates are automatically scaled 2x to account for 50% image scaling
- When clicking buttons, aim for the center rather than edges for reliable clicks

### Debug Mode Troubleshooting
- **Enable debug logging**: Add `--debug` to server arguments in Claude Desktop configuration
- **Debug log location**: Check `debug.log` file in the server directory
- **Debug screenshots**: When using `debug: true` parameter, screenshots are saved as:
  - `debug_window_*.jpg`: Window captures with click position markers
  - `debug_fullscreen_*.jpg`: Full screen captures with cursor position
- **No debug.log file**: Ensure server has write permissions to its directory
- **Large debug files**: Debug mode creates additional files; clean up periodically

### Window Focus Problems
- Use `windowId` from `list_windows` for accurate targeting

### Cross-Platform Issues

**Linux Window Management:**
- Install required tools: `sudo apt-get install wmctrl xdotool`
- Some desktop environments may require additional permissions
- GNOME users may need to enable window management extensions

**Windows PowerShell Issues:**
- Ensure PowerShell execution policy allows scripts: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
- Some antivirus software may block PowerShell automation
- Windows 10/11 with UAC may require elevated permissions for some operations

**macOS Permissions:**
- Grant "Accessibility" permissions in System Preferences → Security & Privacy
- Grant "Screen Recording" permissions for screenshot functionality
- Some apps may require additional AppleScript permissions

## Credits

This project was created and is maintained by Lukasz Rzepecki. It was initially based on [mcp-desktop-automation](https://github.com/tanob/mcp-desktop-automation) by Adriano Bonat, with significant enhancements and new features added.

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.