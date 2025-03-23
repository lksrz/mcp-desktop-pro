#!/usr/bin/env node

// Import required packages
const screenshot = require('screenshot-desktop');
const robot = require('robotjs');
const { McpServer, ResourceTemplate } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

// Create server instance
const server = new McpServer(
  {
    name: "mcp-desktop-automation",
    version: "0.1.2",
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
      // Take a screenshot
      const img = await screenshot();
      const imgInBase64 = img.toString('base64');
      const timestamp = Math.floor(Date.now() / 1000);
      const screenshotKey = `screenshot-${timestamp}`;

      screenshots[screenshotKey] = imgInBase64;
      await server.server.sendResourceListChanged();

      return {
        content: [
          {
            type: "text",
            text: `Screenshot ${screenshotKey} taken.`,
          },
          {
            type: "image",
            mimeType: "image/png",
            data: imgInBase64,
          },
        ],
        isError: false
      };
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

server.tool("screen_capture", "Captures the current screen content", {},
  async () => capabilityImplementations.screen_capture());

server.tool("keyboard_press", "Presses a keyboard key or key combination", {
  key: z.string().describe("Key to press (e.g., 'enter', 'a', 'control')"),
  modifiers: z.array(z.enum(["control", "shift", "alt", "command"])).default([]).describe("Modifier keys to hold while pressing the key")
}, async (params) => toMcpResponse(capabilityImplementations.keyboard_press(params)));

server.tool("keyboard_type", "Types text at the current cursor position", {
  text: z.string().describe("Text to type")
}, async (params) => toMcpResponse(capabilityImplementations.keyboard_type(params)));

server.tool("mouse_click", "Performs a mouse click", {
  button: z.enum(["left", "right", "middle"]).default("left").describe("Mouse button to click"),
  double: z.boolean().default(false).describe("Whether to perform a double click")
}, async (params) => toMcpResponse(capabilityImplementations.mouse_click(params)));

server.tool("mouse_move", "Moves the mouse to specified coordinates", {
  x: z.number().describe("X coordinate"),
  y: z.number().describe("Y coordinate")
}, async (params) => toMcpResponse(capabilityImplementations.mouse_move(params)));

server.resource(
  "screenshot-list",
  "screenshot://list",
  async (uri) => {
    const result = {
      contents: [
        ...Object.keys(screenshots).map(name => ({
          uri: `screenshot://${name}`,
          mimeType: "image/png",
          blob: screenshots[name],
        })),
      ]
    };

    server.server.sendLoggingMessage({level: "info", data: `Returned ${JSON.stringify(result)}`});
    console.error(`Returned ${JSON.stringify(result)}`);
    return result;
  }
);

server.resource(
  "screenshot-content",
  new ResourceTemplate("screenshot://{id}", { list: undefined }),
  async (uri, { id }) => ({
    contents: [{
      uri: uri.href,
      mimeType: "image/png",
      blob: screenshots[id],
    }]
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Robot MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
