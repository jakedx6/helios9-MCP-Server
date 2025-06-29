# Helios-9 MCP Server Setup Guide

This guide walks you through setting up the Helios-9 MCP server for use with AI assistants like Claude Desktop.

## Prerequisites

- **Node.js 18+** installed on your system
- **Helios-9 account** with active projects/data
- **AI Assistant** that supports MCP (Claude Desktop, etc.)
- **Git** for cloning the repository

## Installation

### 1. Clone the Repository

```bash
# Clone the Helios-9 repository
git clone <your-helios9-repository-url>
cd helios9

# Navigate to the MCP server package
cd packages/mcp-server
```

### 2. Install Dependencies

```bash
# Install MCP server dependencies
npm install

# If you need to install from the root (workspace setup)
cd ../..
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the `packages/mcp-server` directory:

```bash
# Copy the example environment file
cp .env.example .env
```

Edit the `.env` file with your Helios-9 SaaS configuration:

```bash
# Helios-9 SaaS Configuration (Required)
HELIOS_API_URL=https://your-helios9-app.netlify.app
# or for local development: http://localhost:3000

# API Key Authentication (Required)
HELIOS_API_KEY=your-helios9-api-key

# Optional: AI Service Keys (for enhanced features)
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

### 4. Build the Server

```bash
# Build the TypeScript code
npm run build
```

## Authentication Setup

### API Key Authentication (Required)

1. **Generate Your API Key**:
   - Log into your Helios-9 web application
   - Go to Settings → API Keys
   - Click "Generate New API Key"
   - Give it a name like "MCP Server Access"
   - Copy the generated API key (starts with `hel9_`)
   - ⚠️ **Important**: Save this key securely - it won't be shown again!

2. **Set Environment Variables**:
   ```bash
   export HELIOS_API_URL=https://your-helios9-app.netlify.app
   export HELIOS_API_KEY=hel9_your_generated_api_key
   ```

3. **For Local Development**:
   ```bash
   export HELIOS_API_URL=http://localhost:3000
   export HELIOS_API_KEY=hel9_your_generated_api_key
   ```

## AI Assistant Configuration

### Claude Desktop Setup

1. **Locate Config File**:
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Add Helios-9 MCP Server**:
   ```json
   {
     "mcpServers": {
       "helios9": {
         "command": "node",
         "args": ["/absolute/path/to/helios9/packages/mcp-server/dist/index.js"],
         "env": {
           "HELIOS_API_URL": "https://your-helios9-app.netlify.app",
           "HELIOS_API_KEY": "hel9_your_generated_api_key"
         }
       }
     }
   }
   ```

3. **Alternative with npm script**:
   ```json
   {
     "mcpServers": {
       "helios9": {
         "command": "npm",
         "args": ["run", "start"],
         "cwd": "/absolute/path/to/helios9/packages/mcp-server",
         "env": {
           "HELIOS_API_URL": "https://your-helios9-app.netlify.app",
           "HELIOS_API_KEY": "hel9_your_generated_api_key"
         }
       }
     }
   }
   ```

### Other MCP Clients

For other MCP-compatible clients, use these connection details:
- **Transport**: stdio
- **Command**: `node /path/to/helios9/packages/mcp-server/dist/index.js`
- **Environment**: Include your authentication variables

## Testing the Setup

### 1. Test Server Manually

```bash
# Navigate to the MCP server directory
cd packages/mcp-server

# Test the server directly
node dist/index.js
```

You should see:
```
[INFO] Helios-9 MCP Server initialized
[INFO] Server started and ready for connections
```

### 2. Test with Claude Desktop

1. **Restart Claude Desktop** after updating the config
2. **Start a new conversation**
3. **Test basic functionality**:
   ```
   "Can you show me my Helios-9 projects?"
   ```

Claude should respond with your project list if everything is working correctly.

### 3. Verify Tools are Available

Ask Claude:
```
"What Helios-9 tools do you have access to?"
```

You should see a list of available tools like:
- list_projects
- create_task
- get_project_context
- analyze_document_content
- etc.

## Troubleshooting

### Common Issues

#### Server Won't Start

**Error**: `Cannot find module '@supabase/supabase-js'`
```bash
# Solution: Install dependencies
npm install
```

**Error**: `Missing Helios-9 configuration`
```bash
# Solution: Check environment variables
echo $HELIOS_API_URL
echo $HELIOS_API_KEY
```

