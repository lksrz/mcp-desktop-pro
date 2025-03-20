// Screenshot and Mouse Control PoC
const screenshot = require('screenshot-desktop');
const robot = require('robotjs');
const fs = require('fs');
const path = require('path');

// Function to take a screenshot and save it
async function takeScreenshot(filename = 'screenshot.png') {
  try {
    // Take a screenshot of the entire desktop
    const imgPath = path.join(__dirname, filename);
    const img = await screenshot();
    
    // Save the screenshot
    fs.writeFileSync(imgPath, img);
    console.log(`Screenshot saved to ${imgPath}`);
    return imgPath;
  } catch (error) {
    console.error('Error taking screenshot:', error);
    throw error;
  }
}

// Function to move the mouse to specific coordinates
function moveMouse(x, y) {
  try {
    // Get screen size
    const screenSize = robot.getScreenSize();
    console.log(`Screen size: ${screenSize.width}x${screenSize.height}`);
    
    // Validate coordinates
    if (x < 0 || x > screenSize.width || y < 0 || y > screenSize.height) {
      console.warn(`Coordinates (${x},${y}) are outside the screen bounds`);
    }
    
    // Move the mouse
    robot.moveMouse(x, y);
    console.log(`Mouse moved to coordinates: (${x}, ${y})`);
  } catch (error) {
    console.error('Error moving mouse:', error);
    throw error;
  }
}

// Function to demonstrate capabilities
async function demo() {
  try {
    // First take a screenshot
    const screenshotPath = await takeScreenshot();
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Move the mouse to the center of the screen
    const screen = robot.getScreenSize();
    const centerX = Math.floor(screen.width / 2);
    const centerY = Math.floor(screen.height / 2);
    
    moveMouse(centerX, centerY);
    
    console.log('Demo completed successfully!');
  } catch (error) {
    console.error('Demo failed:', error);
  }
}

// Run the demo
demo();
