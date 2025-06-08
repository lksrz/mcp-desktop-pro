#!/usr/bin/env node

// Import required packages
const screenshot = require('screenshot-desktop');
const robot = require('robotjs');
const { McpServer, ResourceTemplate } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

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

      return {
        content: [
          {
            type: "text",
            text: `Screenshot ${screenshotKey} taken (optimized for AI analysis).`,
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
      const { x, y, debug = false, windowInsideCoordinates = false, windowId } = params;
      
      let moveX = x;
      let moveY = y;
      
      // Calculate the actual screenshot scaling ratio by simulating screen_capture logic
      const screenSize = robot.getScreenSize();
      const tempScreenshot = await screenshot({ format: 'jpg' });
      const sharp = require('sharp');
      const metadata = await sharp(tempScreenshot).metadata();
      
      // Calculate what the AI screenshot size would be using screen_capture logic
      const currentWidth = metadata.width;
      const currentHeight = metadata.height;
      
      // This matches the screen_capture scaling logic: 50% but capped at 1280x720
      const targetWidth = Math.min(Math.round(currentWidth * 0.5), 1280);
      const targetHeight = Math.min(Math.round(currentHeight * 0.5), 720);
      
      // Calculate the actual scaling factor from logical screen size to AI screenshot size
      const screenToScreenshotScaleX = targetWidth / screenSize.width;
      const screenToScreenshotScaleY = targetHeight / screenSize.height;
      
      // The factor to convert from AI coordinates back to logical screen coordinates
      const aiToLogicalScaleX = screenSize.width / targetWidth;
      const aiToLogicalScaleY = screenSize.height / targetHeight;
      
      // If coordinates are relative to a window (windowInsideCoordinates=true),
      // first scale the relative coordinates, then add window position
      if (windowInsideCoordinates) {
        // Test logging at the very start of mouse_move
        const fs = require('fs');
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', 'MOUSE_MOVE: windowInsideCoordinates branch started\n');
        
        if (!windowId) {
          return { success: false, error: 'windowId is required when using windowInsideCoordinates' };
        }
        
        const activeWin = require('active-win');
        const windows = await activeWin.getOpenWindows();
        
        if (!windows || !Array.isArray(windows)) {
          return { success: false, error: 'Failed to get window list for coordinate conversion' };
        }
        
        const targetWindow = windows.find(w => w && w.id === windowId);
        
        if (!targetWindow) {
          return { success: false, error: `Window not found for coordinate conversion with ID: ${windowId}` };
        }
        
        // COMPLETE COORDINATE DEBUG - Let's trace every step
        const windowLogicalWidth = targetWindow.bounds.width;
        const windowLogicalHeight = targetWindow.bounds.height;
        
        const fs = require('fs');
        const timestamp = new Date().toISOString();
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `\n=== MOUSE_MOVE DEBUG ${timestamp} ===\n`);
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `MOUSE_MOVE DEBUG: Window logical size: ${windowLogicalWidth}x${windowLogicalHeight}\n`);
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `MOUSE_MOVE DEBUG: Window position: (${targetWindow.bounds.x}, ${targetWindow.bounds.y})\n`);
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `MOUSE_MOVE DEBUG: Screen size: ${screenSize.width}x${screenSize.height}\n`);
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `MOUSE_MOVE DEBUG: Screenshot metadata: ${metadata.width}x${metadata.height}\n`);
        
        // Calculate retina scaling
        const isHighDPI = (metadata.width / screenSize.width) > 1.5 || (metadata.height / screenSize.height) > 1.5;
        const scaleX = metadata.width / screenSize.width;
        const scaleY = metadata.height / screenSize.height;
        
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `MOUSE_MOVE DEBUG: Retina detection: isHighDPI=${isHighDPI}, scaleX=${scaleX.toFixed(3)}, scaleY=${scaleY.toFixed(3)}\n`);
        
        let windowPhysicalWidth, windowPhysicalHeight;
        if (isHighDPI) {
          windowPhysicalWidth = windowLogicalWidth * scaleX;
          windowPhysicalHeight = windowLogicalHeight * scaleY;
        } else {
          windowPhysicalWidth = windowLogicalWidth;
          windowPhysicalHeight = windowLogicalHeight;
        }
        
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `MOUSE_MOVE DEBUG: Window physical size: ${windowPhysicalWidth}x${windowPhysicalHeight}\n`);
        
        // What window_capture should produce
        const targetWindowWidth = Math.min(Math.round(windowPhysicalWidth * 0.5), 1280);
        const targetWindowHeight = Math.min(Math.round(windowPhysicalHeight * 0.5), 720);
        
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `MOUSE_MOVE DEBUG: Expected AI window size: ${targetWindowWidth}x${targetWindowHeight}\n`);
        
        // But based on previous debug output, AI sees something different
        // Let's try different assumptions and see which matches the 2.0 scale factor
        const assumption1_Width = windowLogicalWidth; // AI sees logical size
        const assumption2_Width = windowPhysicalWidth; // AI sees physical size  
        const assumption3_Width = targetWindowWidth; // AI sees expected scaled size
        const assumption4_Width = windowLogicalWidth / 2; // AI sees half logical
        
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `MOUSE_MOVE DEBUG: Testing scale factor assumptions:\n`);
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `  - If AI sees logical (${assumption1_Width}): scale = ${(windowLogicalWidth / assumption1_Width).toFixed(3)}\n`);
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `  - If AI sees physical (${assumption2_Width}): scale = ${(windowLogicalWidth / assumption2_Width).toFixed(3)}\n`);
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `  - If AI sees expected (${assumption3_Width}): scale = ${(windowLogicalWidth / assumption3_Width).toFixed(3)}\n`);
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `  - If AI sees half logical (${assumption4_Width}): scale = ${(windowLogicalWidth / assumption4_Width).toFixed(3)}\n`);
        
        // Use the assumption that gives us the 2.0 scale factor we observed
        const actualAiWindowWidth = windowLogicalWidth / 2;
        const actualAiWindowHeight = windowLogicalHeight / 2;
        
        const windowAiToLogicalScaleX = windowLogicalWidth / actualAiWindowWidth;
        const windowAiToLogicalScaleY = windowLogicalHeight / actualAiWindowHeight;
        
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `MOUSE_MOVE DEBUG: Using AI window size: ${actualAiWindowWidth}x${actualAiWindowHeight}\n`);
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `MOUSE_MOVE DEBUG: Scale factors: X=${windowAiToLogicalScaleX.toFixed(3)}, Y=${windowAiToLogicalScaleY.toFixed(3)}\n`);
        
        // Scale coordinates from AI window coordinates to logical window coordinates
        let scaledX = Math.round(x * windowAiToLogicalScaleX);
        let scaledY = Math.round(y * windowAiToLogicalScaleY);
        
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `MOUSE_MOVE DEBUG: Input AI coords: (${x}, ${y})\n`);
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `MOUSE_MOVE DEBUG: Scaled to logical: (${scaledX}, ${scaledY})\n`);
        
        // Then add window position to scaled coordinates
        moveX = scaledX + targetWindow.bounds.x;
        moveY = scaledY + targetWindow.bounds.y;
        
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `MOUSE_MOVE DEBUG: Final screen coords: (${moveX}, ${moveY})\n`);
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `MOUSE_MOVE DEBUG: Window bounds check: X in [${targetWindow.bounds.x}, ${targetWindow.bounds.x + targetWindow.bounds.width}], Y in [${targetWindow.bounds.y}, ${targetWindow.bounds.y + targetWindow.bounds.height}]\n`);
      } else {
        // For regular screen coordinates, convert from AI screenshot coordinates to logical coordinates
        // using the calculated scaling factors
        moveX = Math.round(moveX * aiToLogicalScaleX);
        moveY = Math.round(moveY * aiToLogicalScaleY);
      }
      
      robot.moveMouse(moveX, moveY);
      
      if (debug) {
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
          
          const transformations = [];
          if (windowInsideCoordinates && windowId) {
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
              
              const targetWindowWidth = Math.min(Math.round(windowPhysicalWidth * 0.5), 1280);
              const targetWindowHeight = Math.min(Math.round(windowPhysicalHeight * 0.5), 720);
              
              const actualAiWindowWidth = windowLogicalWidth / 2;
              const actualAiWindowHeight = windowLogicalHeight / 2;
              const windowAiToLogicalScaleX = windowLogicalWidth / actualAiWindowWidth;
              const windowAiToLogicalScaleY = windowLogicalHeight / actualAiWindowHeight;
              
              const step1X = Math.round(x * windowAiToLogicalScaleX);
              const step1Y = Math.round(y * windowAiToLogicalScaleY);
              transformations.push(`window AI coords (${x}, ${y}) -> window logical (${step1X}, ${step1Y})`);
              transformations.push(`window scale factors: X=${windowAiToLogicalScaleX.toFixed(3)}, Y=${windowAiToLogicalScaleY.toFixed(3)}`);
              transformations.push(`final screen coords (${step1X + targetWindow.bounds.x}, ${step1Y + targetWindow.bounds.y})`);
            }
          } else {
            const step1X = Math.round(x * aiToLogicalScaleX);
            const step1Y = Math.round(y * aiToLogicalScaleY);
            transformations.push(`AI coords (${x}, ${y}) -> logical coords (${step1X}, ${step1Y})`);
            transformations.push(`scale factors: X=${aiToLogicalScaleX.toFixed(3)}, Y=${aiToLogicalScaleY.toFixed(3)}`);
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
        windowInsideCoordinates = false
      } = params;

      // Validate pressLength
      if (pressLength < 0 || pressLength > 5000) {
        return { success: false, error: 'pressLength must be between 0 and 5000 milliseconds' };
      }

      // If coordinates are provided, move mouse first
      if (x !== undefined && y !== undefined) {
        const moveResult = await capabilityImplementations.mouse_move({
          x,
          y,
          windowInsideCoordinates,
          windowId
        });
        
        if (!moveResult.success) {
          return moveResult;
        }
        
        // Small delay after move to ensure position is set
        await new Promise(resolve => setTimeout(resolve, 50));
      } else {
        // Focus window if windowId is provided and no coordinates (legacy behavior)
        if (windowId) {
          const focusResult = await capabilityImplementations.focus_window({ windowId });
          if (!focusResult.success) {
            return focusResult;
          }
          // Wait for window to focus
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      if (pressLength > 0) {
        // Hold mouse button for specified duration
        robot.mouseToggle('down', button);
        await new Promise(resolve => setTimeout(resolve, pressLength));
        robot.mouseToggle('up', button);
      } else {
        // Quick click (default behavior)
        if (double) {
          robot.mouseClick(button, double);
        } else {
          robot.mouseClick(button);
        }
      }

      return { success: true };
    } catch (error) {
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

  focus_window: async (params) => {
    try {
      const activeWin = require('active-win');
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
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
      
      // Use AppleScript to bring the window to front by process name
      const appName = targetWindow.owner.name;
      const appleScript = `tell application "${appName}" to activate`;
      
      try {
        await execAsync(`osascript -e '${appleScript}'`);
        return { success: true, message: `Window ${windowId} focused successfully` };
      } catch (scriptError) {
        // Fallback: try with bundle ID if app name fails
        try {
          const bundleScript = `tell application id "${targetWindow.owner.bundleId}" to activate`;
          await execAsync(`osascript -e '${bundleScript}'`);
          return { success: true, message: `Window ${windowId} focused successfully` };
        } catch (bundleError) {
          return { success: false, error: `Failed to focus window: ${scriptError.message}` };
        }
      }
    } catch (error) {
      // Error captured silently to avoid interfering with MCP protocol
      return { success: false, error: error.message };
    }
  },

  window_capture: async (params) => {
    try {
      // Test logging at the very start
      const fs = require('fs');
      fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', 'WINDOW_CAPTURE: Function started\n');
      
      const activeWin = require('active-win');
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const { windowId, windowTitle } = params;
      
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
      
      // Use AppleScript to bring the window to front
      const appName = targetWindow.owner.name;
      const appleScript = `tell application "${appName}" to activate`;
      
      try {
        await execAsync(`osascript -e '${appleScript}'`);
      } catch (scriptError) {
        // Fallback: try with bundle ID if app name fails
        try {
          const bundleScript = `tell application id "${targetWindow.owner.bundleId}" to activate`;
          await execAsync(`osascript -e '${bundleScript}'`);
        } catch (bundleError) {
          return { success: false, error: `Failed to focus window: ${scriptError.message}` };
        }
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
      let currentMeta;
      try {
        currentMeta = await sharpInstance.metadata();
      } catch (metaError) {
        return { success: false, error: `Metadata extraction failed: ${metaError.message}` };
      }
      
      const currentWidth = currentMeta.width;
      const currentHeight = currentMeta.height;
      
      // Scale to 50% of original size, but cap at 1280x720 for much smaller responses
      const targetWidth = Math.min(Math.round(currentWidth * 0.5), 1280);
      const targetHeight = Math.min(Math.round(currentHeight * 0.5), 720);
      
      const fs = require('fs');
      const timestamp = new Date().toISOString();
      fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', `\n=== WINDOW_CAPTURE DEBUG ${timestamp} ===\n`);
      const logMsg = `WINDOW_CAPTURE DEBUG: extracted window ${currentWidth}x${currentHeight}, target ${targetWidth}x${targetHeight}, will resize: ${targetWidth < currentWidth || targetHeight < currentHeight}\n`;
      fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', logMsg);
      
      // Only resize if the target is smaller than current
      if (targetWidth < currentWidth || targetHeight < currentHeight) {
        try {
          sharpInstance = sharpInstance.resize(targetWidth, targetHeight, {
            fit: 'fill',
            kernel: sharp.kernel.lanczos3
          });
          
          const finalMeta = await sharpInstance.metadata();
          const logMsg2 = `WINDOW_CAPTURE DEBUG: after resize ${finalMeta.width}x${finalMeta.height}\n`;
          fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', logMsg2);
        } catch (resizeError) {
          return { success: false, error: `Resize failed: ${resizeError.message}` };
        }
      } else {
        const logMsg3 = `WINDOW_CAPTURE DEBUG: no resize needed\n`;
        fs.appendFileSync('/Users/lukasz/GitHub/mcp-desktop-pro/debug.log', logMsg3);
      }
      
      // Convert to WebP with very aggressive compression for AI analysis
      try {
        img = await sharpInstance
          .webp({ quality: 15, effort: 0 })
          .toBuffer();
      } catch (webpError) {
        return { success: false, error: `WebP conversion failed: ${webpError.message}` };
      }
      
      // Check final size and abort if too large (stay well under 1MB limit)
      const sizeKB = img.length / 1024;
      if (sizeKB > 300) {
        return { success: false, error: `Window capture too large: ${sizeKB.toFixed(1)}KB (max 300KB). Try a smaller window.` };
      }
      
      const base64 = img.toString('base64');
      return {
        content: [
          {
            type: "text",
            text: `Window "${targetWindow.title}" captured successfully.`,
          },
          {
            type: "image",
            mimeType: "image/webp",
            data: base64,
          }
        ],
        isError: false
      };
      
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

server.tool("mouse_click", "Performs a mouse click, optionally moving to coordinates first. IMPORTANT: windowId should be provided if known (after window_capture, list_windows, or in continuation).", {
  button: z.enum(["left", "right", "middle"]).default("left").describe("Mouse button to click"),
  double: z.boolean().default(false).describe("Whether to perform a double click"),
  windowId: z.number().optional().describe("Window ID to focus before clicking. SHOULD be provided if known from previous operations (after window_capture, list_windows, or when user specified a window)."),
  pressLength: z.number().min(0).max(5000).default(0).describe("Optional duration to hold the mouse button in milliseconds (0-5000ms, 0 = quick click)"),
  x: z.number().optional().describe("X coordinate to move to before clicking"),
  y: z.number().optional().describe("Y coordinate to move to before clicking"),
  windowInsideCoordinates: z.boolean().default(false).describe("If true, x/y coordinates are relative to window (requires windowId). REQUIRED when coordinates come from window_capture.")
}, async (params) => toMcpResponse(await capabilityImplementations.mouse_click(params)));

server.tool("mouse_move", "Moves the mouse to specified coordinates. Automatically handles Retina scaling. IMPORTANT: windowInsideCoordinates is OBLIGATORY when coordinates come from window_capture analysis (not for screen_capture).", {
  x: z.number().describe("X coordinate"),
  y: z.number().describe("Y coordinate"),
  debug: z.boolean().default(false).describe("If true, takes a screenshot with a red circle showing where the cursor moved for verification"),
  windowInsideCoordinates: z.boolean().default(false).describe("If true, coordinates are relative to a window and will be converted to absolute screen coordinates (requires windowId). REQUIRED when using coordinates from window_capture."),
  windowId: z.number().optional().describe("Window ID required when using windowInsideCoordinates")
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

server.tool("window_capture", "Focuses on a window and captures a screenshot of just that window (LIMITATION: coordinate handling for secondary displays not fully implemented - may not work reliably on non-primary displays. Automatically optimized for AI analysis)", {
  windowId: z.number().optional().describe("The ID of the window to capture (from list_windows)"),
  windowTitle: z.string().optional().describe("The title of the window to capture (alternative to windowId)")
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
      "screen_capture", "window_capture", "focus_window"
    ]).describe("Type of action to execute"),
    params: z.record(z.any()).optional().describe("Parameters for the action (same as individual method parameters)"),
    delay: z.number().min(0).max(60000).default(0).describe("Delay in milliseconds after this action (0-60000ms, up to 60 seconds)")
  })).describe("Array of actions to execute in sequence"),
  continueOnError: z.boolean().default(false).describe("If true, continue executing remaining actions even if one fails (default: false)")
}, async (params) => toMcpResponse(await capabilityImplementations.multiple_desktop_actions(params)));

server.resource(
  "screenshot-list",
  "screenshot://list",
  async (uri) => {
    const result = {
      contents: [
        ...Object.keys(screenshots).map(name => ({
          uri: `screenshot://${name}`,
          mimeType: "image/webp",
          blob: screenshots[name],
        })),
      ]
    };

    server.server.sendLoggingMessage({level: "info", data: `Returned ${JSON.stringify(result)}`});
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
  await server.connect(transport);
  // MCP Server running on stdio - logging removed to avoid protocol interference
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
