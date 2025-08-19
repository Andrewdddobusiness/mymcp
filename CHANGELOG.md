# Changelog

All notable changes to the Copilot MCP Bridge extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Initial architecture implementation
- Core extension scaffold with TypeScript
- MCP protocol v1.0 implementation
- GitHub Copilot chat integration
- Multiple transport support (stdio, HTTP, WebSocket)
- Connection pooling and health monitoring
- Server discovery from multiple sources

## [0.1.0] - 2024-12-19
### Added
- Initial beta release
- GitHub Copilot chat participant (`@mcp`)
- MCP server connection management
- Support for stdio, HTTP, and WebSocket transports
- Basic configuration through VS Code settings
- Server auto-discovery in workspace
- Import from Claude Desktop configuration
- Secure credential storage using VS Code secrets API
- Status bar integration
- Output channel for debugging
- Command palette commands
- Natural language command parsing
- Tool execution with argument validation
- Response formatting (tables, code blocks, markdown)
- Context variables for MCP data access

### Security
- Sandboxed process execution for stdio transport
- Request validation and sanitization
- Rate limiting for tool executions
- Secure credential storage

### Known Issues
- Integration tests not yet implemented
- Limited error recovery in some edge cases
- Performance optimization needed for large tool results

[Unreleased]: https://github.com/yourusername/copilot-mcp-bridge/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourusername/copilot-mcp-bridge/releases/tag/v0.1.0