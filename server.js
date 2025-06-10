#!/usr/bin/env node

// Import required packages
const screenshot = require('screenshot-desktop');
const robot = require('robotjs');
const { McpServer, ResourceTemplate } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const fs = require('fs');

const packageJson = require('./package.json');

// Create server instance
const server = new McpServer(
  {
    name: "mcp-desktop-automation",
    version: packageJson.version,
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      logging: {},
    },
  },
);

const screenshots = {};

// Debug logging utility
const path = require('path');
const os = require('os');

// Platform detection
const platform = os.platform();
const isWindows = platform === 'win32';
const isMacOS = platform === 'darwin';
const isLinux = platform === 'linux';

// Parse command line arguments
const args = process.argv.slice(2);
const isGlobalDebugEnabled = args.includes('--debug');
const showHelp = args.includes('--help') || args.includes('-h');

// Show help if requested
if (showHelp) {
  console.log(`
MCP Desktop Pro - Advanced Desktop Automation Server

USAGE:
  node server.js [OPTIONS]

OPTIONS:
  --debug        Enable comprehensive debug logging
                 - Creates debug.log file with detailed operation logs
                 - Saves debug screenshots for mouse operations
                 - Logs coordinate transformations and error details

  --help, -h     Show this help message

EXAMPLES:
  node server.js              # Start server in normal mode
  node server.js --debug      # Start server with debug logging enabled

DESCRIPTION:
  MCP Desktop Pro provides comprehensive desktop automation capabilities
  through the Model Context Protocol (MCP). It offers:
  
  • Mouse control with intelligent coordinate scaling
  • Keyboard input and key combinations
  • Screen and window capture with AI optimization
  • Window management and focus control
  • Multi-action sequences with error handling
  
  The server runs on stdio and communicates via the MCP protocol.
  Debug mode is recommended for troubleshooting coordinate issues.

MORE INFO:
  See CLAUDE.md for detailed architecture and usage documentation.
`);
  process.exit(0);
}

const debugLog = (message, debugEnabled = false) => {
  // Enable debug if either global flag is set OR local debugEnabled is true
  if (!debugEnabled && !isGlobalDebugEnabled) return;
  
  const debugLogPath = path.join(__dirname, 'debug.log');
  try {
    // Ensure the debug log exists
    if (!fs.existsSync(debugLogPath)) {
      fs.writeFileSync(debugLogPath, '');
    }
    fs.appendFileSync(debugLogPath, message);
  } catch (error) {
    // Silently ignore debug logging errors to avoid breaking MCP protocol
  }
};

