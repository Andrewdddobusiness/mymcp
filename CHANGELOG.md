# Changelog

All notable changes to the Copilot MCP Bridge extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-08-20
### Added
- Initial release of GitHub Copilot MCP Bridge extension
- GitHub Copilot chat participant (@mcp) for seamless MCP tool integration  
- Comprehensive MCP protocol client with stdio, HTTP, and WebSocket transport support
- Advanced connection pooling with health checks and automatic reconnection
- Server configuration management via VS Code settings
- Server discovery from Claude Desktop configuration files
- Secure credential storage using VS Code secrets API
- Real-time status monitoring with status bar integration
- Tool discovery, validation, and execution with progress tracking
- Support for structured tool responses (tables, code, images)
- Comprehensive error handling and user-friendly error messages

## [Unreleased]
### Added
- Future features and improvements will be listed here

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