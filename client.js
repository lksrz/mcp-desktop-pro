// MCP Client Example
const WebSocket = require('ws');
const axios = require('axios');
const fs = require('fs');

// Configuration
const SERVER_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';
let requestId = 1;

// Connect to WebSocket server
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('Connected to MCP server');
  
  // Start the demo when connected
  runDemo();
});

ws.on('message', (message) => {
  try {
    const data = JSON.parse(message);
    
    if (data.type === 'capabilities') {
      console.log('Received capabilities:', Object.keys(data.data));
    } else if (data.type === 'result') {
      // Log result info without the full base64 string
      console.log(`Result for request #${data.requestId}:`, 
        data.result && data.result.success !== undefined 
          ? `Success: ${data.result.success}` 
          : 'Result received');
      
      // Check if this is a screen capture result
      if (data.result && 
          data.result.success && 
          data.result.result && 
          typeof data.result.result === 'string' && 
          data.result.result.startsWith('data:image')) {
        
        const timestamp = Math.floor(Date.now() / 1000);
        saveBase64Image(data.result.result, `screenshot-${timestamp}.png`);
      }
    } else if (data.type === 'error') {
      console.error('Error from server:', data.error);
    }
  } catch (error) {
    console.error('Error processing WebSocket message:', error);
  }
});

ws.on('close', () => {
  console.log('Disconnected from MCP server');
});

// Function to execute a capability via WebSocket
function executeCapability(capability, params = {}) {
  const id = requestId++;
  
  return new Promise((resolve, reject) => {
    // Set up one-time listener for this specific request
    const messageHandler = (message) => {
      try {
        const data = JSON.parse(message);
        
        if (data.requestId === id) {
          ws.removeListener('message', messageHandler);
          
          if (data.type === 'error') {
            reject(new Error(data.error));
          } else {
            resolve(data.result);
          }
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };
    
    ws.on('message', messageHandler);
    
    // Send the request
    ws.send(JSON.stringify({
      type: 'execute',
      capability,
      params,
      requestId: id
    }));
    
    // Set timeout
    setTimeout(() => {
      ws.removeListener('message', messageHandler);
      reject(new Error(`Request #${id} timed out`));
    }, 10000);
  });
}

// Function to save base64 image
function saveBase64Image(base64Data, filename) {
  try {
    // Remove the data URL prefix
    const base64Image = base64Data.split(';base64,').pop();
    
    fs.writeFile(filename, base64Image, {encoding: 'base64'}, (err) => {
      if (err) {
        console.error('Error saving image:', err);
      } else {
        console.log(`Image saved as ${filename}`);
      }
    });
  } catch (error) {
    console.error('Error saving image:', error);
    console.error('Base64 data type:', typeof base64Data);
    console.error('Base64 data starts with:', base64Data ? base64Data.substring(0, 50) + '...' : 'undefined');
  }
}

// Demo function to showcase capabilities
async function runDemo() {
  try {
    // Step 1: Get screen size
    console.log('Getting screen size...');
    const screenSizeResult = await executeCapability('get_screen_size');
    
    // The result has this structure: { success: true, result: { width: X, height: Y } }
    if (!screenSizeResult.success || !screenSizeResult.result) {
      throw new Error('Failed to get screen size');
    }
    
    const screenSize = screenSizeResult.result;
    console.log('Screen size:', screenSize);
    
    // Step 2: Take initial screenshot
    console.log('Taking initial screenshot...');
    const screenshotResult = await executeCapability('screen_capture');
    console.log('Screenshot result success:', screenshotResult.success);
    
    // Step 3: Move mouse to center of screen
    const centerX = Math.floor(screenSize.width / 2);
    const centerY = Math.floor(screenSize.height / 2);
    console.log(`Moving mouse to center (${centerX}, ${centerY})...`);
    await executeCapability('mouse_move', { x: centerX, y: centerY });
    
    // Step 4: Take another screenshot
    console.log('Taking second screenshot...');
    await executeCapability('screen_capture');
    
    // Step 5: Click left mouse button
    console.log('Clicking left mouse button...');
    await executeCapability('mouse_click');
    
    // Step 6: Type some text
    console.log('Typing text...');
    await executeCapability('keyboard_type', { text: 'Hello from MCP Client!' });
    
    // Step 7: Press Enter key
    console.log('Pressing Enter key...');
    await executeCapability('keyboard_press', { key: 'enter' });
    
    // Step 8: Take final screenshot
    console.log('Taking final screenshot...');
    await executeCapability('screen_capture');
    
    console.log('Demo completed successfully!');
  } catch (error) {
    console.error('Demo failed:', error);
  } finally {
    // Close the WebSocket connection when done
    setTimeout(() => {
      ws.close();
    }, 1000);
  }
}