// Cross-platform window management helpers
const windowHelpers = {
  async focusWindow(targetWindow) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    if (isMacOS) {
      // macOS: Use AppleScript with simple single-line commands
      const appName = targetWindow.owner.name;
      
      try {
        await execAsync(`osascript -e 'tell application "${appName}" to activate'`);
        return { success: true };
      } catch (scriptError) {
        // Fallback: try with bundle ID
        try {
          await execAsync(`osascript -e 'tell application id "${targetWindow.owner.bundleId}" to activate'`);
          return { success: true };
        } catch (bundleError) {
          return { success: false, error: `Failed to focus window: ${scriptError.message}` };
        }
      }
    } else if (isWindows) {
      // Windows: Use PowerShell to focus window
      try {
        const processId = targetWindow.owner.processId;
        const powershellScript = `
          Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }'
          $process = Get-Process -Id ${processId} -ErrorAction SilentlyContinue
          if ($process -and $process.MainWindowHandle -ne [IntPtr]::Zero) {
            [Win32]::ShowWindow($process.MainWindowHandle, 9)
            [Win32]::SetForegroundWindow($process.MainWindowHandle)
          }
        `;
        await execAsync(`powershell -Command "${powershellScript}"`);
        return { success: true };
      } catch (error) {
        return { success: false, error: `Failed to focus window on Windows: ${error.message}` };
      }
    } else if (isLinux) {
      // Linux: Use wmctrl or xdotool
      try {
        const windowTitle = targetWindow.title;
        // Try wmctrl first
        await execAsync(`wmctrl -a "${windowTitle}"`);
        return { success: true };
      } catch (wmctrlError) {
        try {
          // Fallback to xdotool
          await execAsync(`xdotool search --name "${targetWindow.title}" windowactivate`);
          return { success: true };
        } catch (xdotoolError) {
          return { success: false, error: `Failed to focus window on Linux: wmctrl: ${wmctrlError.message}, xdotool: ${xdotoolError.message}` };
        }
      }
    } else {
      return { success: false, error: `Window focusing not implemented for platform: ${platform}` };
    }
  },

  async moveWindow(targetWindow, newX, newY, newWidth, newHeight) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    if (isMacOS) {
      // macOS: Use AppleScript (existing implementation)
      return await this.moveWindowMacOS(targetWindow, newX, newY, newWidth, newHeight);
    } else if (isWindows) {
      // Windows: Use PowerShell
      try {
        const processId = targetWindow.owner.processId;
        const powershellScript = `
          Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class Win32 { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint uFlags); }'
          $process = Get-Process -Id ${processId} -ErrorAction SilentlyContinue
          if ($process -and $process.MainWindowHandle -ne [IntPtr]::Zero) {
            [Win32]::SetWindowPos($process.MainWindowHandle, [IntPtr]::Zero, ${newX}, ${newY}, ${newWidth}, ${newHeight}, 0x0040)
          }
        `;
        await execAsync(`powershell -Command "${powershellScript}"`);
        return { 
          success: true, 
          message: `Window moved on Windows to position (${newX}, ${newY}) with size ${newWidth}x${newHeight}`,
          newBounds: { x: newX, y: newY, width: newWidth, height: newHeight }
        };
      } catch (error) {
        return { success: false, error: `Failed to move window on Windows: ${error.message}` };
      }
    } else if (isLinux) {
      // Linux: Use wmctrl
      try {
        const windowTitle = targetWindow.title;
        await execAsync(`wmctrl -r "${windowTitle}" -e 0,${newX},${newY},${newWidth},${newHeight}`);
        return { 
          success: true, 
          message: `Window moved on Linux to position (${newX}, ${newY}) with size ${newWidth}x${newHeight}`,
          newBounds: { x: newX, y: newY, width: newWidth, height: newHeight }
        };
      } catch (error) {
        return { success: false, error: `Failed to move window on Linux: ${error.message}. Make sure wmctrl is installed: sudo apt-get install wmctrl` };
      }
    } else {
      return { success: false, error: `Window moving not implemented for platform: ${platform}` };
    }
  },

  async moveWindowMacOS(targetWindow, newX, newY, newWidth, newHeight) {
    // Existing macOS AppleScript implementation
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const appName = targetWindow.owner.name;
    
    // Special handling for sandboxed apps like Calculator
    if (appName === 'Calculator' || targetWindow.owner.bundleId === 'com.apple.calculator') {
      return await this.moveWindowUsingRobotJS(targetWindow, newX, newY, newWidth, newHeight);
    }
    
    // Method 1: Try position and size separately (works better with Calculator)
    try {
      await execAsync(`osascript -e 'tell application "${appName}" to activate'`);
      await new Promise(resolve => setTimeout(resolve, 200));
      // Set position and size separately instead of bounds
      await execAsync(`osascript -e 'tell application "${appName}" to set position of first window to {${newX}, ${newY}}'`);
      await execAsync(`osascript -e 'tell application "${appName}" to set size of first window to {${newWidth}, ${newHeight}}'`);
      return { 
        success: true, 
        message: `Window moved to primary screen at position (${newX}, ${newY}) with size ${newWidth}x${newHeight}`,
        newBounds: { x: newX, y: newY, width: newWidth, height: newHeight }
      };
    } catch (simpleError) {
      // Method 2: Try with bundle ID using position and size separately
      try {
        await execAsync(`osascript -e 'tell application id "${targetWindow.owner.bundleId}" to activate'`);
        await new Promise(resolve => setTimeout(resolve, 200));
        await execAsync(`osascript -e 'tell application id "${targetWindow.owner.bundleId}" to set position of first window to {${newX}, ${newY}}'`);
        await execAsync(`osascript -e 'tell application id "${targetWindow.owner.bundleId}" to set size of first window to {${newWidth}, ${newHeight}}'`);
        return { 
          success: true, 
          message: `Window moved to primary screen at position (${newX}, ${newY}) with size ${newWidth}x${newHeight}`,
          newBounds: { x: newX, y: newY, width: newWidth, height: newHeight }
        };
      } catch (bundleError) {
        // Method 3: Try System Events with separate commands
        try {
          // First activate the application
          await execAsync(`osascript -e 'tell application "${appName}" to activate'`);
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Then set position and size separately
          await execAsync(`osascript -e 'tell application "System Events" to tell application process "${appName}" to set position of first window to {${newX}, ${newY}}'`);
          await execAsync(`osascript -e 'tell application "System Events" to tell application process "${appName}" to set size of first window to {${newWidth}, ${newHeight}}'`);
          
          return { 
            success: true, 
            message: `Window moved to primary screen at position (${newX}, ${newY}) with size ${newWidth}x${newHeight} (using System Events)`,
            newBounds: { x: newX, y: newY, width: newWidth, height: newHeight }
          };
        } catch (systemError) {
          // Method 4: Try window by index with System Events
          try {
            await execAsync(`osascript -e 'tell application "${appName}" to activate'`);
            await new Promise(resolve => setTimeout(resolve, 200));
            
            await execAsync(`osascript -e 'tell application "System Events" to tell application process "${appName}" to set position of window 1 to {${newX}, ${newY}}'`);
            await execAsync(`osascript -e 'tell application "System Events" to tell application process "${appName}" to set size of window 1 to {${newWidth}, ${newHeight}}'`);
            
            return { 
              success: true, 
              message: `Window moved to primary screen at position (${newX}, ${newY}) with size ${newWidth}x${newHeight} (using System Events window 1)`,
              newBounds: { x: newX, y: newY, width: newWidth, height: newHeight }
            };
          } catch (indexError) {
            return { 
              success: false, 
              error: `Failed to move window with all methods. App: "${appName}", Bundle: "${targetWindow.owner.bundleId}". Errors: Simple: ${simpleError.message}, Bundle: ${bundleError.message}, System Events: ${systemError.message}, Index: ${indexError.message}` 
            };
          }
        }
      }
    }
  },

  async moveWindowUsingRobotJS(targetWindow, newX, newY, newWidth, newHeight) {
    try {
      // Focus the window first by clicking on it
      const centerX = targetWindow.bounds.x + targetWindow.bounds.width / 2;
      const centerY = targetWindow.bounds.y + targetWindow.bounds.height / 2;
      
      // Click to focus the window
      robot.moveMouse(centerX, centerY);
      robot.mouseClick();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Use keyboard shortcut to enter window move mode (Command+Option+F5 on macOS enables switch control)
      // Actually, let's use a simpler approach - drag the window
      
      // Find the title bar area (top of window)
      const titleBarY = targetWindow.bounds.y + 10; // Approximate title bar height
      const titleBarX = targetWindow.bounds.x + targetWindow.bounds.width / 2;
      
      // Drag from current position to new position
      robot.moveMouse(titleBarX, titleBarY);
      robot.mouseToggle('down');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Drag to new position
      robot.moveMouse(newX + newWidth / 2, newY + 10);
      await new Promise(resolve => setTimeout(resolve, 50));
      robot.mouseToggle('up');
      
      // Wait for window to settle
      await new Promise(resolve => setTimeout(resolve, 200));
      
      return {
        success: true,
        message: `Window moved using robotJS drag to position (${newX}, ${newY})`,
        newBounds: { x: newX, y: newY, width: newWidth, height: newHeight }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to move window using robotJS: ${error.message}`
      };
    }
  }
};

// Implementation of capabilities
const capabilityImplementations = {
  screen_capture: async (params = {}) => {
    try {
      // Take a screenshot (compress to JPEG to reduce size)
      let img = await screenshot({ format: 'jpg' });
      const sharp = require('sharp');
      
      // Get initial metadata
      const metadata = await sharp(img).metadata();
      const screenSize = robot.getScreenSize();
      
      // Calculate scaling factor for Retina detection
      const scaleX = metadata.width / screenSize.width;
      const scaleY = metadata.height / screenSize.height;
      const isHighDPI = scaleX > 1.5 || scaleY > 1.5;
      
      let sharpInstance = sharp(img);
      
      // If coordinates are provided, crop the image first
      if (params.x1 !== undefined && params.y1 !== undefined && 
          params.x2 !== undefined && params.y2 !== undefined) {
        
        let scaledX1, scaledY1, scaledX2, scaledY2;
        
        if (isHighDPI) {
          // Apply scaling for high-DPI displays (Retina)
          scaledX1 = Math.round(params.x1 * scaleX);
          scaledY1 = Math.round(params.y1 * scaleY);
          scaledX2 = Math.round(params.x2 * scaleX);
          scaledY2 = Math.round(params.y2 * scaleY);
        } else {
          // Use coordinates as-is for standard displays
          scaledX1 = params.x1;
          scaledY1 = params.y1;
          scaledX2 = params.x2;
          scaledY2 = params.y2;
        }
        
        const width = scaledX2 - scaledX1;
        const height = scaledY2 - scaledY1;
        
        if (width <= 0 || height <= 0) {
          throw new Error('Invalid coordinates: x2 must be greater than x1 and y2 must be greater than y1');
        }
        
        sharpInstance = sharpInstance.extract({
          left: scaledX1,
          top: scaledY1,
          width: width,
          height: height
        });
      }
      
      // Always apply AI optimization for faster processing
      // Get current dimensions (after potential cropping)
      const currentMeta = await sharpInstance.metadata();
      const currentWidth = currentMeta.width;
      const currentHeight = currentMeta.height;
      
      // Scale to 50% of original size, but cap at 1280x720 for much smaller responses
      const targetWidth = Math.min(Math.round(currentWidth * 0.5), 1280);
      const targetHeight = Math.min(Math.round(currentHeight * 0.5), 720);
      
      // Only resize if the target is smaller than current
      if (targetWidth < currentWidth || targetHeight < currentHeight) {
        sharpInstance = sharpInstance.resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }
      
      // Apply very aggressive WebP compression for AI processing
      img = await sharpInstance.webp({ quality: 15, effort: 0 }).toBuffer();
      
      // Check final size and abort if too large (stay well under 1MB limit)
      const sizeKB = img.length / 1024;
      if (sizeKB > 300) {
        return { success: false, error: `Screenshot too large: ${sizeKB.toFixed(1)}KB (max 300KB). Try capturing a smaller area or window.` };
      }
      
      const imgInBase64 = img.toString('base64');
      const timestamp = Math.floor(Date.now() / 1000);
      const screenshotKey = `screenshot-${timestamp}`;

      screenshots[screenshotKey] = imgInBase64;
      await server.server.sendResourceListChanged();
      
      // Calculate actual AI image dimensions
      const finalMeta = await sharp(img).metadata();
      const aiImageWidth = finalMeta.width;
      const aiImageHeight = finalMeta.height;
      
      // Store screen capture metadata for coordinate transformations
      // We will assume the AI sees the image at the size we report.
      const aiActualWidth = aiImageWidth;
      const aiActualHeight = aiImageHeight;
      
      const screenCaptureMetadata = {
        originalSize: { width: metadata.width, height: metadata.height },
        logicalScreenSize: { width: screenSize.width, height: screenSize.height },
        reportedAiSize: { width: aiImageWidth, height: aiImageHeight },
        aiImageSize: { width: aiActualWidth, height: aiActualHeight }, // What AI actually sees
        timestamp: Date.now()
      };
      
      // Store in global for mouse_move to access
      if (!global.screenCaptureMetadata) {
        global.screenCaptureMetadata = {};
      }
      global.lastScreenCapture = screenCaptureMetadata;
      
      return {
        content: [
          {
            type: "text",
            text: `Screenshot ${screenshotKey} taken. Screen size: ${screenSize.width}x${screenSize.height}, AI sees: ${aiImageWidth}x${aiImageHeight}`,
          },
          {
            type: "image",
            mimeType: "image/webp",
            data: imgInBase64,
          },
        ],
        isError: false
      };
    } catch (error) {
      // Error captured silently to avoid interfering with MCP protocol
      return { success: false, error: error.message };
    }
  },

  mouse_move: async (params) => {
    try {
      const { x, y, debug = false, windowId } = params;
      
      // Add a timestamped log to mark the beginning of the function call
      const timestamp = new Date().toISOString();
      debugLog(`\n--- MOUSE_MOVE START ${timestamp} ---\n`, debug);
      debugLog(`Params: ${JSON.stringify(params)}\n`, debug);
      
      // Store original coordinates for debug visualization
      const originalX = x;
      const originalY = y;
      
      let moveX = x;
      let moveY = y;
      
      // Always focus window first if windowId is provided
      const focusResult = await capabilityImplementations.focus_window({ windowId });
      if (!focusResult.success) {
        return focusResult;
      }
      // Wait for window to focus
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // We only support window-relative coordinates now, as it's the only reliable method.
      
      if (!windowId) {
        return { success: false, error: 'windowId is a required parameter for mouse_move.' };
      }
      
      // Get or create metadata for this window
      let metadata;
      if (!global.windowCaptureMetadata || !global.windowCaptureMetadata[windowId]) {
        debugLog(`No window capture metadata found for window ${windowId}, creating basic metadata for coordinate transformation\n`, debug);
        
        // Get window information to create basic metadata
        const activeWin = require('active-win');
        const windows = await activeWin.getOpenWindows();
        const targetWindow = windows.find(w => w && w.id === windowId);
        
        if (!targetWindow) {
          return { success: false, error: `Window not found with ID: ${windowId}` };
        }
        
        // Create basic metadata assuming no AI image scaling (1:1 coordinate mapping)
        metadata = {
          windowId: windowId,
          originalLogicalSize: { width: targetWindow.bounds.width, height: targetWindow.bounds.height },
          aiImageSize: { width: targetWindow.bounds.width, height: targetWindow.bounds.height },
          timestamp: Date.now()
        };
        
        // Store it for future use
        if (!global.windowCaptureMetadata) {
          global.windowCaptureMetadata = {};
        }
        global.windowCaptureMetadata[windowId] = metadata;
        
        debugLog(`Created basic metadata for window ${windowId}: ${JSON.stringify(metadata)}\n`, debug);
      } else {
        metadata = global.windowCaptureMetadata[windowId];
        const age = Date.now() - metadata.timestamp;
        
        if (age > 5 * 60 * 1000) {
          debugLog(`Window capture metadata is stale (${(age/1000).toFixed(1)}s old), creating fresh basic metadata\n`, debug);
          
          // Refresh with basic metadata
          const activeWin = require('active-win');
          const windows = await activeWin.getOpenWindows();
          const targetWindow = windows.find(w => w && w.id === windowId);
          
          if (!targetWindow) {
            return { success: false, error: `Window not found with ID: ${windowId}` };
          }
          
          metadata = {
            windowId: windowId,
            originalLogicalSize: { width: targetWindow.bounds.width, height: targetWindow.bounds.height },
            aiImageSize: { width: targetWindow.bounds.width, height: targetWindow.bounds.height },
            timestamp: Date.now()
          };
          
          global.windowCaptureMetadata[windowId] = metadata;
          debugLog(`Refreshed basic metadata for window ${windowId}\n`, debug);
        }
      }
      
      // Get current window information (we might have it from metadata creation above)
      const activeWin = require('active-win');
      const windows = await activeWin.getOpenWindows();
      const targetWindow = windows.find(w => w && w.id === windowId);
      
      if (!targetWindow) {
        return { success: false, error: `Window not found for coordinate conversion with ID: ${windowId}` };
      }
      
      // Title bar height removed - no longer needed for coordinate calculations

      // The scaling factor is the ratio of the window's original logical size 
      // to the final size of the image that was sent to the AI.
      const scaleX = metadata.originalLogicalSize.width / metadata.aiImageSize.width;
      const scaleY = metadata.originalLogicalSize.height / metadata.aiImageSize.height;

      // Scale the AI's coordinates to find the position within the logical window
      let scaledX = Math.round(x * scaleX);
      let scaledY = Math.round(y * scaleY);

      // Add the window's origin to get the final screen coordinates.
      moveX = targetWindow.bounds.x + scaledX;
      moveY = targetWindow.bounds.y + scaledY;

      // Log the complete transformation for easy debugging
      const logTimestamp = new Date().toISOString();
      debugLog(`\n=== MOUSE_MOVE_TRANSFORM ${logTimestamp} ===\n`, debug);
      debugLog(`  - AI Coords: (${x}, ${y})\n`, debug);
      debugLog(`  - AI Image Size: ${metadata.aiImageSize.width}x${metadata.aiImageSize.height}\n`, debug);
      debugLog(`  - Logical Window Size: ${metadata.originalLogicalSize.width}x${metadata.originalLogicalSize.height}\n`, debug);
      debugLog(`  - Scale Factors: X=${scaleX.toFixed(3)}, Y=${scaleY.toFixed(3)}\n`, debug);
      debugLog(`  - Scaled Coords: (${scaledX}, ${scaledY})\n`, debug);
      debugLog(`  - Window Origin: (${targetWindow.bounds.x}, ${targetWindow.bounds.y})\n`, debug);
      debugLog(`  - Final Screen Coords: (${moveX}, ${moveY})\n`, debug);
      
      robot.moveMouse(moveX, moveY);
      
      if (debug) {
        const sharp = require('sharp');
        const timestamp = Date.now();
        
        // First, if windowInsideCoordinates, capture and save the window with intended click point
        try {
          debugLog(`DEBUG: Attempting to capture window ${windowId} for debug...\n`, debug);
          
          const windowCapture = await capabilityImplementations.window_capture({ windowId });
          
          if (!windowCapture || windowCapture.isError) {
            debugLog(`DEBUG: Window capture failed: ${windowCapture ? windowCapture.error : 'null response'}\n`, debug);
          } else if (windowCapture.content && windowCapture.content[1]) {
            const windowImgBuffer = Buffer.from(windowCapture.content[1].data, 'base64');
            
            // Get metadata to understand the image size
            const windowMeta = await sharp(windowImgBuffer).metadata();
            debugLog(`DEBUG: Window image size: ${windowMeta.width}x${windowMeta.height}, format: ${windowMeta.format}\n`, debug);
            
            // Create a red circle at the intended click position
            const circleSize = 10;
            
            // The debug window image size should match the AI image size from metadata
            const scaleFactorForDebugX = windowMeta.width / metadata.aiImageSize.width;
            const scaleFactorForDebugY = windowMeta.height / metadata.aiImageSize.height;
            
            debugLog(`DEBUG: Using metadata scale - Window debug image: ${windowMeta.width}x${windowMeta.height}, AI saw: ${metadata.aiImageSize.width}x${metadata.aiImageSize.height}\n`, debug);
            
            const scaledX = Math.round(originalX * scaleFactorForDebugX);
            const scaledY = Math.round(originalY * scaleFactorForDebugY);
            
            debugLog(`DEBUG: Original AI coordinates: (${originalX}, ${originalY}), Scaled for window capture: (${scaledX}, ${scaledY})\n`, debug);
            debugLog(`DEBUG: Circle will be placed at top=${Math.round(scaledY - circleSize/2)}, left=${Math.round(scaledX - circleSize/2)}\n`, debug);
            
            const circle = Buffer.from(
              `<svg width="${circleSize}" height="${circleSize}">
                <circle cx="${circleSize/2}" cy="${circleSize/2}" r="${circleSize/2-1}" 
                        fill="red" fill-opacity="0.7" stroke="darkred" stroke-width="2"/>
                <circle cx="${circleSize/2}" cy="${circleSize/2}" r="1" fill="white"/>
              </svg>`
            );
            
            // Mark the intended position in the window capture with scaled coordinates
            const markedWindow = await sharp(windowImgBuffer)
              .composite([{
                input: circle,
                top: Math.max(0, Math.round(scaledY - circleSize/2)),
                left: Math.max(0, Math.round(scaledX - circleSize/2))
              }])
              .jpeg({ quality: 80 })
              .toBuffer();
            
            // Save the marked window capture
            if (debug || isGlobalDebugEnabled) {
              const windowDebugPath = path.join(__dirname, `debug_window_${timestamp}.jpg`);
              fs.writeFileSync(windowDebugPath, markedWindow);
              debugLog(`DEBUG: Saved window capture with intended click at (${originalX}, ${originalY}) to ${windowDebugPath}\n`, debug);
            }
            
            // Also save without mark for comparison
            if (debug || isGlobalDebugEnabled) {
              const unmarkedPath = path.join(__dirname, `debug_window_unmarked_${timestamp}.jpg`);
              fs.writeFileSync(unmarkedPath, windowImgBuffer);
              debugLog(`DEBUG: Saved unmarked window capture to ${unmarkedPath}\n`, debug);
            }
          } else {
            debugLog(`DEBUG: Window capture response missing content\n`, debug);
          }
        } catch (err) {
          debugLog(`DEBUG: Error in window debug save: ${err.message}\n${err.stack}\n`, debug);
        }
        
        // Take a screenshot to show where the cursor is positioned
        const screenshot = await capabilityImplementations.screen_capture();
        
        if (screenshot.isError === false) {
          // Get the actual cursor position from the system
          const actualCursorPos = robot.getMousePos();
          
          // Use Sharp to draw a red dot at the actual cursor position
          const sharp = require('sharp');
          const imgBuffer = Buffer.from(screenshot.content[1].data, 'base64');
          
          // Get image metadata to handle scaling
          const metadata = await sharp(imgBuffer).metadata();
          const screenSize = robot.getScreenSize();
          
          // Calculate scaling factor
          const scaleX = metadata.width / screenSize.width;
          const scaleY = metadata.height / screenSize.height;
          
          // Scale actual cursor coordinates if needed
          const scaledX = Math.round(actualCursorPos.x * scaleX);
          const scaledY = Math.round(actualCursorPos.y * scaleY);
          
          // Create a red circle overlay
          const circleSize = 20;
          const circle = Buffer.from(
            `<svg width="${circleSize}" height="${circleSize}">
              <circle cx="${circleSize/2}" cy="${circleSize/2}" r="${circleSize/2-2}" 
                      fill="none" stroke="red" stroke-width="3"/>
              <circle cx="${circleSize/2}" cy="${circleSize/2}" r="2" fill="red"/>
            </svg>`
          );
          
          // Composite the circle onto the screenshot
          const annotatedImg = await sharp(imgBuffer)
            .composite([{
              input: circle,
              top: Math.max(0, scaledY - circleSize/2),
              left: Math.max(0, scaledX - circleSize/2)
            }])
            .jpeg({ quality: 80 })
            .toBuffer();
          
          const annotatedImgBase64 = annotatedImg.toString('base64');
          
          // Save the full screenshot with actual cursor position
          if (debug || isGlobalDebugEnabled) {
            try {
              const fullScreenDebugPath = path.join(__dirname, `debug_fullscreen_${timestamp}.jpg`);
              await sharp(annotatedImg).toFile(fullScreenDebugPath);
              debugLog(`DEBUG: Saved full screenshot with actual cursor at (${actualCursorPos.x}, ${actualCursorPos.y}) to ${fullScreenDebugPath}\n`, debug);
            } catch (err) {
              // Silently ignore errors in debug saving
            }
          }
          
          const transformations = [];
          if (windowId) {
            const windows = await require('active-win').getOpenWindows();
            const targetWindow = windows.find(w => w.id === windowId);
            if (targetWindow) {
              // Recalculate window-specific scaling for debug output
              const windowLogicalWidth = targetWindow.bounds.width;
              const windowLogicalHeight = targetWindow.bounds.height;
              const isHighDPI = (metadata.width / screenSize.width) > 1.5 || (metadata.height / screenSize.height) > 1.5;
              
              let windowPhysicalWidth, windowPhysicalHeight;
              if (isHighDPI) {
                const scaleX = metadata.width / screenSize.width;
                const scaleY = metadata.height / screenSize.height;
                windowPhysicalWidth = windowLogicalWidth * scaleX;
                windowPhysicalHeight = windowLogicalHeight * scaleY;
              } else {
                windowPhysicalWidth = windowLogicalWidth;
                windowPhysicalHeight = windowLogicalHeight;
              }
              
              // Target window size if resize was working (currently unused)
              // const targetWindowWidth = Math.min(Math.round(windowPhysicalWidth * 0.5), 1280);
              // const targetWindowHeight = Math.min(Math.round(windowPhysicalHeight * 0.5), 720);
              
              // Recalculate with correct AI window size for debug output
              const debugTargetWidth = Math.min(Math.round(windowPhysicalWidth * 0.5), 1280);
              const debugTargetHeight = Math.min(Math.round(windowPhysicalHeight * 0.5), 720);
              let debugAiWidth, debugAiHeight;
              if (debugTargetWidth < windowPhysicalWidth || debugTargetHeight < windowPhysicalHeight) {
                debugAiWidth = debugTargetWidth;
                debugAiHeight = debugTargetHeight;
              } else {
                debugAiWidth = windowPhysicalWidth;
                debugAiHeight = windowPhysicalHeight;
              }
              const debugScaleX = windowLogicalWidth / debugAiWidth;
              const debugScaleY = windowLogicalHeight / debugAiHeight;
              
              const step1X = Math.round(x * debugScaleX);
              const step1Y = Math.round(y * debugScaleY);
              transformations.push(`window AI coords (${x}, ${y}) in ${debugAiWidth}x${debugAiHeight} image -> window logical (${step1X}, ${step1Y})`);
              transformations.push(`window scale factors: X=${debugScaleX.toFixed(3)}, Y=${debugScaleY.toFixed(3)}`);
              transformations.push(`final screen coords (${step1X + targetWindow.bounds.x}, ${step1Y + targetWindow.bounds.y})`);
            }
          } else {
            const step1X = Math.round(x * scaleX);
            const step1Y = Math.round(y * scaleY);
            transformations.push(`AI coords (${x}, ${y}) -> logical coords (${step1X}, ${step1Y})`);
            transformations.push(`scale factors: X=${scaleX.toFixed(3)}, Y=${scaleY.toFixed(3)}`);
          }
          
          return {
            content: [
              {
                type: "text",
                text: `Mouse moved to requested (${x}, ${y})${transformations.length > 0 ? ` -> ${transformations.join(' -> ')} -> final (${moveX}, ${moveY})` : ''}. Actual cursor position: (${actualCursorPos.x}, ${actualCursorPos.y}). Red circle shows actual cursor position for verification.`,
              },
              {
                type: "image",
                mimeType: "image/jpeg",
                data: annotatedImgBase64,
              },
            ],
            isError: false
          };
        }
      }
      
      return { success: true };
    } catch (error) {
      // Log any unexpected errors to the debug file for inspection
      const errorTimestamp = new Date().toISOString();
      const { debug = false } = params;
      debugLog(`--- MOUSE_MOVE CRITICAL ERROR ${errorTimestamp} ---\n`, debug);
      debugLog(`Error: ${error.message}\n`, debug);
      debugLog(`Stack: ${error.stack}\n`, debug);
      debugLog(`-------------------------------------\n`, debug);

      // Error captured silently to avoid interfering with MCP protocol
      return { success: false, error: error.message };
    }
  },

  mouse_click: async (params = {}) => {
    try {
      const { 
        button = 'left', 
        double = false, 
        windowId, 
        pressLength = 0,
        x,
        y,
        debug = false
      } = params;

      // Add a timestamped log to mark the beginning of the function call
      const timestamp = new Date().toISOString();
      debugLog(`\n--- MOUSE_CLICK START ${timestamp} ---\n`, debug);
      debugLog(`Params: ${JSON.stringify(params)}\n`, debug);

      // Validate pressLength
      if (pressLength < 0 || pressLength > 5000) {
        debugLog(`MOUSE_CLICK ERROR: Invalid pressLength\n`, debug);
        return { success: false, error: 'pressLength must be between 0 and 5000 milliseconds' };
      }

      // Always focus window first if windowId is provided
      if (windowId) {
        debugLog(`MOUSE_CLICK: Focusing window ${windowId}\n`, debug);
        const focusResult = await capabilityImplementations.focus_window({ windowId });
        if (!focusResult.success) {
          debugLog(`MOUSE_CLICK ERROR: Failed to focus window: ${focusResult.error}\n`, debug);
          return focusResult;
        }
        // Wait for window to focus
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // If coordinates are provided, move mouse
      if (x !== undefined && y !== undefined) {
        debugLog(`MOUSE_CLICK: Calling mouse_move with x=${x}, y=${y}\n`, debug);
        const moveResult = await capabilityImplementations.mouse_move({
          x,
          y,
          windowId,
          debug // Pass debug flag through
        });
        
        if (!moveResult.success) {
          debugLog(`MOUSE_CLICK ERROR: mouse_move failed: ${moveResult.error}\n`, debug);
          return moveResult;
        }
        
        // Small delay after move to ensure position is set
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      debugLog(`MOUSE_CLICK: Performing click action (button: ${button}, double: ${double}, pressLength: ${pressLength})\n`, debug);
      if (pressLength > 0) {
        // Hold mouse button for specified duration
        robot.mouseToggle('down', button);
        await new Promise(resolve => setTimeout(resolve, pressLength));
        robot.mouseToggle('up', button);
      } else {
        // Quick click (default behavior)
        if (double) {
          debugLog(`MOUSE_CLICK: Trying native robotjs double-click with robot.mouseClick('${button}', true)\n`, debug);
          // Try native robotjs double-click first
          robot.mouseClick(button, true);
          
          // If that doesn't work, fall back to two clicks
          // Uncomment these lines if native double-click doesn't work:
          // robot.mouseClick(button);
          // await new Promise(resolve => setTimeout(resolve, 200)); 
          // robot.mouseClick(button);
        } else {
          debugLog(`MOUSE_CLICK: Executing single-click with robot.mouseClick('${button}')\n`, debug);
          robot.mouseClick(button);
        }
      }

      debugLog(`--- MOUSE_CLICK END ---\n`, debug);
      return { success: true };
    } catch (error) {
      // Log any unexpected errors to the debug file for inspection
      const errorTimestamp = new Date().toISOString();
      const { debug = false } = params;
      debugLog(`--- MOUSE_CLICK CRITICAL ERROR ${errorTimestamp} ---\n`, debug);
      debugLog(`Error: ${error.message}\n`, debug);
      debugLog(`Stack: ${error.stack}\n`, debug);
      debugLog(`-------------------------------------\n`, debug);

      // Error captured silently to avoid interfering with MCP protocol
      return { success: false, error: error.message };
    }
  },

  keyboard_type: async (params) => {
    try {
      const { text, windowId } = params;

      // Focus window if windowId is provided
      if (windowId) {
        const focusResult = await capabilityImplementations.focus_window({ windowId });
        if (!focusResult.success) {
          return focusResult;
        }
        // Wait for window to focus
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      robot.typeString(text);
      return { success: true };
    } catch (error) {
      // Error captured silently to avoid interfering with MCP protocol
      return { success: false, error: error.message };
    }
  },

  keyboard_press: async (params) => {
    try {
      const { key, modifiers = [], windowId, pressLength = 0 } = params;

      // Validate pressLength
      if (pressLength < 0 || pressLength > 5000) {
        return { success: false, error: 'pressLength must be between 0 and 5000 milliseconds' };
      }

      // Focus window if windowId is provided
      if (windowId) {
        const focusResult = await capabilityImplementations.focus_window({ windowId });
        if (!focusResult.success) {
          return focusResult;
        }
        // Wait for window to focus
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      if (pressLength > 0) {
        // Hold key for specified duration
        if (modifiers.length === 0) {
          robot.keyToggle(key, 'down');
          await new Promise(resolve => setTimeout(resolve, pressLength));
          robot.keyToggle(key, 'up');
        } else {
          robot.keyToggle(key, 'down', modifiers);
          await new Promise(resolve => setTimeout(resolve, pressLength));
          robot.keyToggle(key, 'up');
        }
      } else {
        // Quick tap (default behavior)
        if (modifiers.length === 0) {
          robot.keyTap(key);
        } else {
          robot.keyToggle(key, 'down', modifiers);
          robot.keyToggle(key, 'up');
        }
      }

      return { success: true };
    } catch (error) {
      // Error captured silently to avoid interfering with MCP protocol
      return { success: false, error: error.message };
    }
  },

  get_screen_size: () => {
    try {
      const size = robot.getScreenSize();
      return { success: true, result: size };
    } catch (error) {
      // Error captured silently to avoid interfering with MCP protocol
      return { success: false, error: error.message };
    }
  },

  list_windows: async () => {
    try {
      const activeWin = require('active-win');
      const windows = await activeWin.getOpenWindows();
      
      if (!windows || !Array.isArray(windows)) {
        return { success: false, error: 'Failed to get window list - activeWin.getOpenWindows() returned null or invalid data' };
      }
      
      // Get primary screen dimensions for display detection
      const primaryScreen = robot.getScreenSize();
      
      return {
        success: true,
        result: windows.filter(window => window && window.id).map(window => {
          const bounds = window.bounds || { x: 0, y: 0, width: 0, height: 0 };
          
          // Determine if window is on primary display or secondary display
          const isOnPrimaryDisplay = bounds.x >= 0 && 
                                   bounds.y >= 0 && 
                                   bounds.x < primaryScreen.width && 
                                   bounds.y < primaryScreen.height;
          
          // Determine display location
          let displayLocation = 'primary';
          if (!isOnPrimaryDisplay) {
            if (bounds.x < 0) {
              displayLocation = 'secondary-left';
            } else if (bounds.x >= primaryScreen.width) {
              displayLocation = 'secondary-right';
            } else if (bounds.y < 0) {
              displayLocation = 'secondary-top';
            } else if (bounds.y >= primaryScreen.height) {
              displayLocation = 'secondary-bottom';
            } else {
              displayLocation = 'secondary-unknown';
            }
          }
          
          // Determine accessibility for mouse/keyboard actions
          // Note: Mouse movement works across all displays when using windowInsideCoordinates
          const isAccessibleForMouse = true; // Mouse works across displays with window-relative coordinates
          const isAccessibleForWindowActions = true; // focus_window and window_capture work across displays
          
          return {
            id: window.id,
            title: window.title || 'Untitled',
            owner: window.owner?.name || 'Unknown',
            bounds: bounds,
            processId: window.owner?.processId || 0,
            bundleId: window.owner?.bundleId || '',
            path: window.owner?.path || '',
            url: window.url || '',
            memoryUsage: window.memoryUsage || 0,
            displayLocation: displayLocation,
            isOnPrimaryDisplay: isOnPrimaryDisplay,
            accessibility: {
              mouseActions: isAccessibleForMouse,
              windowActions: isAccessibleForWindowActions,
              note: isOnPrimaryDisplay ? 
                'All coordinate systems available' : 
                'Use windowInsideCoordinates for reliable cross-display mouse control'
            }
          };
        })
      };
    } catch (error) {
      // Error captured silently to avoid interfering with MCP protocol
      return { success: false, error: error.message };
    }
  },

  move_window_to_primary_screen: async (params) => {
    try {
      const activeWin = require('active-win');
      const { windowId, preserveSize = true } = params;
      
      // Get all windows to find the target window
      const windows = await activeWin.getOpenWindows();
      
      if (!windows || !Array.isArray(windows)) {
        return { success: false, error: 'Failed to get window list - activeWin.getOpenWindows() returned null or invalid data' };
      }
      
      const targetWindow = windows.find(w => w && w.id === windowId);
      
      if (!targetWindow) {
        return { success: false, error: `Window not found with ID: ${windowId}` };
      }
      
      // Check if window is already on primary display
      const primaryScreen = robot.getScreenSize();
      const bounds = targetWindow.bounds;
      const isOnPrimaryDisplay = bounds.x >= 0 && 
                               bounds.y >= 0 && 
                               bounds.x < primaryScreen.width && 
                               bounds.y < primaryScreen.height;
      
      if (isOnPrimaryDisplay) {
        return { success: true, message: `Window ${windowId} is already on the primary screen` };
      }
      
      // Calculate new position on primary screen
      // Place window at center-left of primary screen if preserveSize is true
      let newX, newY, newWidth, newHeight;
      
      if (preserveSize) {
        // Keep original size, center on primary screen
        newX = Math.max(0, Math.min(50, primaryScreen.width - bounds.width));
        newY = Math.max(0, Math.min(50, primaryScreen.height - bounds.height));
        newWidth = Math.min(bounds.width, primaryScreen.width - newX);
        newHeight = Math.min(bounds.height, primaryScreen.height - newY);
      } else {
        // Resize to fit primary screen comfortably
        newX = 100;
        newY = 100;
        newWidth = Math.min(bounds.width, primaryScreen.width - 200);
        newHeight = Math.min(bounds.height, primaryScreen.height - 200);
      }
      
      // Use cross-platform window helper
      const moveResult = await windowHelpers.moveWindow(targetWindow, newX, newY, newWidth, newHeight);
      
      if (moveResult.success) {
        // Wait a moment for the window to move
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return { 
          success: true, 
          message: `Window ${windowId} moved to primary screen at position (${newX}, ${newY}) with size ${newWidth}x${newHeight}`,
          newBounds: { x: newX, y: newY, width: newWidth, height: newHeight }
        };
      } else {
        return moveResult;
      }
    } catch (error) {
      // Error captured silently to avoid interfering with MCP protocol
      return { success: false, error: error.message };
    }
  },

  focus_window: async (params) => {
    try {
      const activeWin = require('active-win');
      const { windowId } = params;
      
      // Get all windows to find the target window
      const windows = await activeWin.getOpenWindows();
      
      if (!windows || !Array.isArray(windows)) {
        return { success: false, error: 'Failed to get window list - activeWin.getOpenWindows() returned null or invalid data' };
      }
      
      const targetWindow = windows.find(w => w && w.id === windowId);
      
      if (!targetWindow) {
        return { success: false, error: `Window not found with ID: ${windowId}` };
      }
      
      // Use cross-platform window helper
      const focusResult = await windowHelpers.focusWindow(targetWindow);
      
      if (focusResult.success) {
        return { success: true, message: `Window ${windowId} focused successfully` };
      } else {
        return focusResult;
      }
    } catch (error) {
      // Error captured silently to avoid interfering with MCP protocol
      return { success: false, error: error.message };
    }
  },

  window_capture: async (params) => {
    try {
      const activeWin = require('active-win');
      const { windowId, windowTitle, debug = false } = params;
      
      let targetWindow;
      
      // Find the window by ID or title
      const windows = await activeWin.getOpenWindows();
      
      if (!windows || !Array.isArray(windows)) {
        return { success: false, error: 'Failed to get window list - activeWin.getOpenWindows() returned null or invalid data' };
      }
      
      if (windowId) {
        targetWindow = windows.find(w => w && w.id === windowId);
      } else if (windowTitle) {
        targetWindow = windows.find(w => w && w.title && w.title.toLowerCase().includes(windowTitle.toLowerCase()));
      } else {
        return { success: false, error: 'Either windowId or windowTitle must be provided' };
      }
      
      if (!targetWindow) {
        return { success: false, error: `Window not found${windowId ? ` with ID: ${windowId}` : windowTitle ? ` with title containing: "${windowTitle}"` : ''}` };
      }
      
      // Use cross-platform window helper to bring the window to front
      const focusResult = await windowHelpers.focusWindow(targetWindow);
      
      if (!focusResult.success) {
        return { success: false, error: `Failed to focus window: ${focusResult.error}` };
      }
      
      // Wait a moment for the window to come to focus
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Use the window bounds to capture just that window
      const bounds = targetWindow.bounds;
      
      // Validate bounds before proceeding
      if (!bounds || typeof bounds.x !== 'number' || typeof bounds.y !== 'number' || 
          typeof bounds.width !== 'number' || typeof bounds.height !== 'number') {
        return { success: false, error: `Invalid window bounds: ${JSON.stringify(bounds)}` };
      }
      
      if (bounds.width <= 0 || bounds.height <= 0) {
        return { success: false, error: `Invalid window dimensions: ${bounds.width}x${bounds.height}` };
      }
      
      
      // Check if window is on secondary display - not supported yet
      // We need to calculate isOnPrimaryDisplay like in list_windows since the raw window object doesn't have this
      const primaryScreen = robot.getScreenSize();
      const isOnPrimaryDisplay = bounds.x >= 0 && 
                               bounds.y >= 0 && 
                               bounds.x < primaryScreen.width && 
                               bounds.y < primaryScreen.height;
      
      if (!isOnPrimaryDisplay) {
        // Determine display location for error message
        let displayLocation = 'primary';
        if (bounds.x < 0) {
          displayLocation = 'secondary-left';
        } else if (bounds.x >= primaryScreen.width) {
          displayLocation = 'secondary-right';
        } else if (bounds.y < 0) {
          displayLocation = 'secondary-top';
        } else if (bounds.y >= primaryScreen.height) {
          displayLocation = 'secondary-bottom';
        } else {
          displayLocation = 'secondary-unknown';
        }
        
        return { 
          success: false, 
          error: `Window capture on secondary displays is not yet implemented. Window "${targetWindow.title}" is on ${displayLocation} display. Only primary display windows can be captured.` 
        };
      }
      
      // Capture primary display only
      let img;
      try {
        img = await screenshot({ format: 'jpg' });
      } catch (screenshotError) {
        return { success: false, error: `Screenshot failed: ${screenshotError.message}` };
      }
      
      const sharp = require('sharp');
      let metadata;
      try {
        metadata = await sharp(img).metadata();
      } catch (sharpError) {
        return { success: false, error: `Image processing failed: ${sharpError.message}` };
      }
      
      const screenSize = robot.getScreenSize();
      
      // Calculate scaling factor for Retina detection
      const scaleX = metadata.width / screenSize.width;
      const scaleY = metadata.height / screenSize.height;
      const isHighDPI = scaleX > 1.5 || scaleY > 1.5;
      
      let sharpInstance = sharp(img);
      
      // Extract window area from the screenshot
      let scaledX1, scaledY1, scaledX2, scaledY2;
      
      if (isHighDPI) {
        // Apply scaling for high-DPI displays (Retina)
        scaledX1 = Math.round(bounds.x * scaleX);
        scaledY1 = Math.round(bounds.y * scaleY);
        scaledX2 = Math.round((bounds.x + bounds.width) * scaleX);
        scaledY2 = Math.round((bounds.y + bounds.height) * scaleY);
      } else {
        // Use coordinates as-is for standard displays
        scaledX1 = bounds.x;
        scaledY1 = bounds.y;
        scaledX2 = bounds.x + bounds.width;
        scaledY2 = bounds.y + bounds.height;
      }
      
      // Note: Secondary display support removed - coordinates are for primary display only
      
      const width = scaledX2 - scaledX1;
      const height = scaledY2 - scaledY1;
      
      // Log extraction details for debugging
      debugLog(`WINDOW_CAPTURE DEBUG: Window bounds: x=${bounds.x}, y=${bounds.y}, width=${bounds.width}, height=${bounds.height}\n`, debug);
      debugLog(`WINDOW_CAPTURE DEBUG: Scaled extraction: x1=${scaledX1}, y1=${scaledY1}, x2=${scaledX2}, y2=${scaledY2}\n`, debug);
      debugLog(`WINDOW_CAPTURE DEBUG: Extraction dimensions: width=${width}, height=${height}\n`, debug);
      
      if (width <= 0 || height <= 0) {
        return { success: false, error: 'Invalid window bounds: width and height must be positive' };
      }
      
      
      // Validate extraction bounds against image dimensions
      if (scaledX1 < 0 || scaledY1 < 0 || scaledX2 > metadata.width || scaledY2 > metadata.height) {
        return { success: false, error: `Window bounds (${scaledX1},${scaledY1},${scaledX2},${scaledY2}) exceed screenshot dimensions (${metadata.width}x${metadata.height})` };
      }
      
      try {
        sharpInstance = sharpInstance.extract({
          left: scaledX1,
          top: scaledY1,
          width: width,
          height: height
        });
      } catch (extractError) {
        return { success: false, error: `Window extraction failed: ${extractError.message}. Bounds: (${scaledX1},${scaledY1}) ${width}x${height}` };
      }
      
      // Apply AI optimization
      // Use the extraction dimensions, not metadata (which shows original image size)
      const currentWidth = width;
      const currentHeight = height;
      
      // Scale to 50% of original size, but cap at 1280x720 for much smaller responses
      const targetWidth = Math.min(Math.round(currentWidth * 0.5), 1280);
      const targetHeight = Math.min(Math.round(currentHeight * 0.5), 720);
      
      const timestamp = new Date().toISOString();
      debugLog(`\n=== WINDOW_CAPTURE DEBUG ${timestamp} ===\n`, debug);
      const logMsg = `WINDOW_CAPTURE DEBUG: extracted window ${currentWidth}x${currentHeight}, target ${targetWidth}x${targetHeight}, will resize: ${targetWidth < currentWidth || targetHeight < currentHeight}\n`;
      debugLog(logMsg, debug);
      
      // Track actual dimensions that AI will see
      let aiImageWidth = currentWidth;
      let aiImageHeight = currentHeight;
      
      // Only resize if the target is smaller than current
      if (targetWidth < currentWidth || targetHeight < currentHeight) {
        try {
          sharpInstance = sharpInstance.resize(targetWidth, targetHeight, {
            fit: 'inside',
            withoutEnlargement: true
          });
          
          // With 'inside' fit, dimensions might be different from target
          // We'll get the actual dimensions after processing
          
          const logMsg2 = `WINDOW_CAPTURE DEBUG: after resize, AI will see: ${aiImageWidth}x${aiImageHeight}\n`;
          debugLog(logMsg2, debug);
        } catch (resizeError) {
          return { success: false, error: `Resize failed: ${resizeError.message}` };
        }
      } else {
        const logMsg3 = `WINDOW_CAPTURE DEBUG: no resize needed, AI will see: ${aiImageWidth}x${aiImageHeight}\n`;
        debugLog(logMsg3, debug);
      }
      
      // Store the AI image dimensions in debug log for mouse_move to use
      debugLog(`WINDOW_CAPTURE DEBUG: windowId=${targetWindow.id}, aiDimensions=${aiImageWidth}x${aiImageHeight}\n`, debug);
      
      // Convert to WebP with very aggressive compression for AI analysis
      try {
        img = await sharpInstance
          .webp({ quality: 15, effort: 0 })
          .toBuffer();
          
        // Get the actual dimensions after resize
        const finalMeta = await sharp(img).metadata();
        aiImageWidth = finalMeta.width;
        aiImageHeight = finalMeta.height;
        
        debugLog(`WINDOW_CAPTURE DEBUG: actual AI dimensions after resize: ${aiImageWidth}x${aiImageHeight}\n`, debug);
      } catch (webpError) {
        return { success: false, error: `WebP conversion failed: ${webpError.message}` };
      }
      
      // Check final size and abort if too large (stay well under 1MB limit)
      const sizeKB = img.length / 1024;
      if (sizeKB > 300) {
        return { success: false, error: `Window capture too large: ${sizeKB.toFixed(1)}KB (max 300KB). Try a smaller window.` };
      }
      
      const base64 = img.toString('base64');
      
      // Return window capture with dimension metadata
      const result = {
        content: [
          {
            type: "text",
            text: `Window "${targetWindow.title}" captured successfully. Original size: ${bounds.width}x${bounds.height}, AI sees: ${aiImageWidth}x${aiImageHeight}`,
          },
          {
            type: "image",
            mimeType: "image/webp",
            data: base64,
          }
        ],
        isError: false
      };
      
      // Store window capture metadata for coordinate transformations
      // We assume the AI pipeline will not perform additional resizing.
      const aiActualWidth = aiImageWidth;
      const aiActualHeight = aiImageHeight;
      
      const windowCaptureMetadata = {
        windowId: targetWindow.id,
        originalLogicalSize: { width: bounds.width, height: bounds.height },
        originalPhysicalSize: { width: currentWidth, height: currentHeight },
        reportedAiSize: { width: aiImageWidth, height: aiImageHeight },
        aiImageSize: { width: aiActualWidth, height: aiActualHeight }, // What AI actually sees
        timestamp: Date.now()
      };
      
      // Store in global map for mouse_move to access
      if (!global.windowCaptureMetadata) {
        global.windowCaptureMetadata = {};
      }
      global.windowCaptureMetadata[targetWindow.id] = windowCaptureMetadata;
      
      // Add metadata to debug log
      debugLog(`WINDOW_CAPTURE METADATA: ${JSON.stringify(windowCaptureMetadata)}\n`, debug);
      
      return result;
      
    } catch (error) {
      // Error captured silently to avoid interfering with MCP protocol
      return { success: false, error: error.message };
    }
  },

  multiple_desktop_actions: async (params) => {
    try {
      const { actions = [], continueOnError = false } = params;
      const results = [];
      let hasErrors = false;
      const errors = [];

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const { type, params: actionParams = {}, delay = 0 } = action;

        if (!type) {
          const error = `Action ${i}: type is required`;
          if (continueOnError) {
            hasErrors = true;
            errors.push(error);
            results.push({
              action: i,
              type: 'unknown',
              result: { success: false, error: error }
            });
            continue;
          } else {
            return { success: false, error: error };
          }
        }

        let result;
        
        // Execute the action based on type
        switch (type) {
          case 'mouse_move':
            result = await capabilityImplementations.mouse_move(actionParams);
            break;
          case 'mouse_click':
            result = await capabilityImplementations.mouse_click(actionParams);
            break;
          case 'keyboard_press':
            result = await capabilityImplementations.keyboard_press(actionParams);
            break;
          case 'keyboard_type':
            result = await capabilityImplementations.keyboard_type(actionParams);
            break;
          case 'screen_capture':
            result = await capabilityImplementations.screen_capture(actionParams);
            break;
          case 'window_capture':
            result = await capabilityImplementations.window_capture(actionParams);
            break;
          case 'focus_window':
            result = await capabilityImplementations.focus_window(actionParams);
            break;
          case 'move_window_to_primary_screen':
            result = await capabilityImplementations.move_window_to_primary_screen(actionParams);
            break;
          default:
            const error = `Action ${i}: Unknown action type '${type}'`;
            if (continueOnError) {
              hasErrors = true;
              errors.push(error);
              results.push({
                action: i,
                type: type,
                result: { success: false, error: error }
              });
              continue;
            } else {
              return { success: false, error: error };
            }
        }

        // Check if action failed
        if (result && result.success === false) {
          const error = `Action ${i} (${type}): ${result.error}`;
          hasErrors = true;
          errors.push(error);
          
          if (!continueOnError) {
            return { success: false, error: error };
          }
        }

        results.push({
          action: i,
          type: type,
          result: result
        });

        // Apply delay after action
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (hasErrors && !continueOnError) {
        return { 
          success: false, 
          error: `Multiple errors occurred: ${errors.join('; ')}`,
          results: results
        };
      }

      return { 
        success: !hasErrors, 
        message: hasErrors ? 
          `Executed ${actions.length} actions with ${errors.length} errors` : 
          `Executed ${actions.length} actions successfully`,
        results: results,
        ...(hasErrors && { errors: errors })
      };
    } catch (error) {
      // Error captured silently to avoid interfering with MCP protocol
      return { success: false, error: error.message };
    }
  }
};

function toMcpResponse(obj) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(obj),
      },
    ],
  };
}

server.tool("get_screen_size", "Gets the screen dimensions", {},
  async () => toMcpResponse(capabilityImplementations.get_screen_size()));

server.tool("screen_capture", "Captures the current screen content (PRIMARY DISPLAY ONLY - cannot capture secondary/external displays. Use window_capture for windows on secondary displays. Automatically optimized for AI analysis)", {
  x1: z.number().optional().describe("Left X coordinate for partial capture"),
  y1: z.number().optional().describe("Top Y coordinate for partial capture"),
  x2: z.number().optional().describe("Right X coordinate for partial capture"),
  y2: z.number().optional().describe("Bottom Y coordinate for partial capture")
}, async (params) => capabilityImplementations.screen_capture(params));

server.tool("keyboard_press", "Presses a keyboard key or key combination. IMPORTANT: windowId should be provided if known (after window_capture, list_windows, or when user specified a window).", {
  key: z.string().describe("Key to press (e.g., 'enter', 'a', 'control')"),
  modifiers: z.array(z.enum(["control", "shift", "alt", "command"])).default([]).describe("Modifier keys to hold while pressing the key"),
  windowId: z.number().optional().describe("Window ID to focus before pressing key. SHOULD be provided if known from previous operations (after window_capture, list_windows, or when user specified a window)."),
  pressLength: z.number().min(0).max(5000).default(0).describe("Optional duration to hold the key in milliseconds (0-5000ms, 0 = quick tap)")
}, async (params) => toMcpResponse(await capabilityImplementations.keyboard_press(params)));

server.tool("keyboard_type", "Types text at the current cursor position. IMPORTANT: windowId should be provided if known (after window_capture, list_windows, or when user specified a window).", {
  text: z.string().describe("Text to type"),
  windowId: z.number().optional().describe("Window ID to focus before typing. SHOULD be provided if known from previous operations (after window_capture, list_windows, or when user specified a window).")
}, async (params) => toMcpResponse(await capabilityImplementations.keyboard_type(params)));

server.tool("mouse_click", "Performs a mouse click, optionally moving to coordinates first. IMPORTANT: a windowId MUST be provided. Automatically creates coordinate metadata if not available from window_capture. For precise coordinate scaling, run window_capture first. COORDINATE SYSTEM: x,y coordinates must be relative to the TOP-LEFT corner (0,0) of the window screenshot/image, NOT relative to any internal UI elements. When clicking buttons (especially in grids like calculators), aim for the center of the button rather than edges to ensure reliable clicks.", {
  button: z.enum(["left", "right", "middle"]).default("left").describe("Mouse button to click"),
  double: z.boolean().default(false).describe("Whether to perform a double click"),
  windowId: z.number().describe("Window ID to focus before clicking. This is a required parameter. Coordinate metadata will be created automatically if not available from window_capture."),
  pressLength: z.number().min(0).max(5000).default(0).describe("Optional duration to hold the mouse button in milliseconds (0-5000ms, 0 = quick click)"),
  x: z.number().optional().describe("X coordinate relative to the TOP-LEFT corner (0,0) of the window screenshot/image to move to before clicking. NOT relative to any internal UI elements. Use coordinates as they appear in the captured window image. Aim for button centers, not edges."),
  y: z.number().optional().describe("Y coordinate relative to the TOP-LEFT corner (0,0) of the window screenshot/image to move to before clicking. NOT relative to any internal UI elements. Use coordinates as they appear in the captured window image. Aim for button centers, not edges."),
  debug: z.boolean().default(false).describe("If true, enables debug logging for troubleshooting")
}, async (params) => toMcpResponse(await capabilityImplementations.mouse_click(params)));

server.tool("mouse_move", "Moves the mouse to specified coordinates within a given window. A windowId is required. Automatically creates coordinate metadata if not available from window_capture. For precise coordinate scaling, run window_capture first. COORDINATE SYSTEM: x,y coordinates must be relative to the TOP-LEFT corner (0,0) of the window screenshot/image, NOT relative to any internal UI elements. IMPORTANT: When clicking buttons (especially in grids like calculators), aim for the center of the button rather than edges to ensure reliable clicks.", {
  x: z.number().describe("X coordinate relative to the TOP-LEFT corner (0,0) of the window screenshot/image. NOT relative to any internal UI elements or content areas. Use coordinates as they appear in the captured window image."),
  y: z.number().describe("Y coordinate relative to the TOP-LEFT corner (0,0) of the window screenshot/image. NOT relative to any internal UI elements or content areas. Use coordinates as they appear in the captured window image."),
  debug: z.boolean().default(false).describe("If true, takes a screenshot with a red circle showing where the cursor moved for verification"),
  windowId: z.number().describe("Window ID is required for all mouse movements. Coordinate metadata will be created automatically if not available from window_capture.")
}, async (params) => {
  const result = await capabilityImplementations.mouse_move(params);
  if (result.content) {
    return result; // Already in correct format for debug mode
  } else {
    return toMcpResponse(result); // Convert to MCP format for normal mode
  }
});

server.tool("list_windows", "Lists all open windows with their properties. IMPORTANT: This is the preferred first tool to use and is obligatory when user asks about any window operations.", {},
  async () => toMcpResponse(await capabilityImplementations.list_windows()));

server.tool("focus_window", "Focuses on a specific window to bring it to the front", {
  windowId: z.number().describe("The ID of the window to focus (from list_windows)")
}, async (params) => toMcpResponse(await capabilityImplementations.focus_window(params)));

server.tool("move_window_to_primary_screen", "Moves a window from secondary display to the primary screen, enabling screenshot capture. Automatically positions and optionally resizes the window to fit on the primary display.", {
  windowId: z.number().describe("The ID of the window to move (from list_windows)"),
  preserveSize: z.boolean().default(true).describe("If true, keeps original window size (default). If false, resizes window to fit primary screen comfortably.")
}, async (params) => toMcpResponse(await capabilityImplementations.move_window_to_primary_screen(params)));

server.tool("window_capture", "Focuses on a window and captures a screenshot of just that window (LIMITATION: coordinate handling for secondary displays not fully implemented - may not work reliably on non-primary displays. Automatically optimized for AI analysis)", {
  windowId: z.number().optional().describe("The ID of the window to capture (from list_windows)"),
  windowTitle: z.string().optional().describe("The title of the window to capture (alternative to windowId)"),
  debug: z.boolean().default(false).describe("If true, enables debug logging for troubleshooting")
}, async (params) => {
  const result = await capabilityImplementations.window_capture(params);
  if (result.content) {
    return result; // Already in correct format
  } else {
    return toMcpResponse(result); // Convert to MCP format
  }
});

server.tool("multiple_desktop_actions", "Executes a sequence of desktop actions with optional delays and error handling", {
  actions: z.array(z.object({
    type: z.enum([
      "mouse_move", "mouse_click", "keyboard_press", "keyboard_type", 
      "screen_capture", "window_capture", "focus_window", "move_window_to_primary_screen"
    ]).describe("Type of action to execute"),
    params: z.record(z.any()).optional().describe("Parameters for the action (same as individual method parameters)"),
    delay: z.number().min(0).max(60000).default(0).describe("Delay in milliseconds after this action (0-60000ms, up to 60 seconds)")
  })).describe("Array of actions to execute in sequence"),
  continueOnError: z.boolean().default(false).describe("If true, continue executing remaining actions even if one fails (default: false)")
}, async (params) => toMcpResponse(await capabilityImplementations.multiple_desktop_actions(params)));

server.resource(
  "screenshot-list",
  "screenshot://list",
  async () => {
    const result = {
      contents: [
        ...Object.keys(screenshots).map(name => ({
          uri: `screenshot://${name}`,
          mimeType: "image/webp",
          blob: screenshots[name],
        })),
      ]
    };

    return result;
  }
);

server.resource(
  "screenshot-content",
  new ResourceTemplate("screenshot://{id}", { list: undefined }),
  async (uri, { id }) => ({
    contents: [{
      uri: uri.href,
      mimeType: "image/webp",
      blob: screenshots[id],
    }]
  })
);

async function main() {
  const transport = new StdioServerTransport();
  
  // Log debug mode status to debug.log if enabled
  if (isGlobalDebugEnabled) {
    debugLog(`\n=== MCP DESKTOP PRO SERVER STARTING ===\n`);
    debugLog(`Debug mode: ENABLED (--debug flag detected)\n`);
    debugLog(`Server started at: ${new Date().toISOString()}\n`);
    debugLog(`Debug log path: ${path.join(__dirname, 'debug.log')}\n`);
    debugLog(`==========================================\n\n`);
  }
  
  await server.connect(transport);
  // MCP Server running on stdio - logging removed to avoid protocol interference
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
