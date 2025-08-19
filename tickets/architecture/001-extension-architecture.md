# Architecture: VS Code Extension Core Architecture

## Ticket Description
Design the core architecture for the Copilot-MCP bridge extension, defining the main components and their interactions.

## Acceptance Criteria
- [ ] Complete architecture diagram created
- [x] Component responsibilities clearly defined
- [x] Data flow between components documented
- [x] Extension lifecycle management defined
- [x] Error handling strategy documented

## Architecture Components

### 1. Extension Host Process
- Main extension entry point
- Lifecycle management (activate/deactivate)
- Command registration
- Configuration management

### 2. Copilot Integration Layer
- Copilot chat participant registration
- Context provider implementation
- Prompt augmentation system
- Response interception and enhancement

### 3. MCP Client Manager
- MCP server discovery
- Connection pool management
- Protocol implementation
- Message routing

### 4. Context Aggregator
- Combines MCP tool results
- Manages context size limits
- Prioritizes relevant information
- Caches frequent queries

### 5. UI Components
- MCP server configuration webview
- Status bar items
- Quick pick menus
- Progress notifications

## File Structure
```
src/
├── extension.ts              # Main entry point
├── copilot/
│   ├── chatParticipant.ts   # Copilot chat integration
│   ├── contextProvider.ts   # Context injection
│   └── promptAugmenter.ts   # Prompt enhancement
├── mcp/
│   ├── client.ts            # MCP client implementation
│   ├── serverManager.ts     # Server lifecycle management
│   ├── protocol.ts          # MCP protocol types
│   └── transport.ts         # Communication layer
├── context/
│   ├── aggregator.ts        # Context aggregation logic
│   ├── cache.ts             # Caching system
│   └── prioritizer.ts       # Context prioritization
├── ui/
│   ├── configWebview.ts     # Configuration UI
│   ├── statusBar.ts         # Status indicators
│   └── notifications.ts     # User notifications
├── config/
│   ├── settings.ts          # Extension settings
│   └── storage.ts           # Persistent storage
└── utils/
    ├── logger.ts            # Logging utility
    └── errors.ts            # Error handling
```

## Key Design Decisions
1. **Event-driven architecture** for loose coupling
2. **Dependency injection** for testability
3. **Circuit breaker pattern** for MCP server failures
4. **Observer pattern** for status updates
5. **Repository pattern** for configuration storage

## Integration Points
- VS Code Extension API
- GitHub Copilot Extension API
- MCP Protocol over stdio/HTTP
- VS Code settings and secrets storage
- VS Code output channels for logging