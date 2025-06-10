# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP Desktop Pro is an advanced Model Context Protocol server for desktop automation. It provides comprehensive control over mouse, keyboard, screenshots, and window management with intelligent scaling for Retina displays and AI-optimized image processing.

## Development Commands

- **Start server**: `npm start` or `node server.js`
- **Start server with debug logging**: `node server.js --debug`
- **Install dependencies**: `npm install`
- **Test**: No tests configured (placeholder command exists)

### Debug Mode

Use `--debug` flag to enable comprehensive debug logging:
- Creates `debug.log` file in the server directory
- Logs all mouse movement transformations and coordinate calculations
- Saves debug screenshots when `debug: true` parameter is used in tools
- Includes startup information and error details

#### Debug Logging Features:
- **Coordinate transformations**: Detailed logs of AI coordinates → screen coordinates
- **Window metadata**: Capture dimensions, scaling factors, and bounds information
- **Error tracking**: Complete stack traces for troubleshooting
- **Operation timing**: Timestamps for all major operations
- **File operations**: Debug screenshot saves with position markers

#### Debug Files Created:
- `debug.log`: Text log with all debug information
- `debug_window_*.jpg`: Window captures with red circle markers showing intended click positions
- `debug_window_unmarked_*.jpg`: Clean window captures for comparison
- `debug_fullscreen_*.jpg`: Full screen captures with cursor position markers

## Architecture

### Core Structure
- **Single-file architecture**: All functionality is contained in `server.js`
- **MCP Server Pattern**: Uses `@modelcontextprotocol/sdk` for tool registration and communication
- **Capability-based design**: Each tool wraps a capability function that handles the actual automation

### Key Dependencies
- `robotjs`: Low-level mouse/keyboard control
- `screenshot-desktop`: Screen capture functionality  
- `active-win`: Window enumeration and management
- `sharp`: Image processing and optimization
- `@modelcontextprotocol/sdk`: MCP protocol implementation

### Coordinate System Architecture
The server implements a complex coordinate transformation pipeline:

1. **Screenshot Scaling**: All screenshots are automatically scaled to 50% for AI processing with aspect ratio preservation
2. **Retina Detection**: Automatically detects high-DPI displays and applies scaling factors
3. **Window-Relative Coordinates**: Supports coordinates relative to specific windows
4. **Transformation Pipeline**: 
   - AI coordinates (from 50% scaled screenshots) → 2x scaling
   - Retina scaling (if detected) → coordinate adjustment  
   - Window offset (if window-relative) → final screen coordinates

### Recent Coordinate System Fixes
- **Aspect ratio preservation**: Window captures now use Sharp's `fit: 'inside'` instead of `fit: 'fill'` to maintain proper aspect ratios and prevent distortion
- **Removed title bar offset**: Eliminated the incorrect MACOS_TITLE_BAR_HEIGHT (28px) offset that was causing Y-axis positioning errors
- **Double-click support**: Fixed double-click implementation using correct robotjs syntax (`robot.mouseClick('left', true)`)
- **Actual dimensions tracking**: Window capture now measures actual AI image dimensions after resize for accurate scaling
- **Button center guidance**: Updated tool descriptions to recommend clicking button centers for reliability

### Image Processing Pipeline
- **AI Optimization**: Automatic 50% scaling with 1280x720 cap and aspect ratio preservation
- **WebP Compression**: Quality 15 for optimal file size vs readability
- **Format Conversion**: JPEG input → WebP output for better compression
- **Visual Debugging**: Red circle overlays for mouse position verification

### Error Handling Patterns
- **Graceful Degradation**: Functions return `{ success: boolean, error?: string }` objects
- **Window Validation**: Comprehensive checks for window existence and properties
- **Coordinate Validation**: Bounds checking and transformation validation
- **Multi-Action Support**: `continueOnError` flag for sequential automation

## Window Management Implementation

The server uses a comprehensive cross-platform approach for window management:
- **macOS**: AppleScript integration with multiple fallback strategies (app name → bundle ID → System Events)
- **Windows**: PowerShell with Win32 API calls (SetForegroundWindow, SetWindowPos)
- **Linux**: wmctrl and xdotool integration for window control
- **Window Movement**: Automatic repositioning of windows from secondary displays to primary screen
- **Window Enumeration**: Real-time window list with comprehensive metadata
- **Secondary Display Support**: Move windows to primary screen to enable screenshot capture

## Development Notes

### Coordinate System - CRITICAL INFORMATION
**All mouse coordinates (x, y) must be relative to the TOP-LEFT corner (0,0) of the window screenshot/image.**

- ✅ **Correct**: Use coordinates exactly as they appear in the captured window image
- ✅ **Reference point**: Top-left corner of the window screenshot is always (0,0)
- ❌ **Never**: Use coordinates relative to internal UI elements, content areas, or tabs
- ❌ **Never**: Add manual offsets for title bars, menus, or toolbars

**Example**: If you see a button at position (150, 200) in the window screenshot, use exactly `x: 150, y: 200`.

### Coordinate Debugging
When working with mouse positioning issues, use the `debug: true` parameter in `mouse_move` to get visual feedback with red circle overlays showing exact cursor positions. When clicking buttons (especially in grids like calculators), always aim for the center of the button rather than edges to ensure reliable clicks.

### Automatic Coordinate Metadata
The `mouse_move` and `mouse_click` tools now automatically create coordinate metadata when it's not available from a previous `window_capture` call. This allows for simpler workflows:
- **Basic workflow**: `list_windows` → `mouse_click` (with coordinates) 
- **Precise workflow**: `list_windows` → `window_capture` → `mouse_click` (with coordinates)

The precise workflow using `window_capture` first provides better coordinate scaling for AI-optimized images, while the basic workflow uses 1:1 coordinate mapping.

### Secondary Display Window Management
For windows on secondary displays that cannot be captured:
- **Detection workflow**: `list_windows` shows `displayLocation` and `isOnPrimaryDisplay` fields
- **Move to primary**: `move_window_to_primary_screen` relocates windows to enable screenshot capture
- **Automated workflow**: `list_windows` → `move_window_to_primary_screen` → `window_capture` → automation

### Multi-Action Sequences  
The `multiple_desktop_actions` tool is the preferred method for complex automation workflows. It provides timing control, error handling, and sequential execution guarantees.

### Image Format Considerations
Screenshots are optimized for AI processing - all images are WebP format with aggressive compression. Original quality is sacrificed for faster AI processing and smaller response sizes.

### Multi-Display Support
- **Full cross-display automation**: Mouse, keyboard, and window management work across all displays
- **Window-relative coordinates**: Use `windowInsideCoordinates: true` for reliable multi-display mouse control
- **Display detection**: `list_windows()` includes `displayLocation` and `isOnPrimaryDisplay` fields
- **Limitation**: `screen_capture()` only captures primary display; use `window_capture()` for secondary displays

### Platform-Specific Features
- **macOS**: Full AppleScript integration for window management
- **Cross-platform**: Core mouse/keyboard functionality works across platforms
- **Retina Support**: Automatic scaling detection primarily optimized for macOS Retina displays

### Real time development and debugging
- Console logging is prohibited as it breaks the MCP stdio protocol
- Ask USER to restart the MCP server after each code change to test and debug with fresh code