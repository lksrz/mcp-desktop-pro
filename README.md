# MCP Desktop Automation

A Model Context Protocol server that provides desktop automation capabilities using RobotJS and screenshot capabilities. This server enables LLMs to control mouse movements, keyboard inputs, and capture screenshots of the desktop environment.

## Configuration to use Desktop Automation Server

Here's how to configure Claude Desktop to use the MCP Desktop Automation server:

### NPX

```json
{
  "mcpServers": {
    "desktop-automation": {
      "command": "npx",
      "args": ["-y", "mcp-desktop-automation"]
    }
  }
}
```

### Permissions

This server requires system-level permissions to:

* Capture screenshots of your screen
* Control mouse movement and clicks
* Simulate keyboard input

When first running Claude Desktop with this server, you may need to grant these permissions in your operating system's security settings.

## Limitations

While this server works with various MCP clients, it has been primarily tested with Claude Desktop.

**Important**: The current implementation has a 1MB response size limit. For screen captures, this means:
* High-resolution screenshots may exceed this limit and fail
* Testing has shown 800x600 resolution works reliably
* Consider reducing screen resolution or capturing specific screen areas if you encounter issues

## Requirements

- Node.js (>=14.x)

## Components

### Tools

- **get_screen_size**
  - Gets the screen dimensions
  - No input parameters required

- **screen_capture**
  - Captures the current screen content
  - No input parameters required

- **keyboard_press**
  - Presses a keyboard key or key combination
  - Inputs:
    - `key` (string, required): Key to press (e.g., 'enter', 'a', 'control')
    - `modifiers` (array of strings, optional): Modifier keys to hold while pressing the key. Possible values: "control", "shift", "alt", "command"

- **keyboard_type**
  - Types text at the current cursor position
  - Input: `text` (string, required): Text to type

- **mouse_click**
  - Performs a mouse click
  - Inputs:
    - `button` (string, optional, default: "left"): Mouse button to click. Possible values: "left", "right", "middle"
    - `double` (boolean, optional, default: false): Whether to perform a double click

- **mouse_move**
  - Moves the mouse to specified coordinates
  - Inputs:
    - `x` (number, required): X coordinate
    - `y` (number, required): Y coordinate

### Resources

The server provides access to screenshots:

1. **Screenshot List** (`screenshot://list`)
   - Lists all available screenshots by name

2. **Screenshot Content** (`screenshot://{id}`)
   - PNG images of captured screenshots
   - Accessible via the screenshot ID (timestamp-based naming)

## Key Features

- Desktop mouse control
- Keyboard input simulation
- Screen size detection
- Screenshot capabilities
- Simple JSON response format

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
