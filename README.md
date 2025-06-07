# MCP Desktop Pro

An advanced Model Context Protocol server for comprehensive desktop automation with **advanced window management**, visual debugging, and Retina display support. This server enables LLMs to intelligently control mouse movements, keyboard inputs, capture screenshots, **manage and target specific windows**, and perform precise automation tasks with visual feedback and window-relative coordinate systems.

## 🚀 Main Advantages

- 🪟 **Advanced Window Management**: Target specific windows with precise coordinate conversion and AppleScript integration
- ⚡ **Multi-Action Chaining**: Execute complex automation sequences with timing control and error handling
- 🖼️ **AI-Optimized Screenshots**: Automatic compression, scaling, and WebP format for faster AI processing
- 🍎 **Native macOS Support**: Seamless integration with macOS window system and Retina displays
- 🎯 **Visual Debugging**: Real-time cursor position verification with visual feedback

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

### Permissions

This server requires system-level permissions to:

* Capture screenshots of your screen
* Control mouse movement and clicks
* Simulate keyboard input
* Access window information and focus windows
* Execute AppleScript commands (macOS)

When first running this MCP server, you may need to grant these permissions in your operating system's security settings.

## Key Features

- **AI-Optimized Screenshots**: Automatic 50% scaling, WebP compression, and size capping for optimal AI processing
- **Multi-Action Automation**: Execute sequences of actions with precise timing control and configurable error handling
- **Advanced Window Management**: List, focus, capture, and precisely target specific windows with intelligent window detection
- **Window-Relative Coordinates**: Click elements within specific windows accurately with automatic coordinate transformation
- **Visual Debugging**: Mouse position verification with red circle overlay
- **Retina Display Support**: Automatic scaling detection and coordinate conversion
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
  - Captures the current screen content (automatically optimized for AI analysis)
  - Inputs:
    - `x1`, `y1`, `x2`, `y2` (numbers, optional): Coordinates for partial capture
  - Features: Automatic Retina scaling, 50% scaling with 1920x1080 cap, WebP compression (quality 40)

- **list_windows**
  - Lists all open windows with their properties
  - Returns: Array of windows with `id`, `title`, `owner`, `bounds`, `processId`, etc.

- **focus_window**
  - Focuses on a specific window to bring it to the front
  - Input: `windowId` (number, required): Window ID from list_windows
  - Uses AppleScript for reliable window focusing on macOS

- **window_capture**
  - Focuses on a window and captures a screenshot of just that window (automatically optimized for AI analysis)
  - Inputs:
    - `windowId` (number, optional): Window ID from list_windows
    - `windowTitle` (string, optional): Window title (partial match)
  - Features: Automatic focusing, precise window bounds capture, 50% scaling with WebP compression

#### Mouse Control

- **mouse_move**
  - Moves the mouse to specified coordinates with automatic Retina scaling
  - Inputs:
    - `x`, `y` (numbers, required): Target coordinates
    - `debug` (boolean, optional): Show red circle at cursor position for verification
    - `windowInsideCoordinates` (boolean, optional): Treat coordinates as relative to window
    - `windowId` (number, optional): Window ID for coordinate conversion
  - Features: Automatic scaling, visual debugging, window-relative positioning

