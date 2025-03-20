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
  const data = JSON.parse(message);
  
  if (data.type === 'capabilities') {
    console.log('Received capabilities:', Object.keys(data.data));
  } else if (data.type === 'result') {
    console.log(`Result for request #${data.requestId}:`, data.result);
    
    // If this is a screen capture, save the image
    if (data.result && data.result.startsWith && data.result.startsWith('data:image')) {
      saveBase64Image(data.result, `screenshot-${data.requestId}.png`);
    }
  } else if (data.type === 'error') {
    console.error('Error from server:', data.error);
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
      const data = JSON.parse(message);
      
      if (data.requestId === id) {
        ws.removeListener('message', messageHandler);
        
        if (data.type === 'error') {
          reject(new Error(data.error));
        } else {
          resolve(data.result);
        }
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
  // Remove the data URL prefix
  const base64Image = base64Data.split(';base64,').pop();
  
  fs.writeFile(filename, base64Image, {encoding: 'base64'}, (err) => {
    if (err) {
      console.error('Error saving image:', err);
    } else {
      console.log(`Image saved as ${filename}`);
    }
  });
}

// Demo function to showcase capabilities
async function runDemo() {
  try {
    // Step 1: Get screen size
    console.log('Getting screen size...');
    const screenSize = await executeCapability('get_screen_size');
    console.log('Screen size:', screenSize);
    
    // Step 2: Take initial screenshot
    console.log('Taking initial screenshot...');
    await executeCapability('screen_capture');
    
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
  }
}
