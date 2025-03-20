// Import required packages
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const screenshot = require('screenshot-desktop');
const robot = require('robotjs');
const cors = require('cors');

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Set();

// Configure server port
const PORT = process.env.PORT || 3000;

// MCP capabilities
const capabilities = {
  screen_capture: {
    description: "Captures the current screen content",
    parameters: {
      region: {
        type: "object",
        description: "Screen region to capture (optional)",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" }
        },
        required: []
      }
    },
    returns: { type: "string", description: "Base64 encoded image" }
  },
  mouse_move: {
    description: "Moves the mouse to specified coordinates",
    parameters: {
      x: { type: "number", description: "X coordinate" },
      y: { type: "number", description: "Y coordinate" }
    },
    returns: { type: "boolean", description: "Success status" }
  },
  mouse_click: {
    description: "Performs a mouse click",
    parameters: {
      button: { 
        type: "string", 
        description: "Mouse button to click", 
        enum: ["left", "right", "middle"],
        default: "left"
      },
      double: { 
        type: "boolean", 
        description: "Whether to perform a double click", 
        default: false
      }
    },
    returns: { type: "boolean", description: "Success status" }
  },
  keyboard_type: {
    description: "Types text at the current cursor position",
    parameters: {
      text: { type: "string", description: "Text to type" }
    },
    returns: { type: "boolean", description: "Success status" }
  },
  keyboard_press: {
    description: "Presses a keyboard key or key combination",
    parameters: {
      key: { type: "string", description: "Key to press (e.g., 'enter', 'a', 'control')" },
      modifiers: { 
        type: "array", 
        description: "Modifier keys to hold while pressing the key",
        items: { 
          type: "string", 
          enum: ["control", "shift", "alt", "command"] 
        },
        default: []
      }
    },
    returns: { type: "boolean", description: "Success status" }
  },
  get_screen_size: {
    description: "Gets the screen dimensions",
    parameters: {},
    returns: { 
      type: "object", 
      description: "Screen dimensions",
      properties: {
        width: { type: "number" },
        height: { type: "number" }
      }
    }
  }
};

// Implementation of capabilities
const capabilityImplementations = {
  screen_capture: async (params = {}) => {
    try {
      // Take a screenshot
      const img = await screenshot();
      
      // Convert to base64
      const base64Image = `data:image/png;base64,${img.toString('base64')}`;
      return { success: true, result: base64Image };
    } catch (error) {
      console.error('Error capturing screen:', error);
      return { success: false, error: error.message };
    }
  },
  
  mouse_move: (params) => {
    try {
      const { x, y } = params;
      robot.moveMouse(x, y);
      return { success: true };
    } catch (error) {
      console.error('Error moving mouse:', error);
      return { success: false, error: error.message };
    }
  },
  
  mouse_click: (params = {}) => {
    try {
      const { button = 'left', double = false } = params;
      
      if (double) {
        robot.mouseClick(button, double);
      } else {
        robot.mouseClick(button);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error clicking mouse:', error);
      return { success: false, error: error.message };
    }
  },
  
  keyboard_type: (params) => {
    try {
      const { text } = params;
      robot.typeString(text);
      return { success: true };
    } catch (error) {
      console.error('Error typing text:', error);
      return { success: false, error: error.message };
    }
  },
  
  keyboard_press: (params) => {
    try {
      const { key, modifiers = [] } = params;
      
      // Hold down modifier keys
      modifiers.forEach(modifier => robot.keyToggle(modifier, 'down'));
      
      // Press and release the main key
      robot.keyTap(key);
      
      // Release modifier keys
      modifiers.forEach(modifier => robot.keyToggle(modifier, 'up'));
      
      return { success: true };
    } catch (error) {
      console.error('Error pressing key:', error);
      return { success: false, error: error.message };
    }
  },
  
  get_screen_size: () => {
    try {
      const size = robot.getScreenSize();
      return { success: true, result: size };
    } catch (error) {
      console.error('Error getting screen size:', error);
      return { success: false, error: error.message };
    }
  }
};

// Define REST API endpoints
app.get('/capabilities', (req, res) => {
  res.json({ capabilities });
});

app.post('/execute/:capability', async (req, res) => {
  const capability = req.params.capability;
  const params = req.body;
  
  if (!capabilities[capability]) {
    return res.status(404).json({ error: `Capability '${capability}' not found` });
  }
  
  try {
    const result = await capabilityImplementations[capability](params);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket handling
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  clients.add(ws);
  
  // Send capabilities list to new client
  ws.send(JSON.stringify({ type: 'capabilities', data: capabilities }));
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      const { type, capability, params, requestId } = data;
      
      if (type === 'execute' && capability && capabilityImplementations[capability]) {
        const result = await capabilityImplementations[capability](params || {});
        ws.send(JSON.stringify({ type: 'result', requestId, result }));
      } else {
        ws.send(JSON.stringify({ 
          type: 'error', 
          requestId, 
          error: `Invalid request or capability '${capability}' not found` 
        }));
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: error.message 
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
    clients.delete(ws);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
  console.log(`REST API: http://localhost:${PORT}/capabilities`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
});