- **mouse_click**
  - Performs a mouse click with optional move-to-coordinates and duration control
  - Inputs:
    - `button` (string, optional, default: "left"): "left", "right", "middle"
    - `double` (boolean, optional): Whether to perform a double click
    - `windowId` (number, optional): Focus window before clicking
    - `pressLength` (number, optional, 0-5000ms): Duration to hold mouse button
    - `x`, `y` (numbers, optional): Coordinates to move to before clicking
    - `windowInsideCoordinates` (boolean, optional): Treat x/y as relative to window
  - Features: Move and click in one action, or click at current position

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
```javascript
// 1. List windows to find target
list_windows()

// 2. Capture specific window
window_capture({ windowId: 12345 })

// 3. Option A: Move then click (two steps)
mouse_move({ 
  x: 150, y: 200, 
  windowInsideCoordinates: true, 
  windowId: 12345,
  debug: true  // Show red circle for verification
})
mouse_click({ windowId: 12345 })

// 3. Option B: Move and click in one action
mouse_click({
  x: 150, y: 200,
  windowInsideCoordinates: true,
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
mouse_move({ x: 150, y: 200, windowInsideCoordinates: true, windowId: 12345 })
mouse_click({ windowId: 12345 })

// New approach (single call with coordinates)
mouse_click({
  x: 150, y: 200,
  windowInsideCoordinates: true,
  windowId: 12345,
  button: "left",
  pressLength: 500  // Hold for 500ms
})

// Works with all coordinate systems
mouse_click({ x: 400, y: 300 })  // Absolute screen coordinates
mouse_click({ 
  x: 100, y: 150, 
  windowInsideCoordinates: true, 
  windowId: 12345 
})  // Window-relative coordinates
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
        windowInsideCoordinates: true, 
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

### Screenshot Scaling and Coordinate Handling
The server automatically handles multiple scaling factors:
- **Screenshots**: Always scaled to 50% for AI optimization
- **Retina displays**: Automatic detection and coordinate conversion
- **Mouse coordinates**: Automatically scaled up 2x to account for 50% screenshot scaling
- **Window coordinates**: Properly scaled for accurate positioning

### Window-Relative Coordinates
When using `windowInsideCoordinates: true`:
1. Coordinates are relative to the window's top-left corner (0,0)
2. **Screenshot scaling applied**: Coordinates × 2 (from 50% scaled screenshot)
3. **Retina scaling applied**: If needed, coordinates ÷ retina factor
4. **Window offset added**: Final coordinates = scaled coords + window position
5. Perfect for clicking elements within specific windows

## System Requirements

- **macOS**: Recommended (full AppleScript support)
- **Node.js**: >=14.x
- **Python**: >=3.8 with build tools (required for robotjs compilation)
  - Install with: `pip3 install setuptools` (for Python 3.12+)
  - Or use Python 3.8-3.11 which include distutils by default
- **Permissions**: Screen recording, accessibility, automation permissions required

## Performance Optimizations

- **Automatic AI Optimization**: All screenshots are automatically optimized for AI processing
- **50% Scaling**: Images are scaled to 50% of original size for faster processing
- **Size Capping**: Maximum dimensions limited to 1920x1080 even after 50% scaling
- **WebP Compression**: Aggressive WebP compression (quality 40) for smallest file sizes
- **Coordinate Caching**: Window information cached during operations
- **Efficient Scaling**: Automatic Retina detection minimizes unnecessary processing
- **Size Limits**: Optimized to stay well under 1MB response limits

### Screenshot Optimization Details:
- **Original 4K screenshot**: ~8MB → **Optimized**: ~200KB (40x smaller!)
- **Retina display handling**: Automatic scaling factor detection
- **WebP format**: 25-35% smaller than equivalent JPEG
- **Quality 40**: Optimal balance between file size and AI readability

## Multi-Display Support

✅ **Full multi-display automation support!**
- **Window detection**: Finds windows across all displays
- **Window capture**: Screenshots windows on any display  
- **Window focusing**: Brings windows to front on any display
- **Cross-display mouse control**: Mouse movement works across all displays using `windowInsideCoordinates`
- **Cross-display automation**: All tools work with windows on secondary displays

**Best practices for multi-display setups:**
- Use `list_windows()` to see display location (`displayLocation` field)
- Use `windowInsideCoordinates: true` for reliable cross-display mouse positioning
- Use `window_capture()` to get screenshots of windows on any display

## Limitations

- **Screen capture**: Only captures primary display (use `window_capture()` for secondary displays)
- **Direct coordinate mouse control**: Limited to primary display (use `windowInsideCoordinates` for cross-display)
- Primarily tested with Claude Desktop, Claude Code and Cursor
- macOS optimized (Windows/Linux may have limited window management features)

## Troubleshooting

### Installation Issues

**Error: `ModuleNotFoundError: No module named 'distutils'`**
- This occurs with Python 3.12+ when installing robotjs
- Solution: `pip3 install setuptools`
- Alternative: Use Python 3.8-3.11 with pyenv

**robotjs compilation fails**
- Ensure you have Xcode Command Line Tools: `xcode-select --install`
- On Linux: Install build-essential and python3-dev

### Screenshots Too Large
- Use coordinate-based cropping: `screen_capture({ x1: 0, y1: 0, x2: 800, y2: 600 })`
- Compression is automatically applied

### Mouse Positioning Issues
- Use `debug: true` in `mouse_move` for visual verification
- Use `windowInsideCoordinates` for window-relative positioning
- For `mouse_click` with coordinates: same coordinate logic as `mouse_move` applies
- Screenshot coordinates are automatically scaled 2x to account for 50% image scaling

### Window Focus Problems
- Use `windowId` from `list_windows` for accurate targeting

## Credits

This project is based on [mcp-desktop-automation](https://github.com/tanob/mcp-desktop-automation) by Adriano Bonat, with significant enhancements and new features added by Lukasz Rzepecki.

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.