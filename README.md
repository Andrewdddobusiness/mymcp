# GitHub Copilot MCP Bridge

Connect GitHub Copilot to MCP (Model Context Protocol) servers to enhance AI capabilities with external tools and data sources.

## Features

- 🔌 **Easy MCP Server Integration**: Connect to any MCP-compatible server
- 🤖 **Seamless Copilot Integration**: Access MCP tools through Copilot chat
- 🛠️ **Multiple Transport Support**: Stdio, HTTP, and WebSocket connections
- 📦 **Import from Claude Desktop**: Reuse existing MCP configurations
- 🔒 **Secure Credential Storage**: Built-in secret management
- 🔍 **Auto-discovery**: Automatically find MCP servers in your workspace

## Installation

### From VS Code Marketplace (Coming Soon)
1. Open VS Code
2. Go to Extensions (Ctrl/Cmd + Shift + X)
3. Search for "Copilot MCP Bridge"
4. Click Install

### Manual Installation
1. Download the latest `.vsix` file from [Releases](https://github.com/yourusername/copilot-mcp-bridge/releases)
2. Open VS Code
3. Go to Extensions (Ctrl/Cmd + Shift + X)
4. Click the "..." menu and select "Install from VSIX..."
5. Select the downloaded file

## Quick Start

### Prerequisites
- Visual Studio Code v1.85.0 or higher
- GitHub Copilot Chat extension

### Adding an MCP Server

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run "Copilot MCP: Configure Servers"
3. Configure your server:
   - **Name**: Display name for the server
   - **Transport**: Choose stdio, HTTP, or WebSocket
   - **Command**: For stdio servers, the command to run
   - **URL**: For HTTP/WebSocket servers

### Using MCP Tools in Copilot

Once configured, you can use MCP tools directly in GitHub Copilot chat:

```
@mcp list tools
@mcp run weather city="San Francisco"
@mcp servers
```

### Available Commands

- `@mcp list tools` - Show all available MCP tools
- `@mcp run <tool> [args]` - Execute a specific tool
- `@mcp servers` - Show MCP server connection status
- `@mcp help` - Show help and usage information

## Configuration

### Server Configuration in VS Code Settings

```json
{
  "copilot-mcp.servers": [
    {
      "id": "weather-server",
      "name": "Weather Server",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-weather"]
    },
    {
      "id": "api-server",
      "name": "API Server",
      "transport": "http",
      "url": "http://localhost:8080"
    }
  ]
}
```

### Workspace Configuration (.mcp.json)

Create a `.mcp.json` file in your workspace root:

```json
{
  "mcpServers": {
    "project-tools": {
      "command": "node",
      "args": ["./mcp-server.js"],
      "env": {
        "PROJECT_ROOT": "${workspaceFolder}"
      }
    }
  }
}
```

## Supported MCP Servers

- [Weather MCP Server](https://github.com/modelcontextprotocol/server-weather)
- [Filesystem MCP Server](https://github.com/modelcontextprotocol/server-filesystem)
- [Git MCP Server](https://github.com/modelcontextprotocol/server-git)
- [More servers...](https://github.com/topics/mcp-server)

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/copilot-mcp-bridge.git
cd copilot-mcp-bridge

# Install dependencies
npm install

# Build the extension
npm run compile

# Package the extension
npm run vsce:package
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
```

## Troubleshooting

### MCP Server Not Connecting
1. Check the Output panel (View → Output → Copilot MCP Bridge)
2. Verify server command/URL is correct
3. Ensure required dependencies are installed

### Tools Not Showing in Copilot
1. Verify server is connected (check status bar)
2. Try refreshing with `@mcp list tools`
3. Check server capabilities support tools

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - See [LICENSE](LICENSE) for details.

## Acknowledgments

- Built for [GitHub Copilot](https://github.com/features/copilot)
- Implements the [Model Context Protocol](https://modelcontextprotocol.io)
- Inspired by [Claude Desktop](https://claude.ai)