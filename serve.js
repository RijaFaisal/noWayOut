const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');

// Enable debug mode for logging
const DEBUG = true;

// Function to log if debug is enabled
function debug(message) {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`);
  }
}

// Function to check if a port is in use
function isPortInUse(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => {
        // Port is in use
        resolve(true);
      })
      .once('listening', () => {
        // Port is free, close the server
        tester.close(() => resolve(false));
      })
      .listen(port, '127.0.0.1');
  });
}

const server = http.createServer((req, res) => {
  debug(`Received request: ${req.method} ${req.url}`);

  // Forward API requests to the API server
  if (req.url.startsWith('/api/')) {
    console.log(`Forwarding request to API server: ${req.url}`);
    
    // Collect request body data if present
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      debug(`Received chunk of data: ${chunk.length} bytes`);
    });
    
    req.on('end', async () => {
      debug(`Request body complete: ${body}`);
      
      // Check if API server is running
      const apiPortInUse = await isPortInUse(3001);
      if (!apiPortInUse) {
        console.error('API server is not running on port 3001');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        const errorResponse = JSON.stringify({ 
          error: 'API server is not running. Please start the API server using "node api.js"',
          success: false
        });
        res.end(errorResponse);
        return;
      }
      
      // Prepare the options for the request to the API server
      const options = {
        hostname: '127.0.0.1',
        port: 3001,
        path: req.url,
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };
      
      debug(`API request options: ${JSON.stringify(options)}`);
      
      // Create the request to the API server
      const apiReq = http.request(options, (apiRes) => {
        debug(`API server responded with status code: ${apiRes.statusCode}`);
        
        // Set headers from API response
        res.writeHead(apiRes.statusCode, apiRes.headers);
        
        // Forward the API response data
        apiRes.on('data', (chunk) => {
          res.write(chunk);
          debug(`Forwarded ${chunk.length} bytes of data from API server`);
        });
        
        apiRes.on('end', () => {
          res.end();
          console.log(`Request completed: ${req.method} ${req.url}`);
        });
      });
      
      // Handle errors
      apiReq.on('error', (err) => {
        console.error(`Error forwarding to API server: ${err.message}`);
        
        // More detailed error messages based on error type
        let errorMessage = `Error connecting to API server: ${err.message}`;
        
        if (err.code === 'ECONNREFUSED') {
          errorMessage = `Cannot connect to API server on port 3001. ` +
                        `Please ensure the API server is running by executing: node api.js`;
        }
        
        res.writeHead(500, { 'Content-Type': 'application/json' });
        const errorResponse = JSON.stringify({ 
          error: errorMessage,
          success: false
        });
        res.end(errorResponse);
        debug(`Sent error response: ${errorResponse}`);
      });
      
      // Send the body data if any
      if (body) {
        apiReq.write(body);
      }
      
      apiReq.end();
    });
    
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    // Serve the HTML file
    const filePath = path.join(__dirname, 'index.html');
    debug(`Serving HTML file: ${filePath}`);
    
    fs.readFile(filePath, (err, content) => {
      if (err) {
        console.error(`Error reading file: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: `Error loading index.html: ${err.message}`,
          success: false
        }));
        return;
      }
      
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
      debug(`Successfully served HTML file`);
    });
  } else {
    // Handle 404
    debug(`File not found: ${req.url}`);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Not found',
      success: false
    }));
  }
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Open your browser and navigate to http://localhost:${PORT}/ to see the Supabaser interface`);
  
  // Check if API server is running
  isPortInUse(3001).then(inUse => {
    if (!inUse) {
      console.warn('\x1b[33m%s\x1b[0m', 'WARNING: API server does not appear to be running on port 3001.');
      console.warn('\x1b[33m%s\x1b[0m', 'Please start the API server in another terminal with: node api.js');
    } else {
      console.log('\x1b[32m%s\x1b[0m', 'API server detected on port 3001.');
    }
  });
}); 