#### Authentication Fails

**Error**: `Invalid API key`
```bash
# Solution: Verify your API key
# 1. Check the API key format (should start with hel9_)
# 2. Ensure it's not expired or revoked
# 3. Generate a new API key from Helios-9 settings
```

**Error**: `API key not found`
```bash
# Solution: Check API key configuration
# Ensure HELIOS_API_KEY environment variable is set correctly
# Verify the API key exists in your Helios-9 account
```

#### Claude Can't Connect

**Issue**: Claude doesn't see the MCP server

1. **Check config path**: Ensure the path to `dist/index.js` is absolute and correct
2. **Check permissions**: Ensure the executable has proper permissions
3. **Check logs**: Look at Claude's error logs
4. **Test manually**: Run the server manually to verify it works

**Issue**: Tools not available

1. **Restart Claude**: Always restart after config changes
2. **Check build**: Ensure `npm run build` completed successfully
3. **Verify auth**: Check that authentication is working

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable
export DEBUG=helios9:*

# Run server with debug output
node dist/index.js
```

### Health Check

Test server health:

```bash
# Quick health check
curl -X POST http://localhost:3000/health || echo "Server not running on HTTP"

# Check process
ps aux | grep "node.*helios9"
```

## Advanced Configuration

### Custom Port (if using HTTP transport)

```json
{
  "mcpServers": {
    "helios9": {
      "command": "node",
      "args": ["/path/to/helios9/packages/mcp-server/dist/index.js"],
      "env": {
        "PORT": "3001",
        "TRANSPORT": "http"
      }
    }
  }
}
```

### Rate Limiting

Configure rate limits:

```bash
# Environment variables
export RATE_LIMIT_REQUESTS=200
export RATE_LIMIT_WINDOW=3600  # 1 hour in seconds
```

### Logging Configuration

```bash
# Log level (error, warn, info, debug)
export LOG_LEVEL=info

# Log format (json, simple)
export LOG_FORMAT=simple

# Log file (optional)
export LOG_FILE=/var/log/helios9-mcp.log
```

## Security Considerations

### 1. API Key Security
- **Never share your API keys** - they provide full access to your Helios-9 account
- **Store keys securely** - use environment variables, never hardcode in files
- **Rotate keys regularly** - generate new keys and revoke old ones
- **Monitor key usage** - check the activity logs for unexpected usage
- **Use descriptive names** - name your API keys clearly (e.g., "MCP Server - Production")

### 2. Network Security
- MCP server runs locally by default
- All data goes through HTTPS to your Helios-9 SaaS application
- No direct database access - everything through authenticated APIs
- Consider VPN for team access

### 3. Data Privacy
- All data stays within your Helios-9 SaaS application
- MCP server doesn't store data locally - only acts as a bridge
- All requests are authenticated and logged
- Review AI assistant's data handling policies

## Performance Optimization

### 1. API Performance
- All requests go through Helios-9 SaaS APIs
- Response times depend on your deployment (Netlify, etc.)
- Use pagination parameters for large datasets
- Monitor your Helios-9 application's performance

### 2. Memory Usage
- MCP server uses minimal memory by default
- No local data caching - everything fetched fresh
- Monitor memory usage with tools like `htop`

### 3. Response Times
- Most operations complete under 500ms (including API round-trip)
- Complex analytics may take 1-3 seconds
- Large document operations may take longer
- Consider rate limiting for high-frequency usage

## Updating

### Update MCP Server

```bash
# Pull latest changes
git pull origin main

# Rebuild
cd packages/mcp-server
npm run build

# Restart your AI assistant
```

### Update Dependencies

```bash
# Update packages
npm update

# Rebuild
npm run build
```

## Next Steps

Once your MCP server is running:

1. **Explore Tools**: Try different MCP tools with your AI assistant
2. **Set Up Workflows**: Create automation rules
3. **Analyze Projects**: Use analytics and insights tools
4. **Integrate**: Connect with other tools via webhooks
5. **Customize**: Modify tools for your specific needs

## Support

Need help?
- Check the [User Guide](./mcp-user-guide.md)
- Review [Common Use Cases](./mcp-use-cases.md)
- See [Troubleshooting Guide](./mcp-troubleshooting.md)
- File issues on GitHub