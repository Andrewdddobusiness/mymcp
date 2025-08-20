# Claude Development Guidelines

This file contains guidelines and preferences for Claude when working on this project.

## Code Style Preferences

### Functions over Classes
**Preference**: Use functions instead of classes whenever possible.

**Rationale**: 
- Functions are simpler to test and reason about
- Reduce object-oriented complexity 
- Encourage functional programming patterns
- Easier to mock and stub in tests
- Better tree-shaking in bundlers

**Implementation Pattern**:
Instead of classes with instance state, use:
1. Module-level state variables
2. Factory functions that return state objects
3. Pure functions that accept state as parameters
4. Exported functions that operate on shared state

**Example**:
```typescript
// ❌ Avoid: Class-based approach
export class Logger {
  private winston: winston.Logger;
  constructor() { /* ... */ }
  info(message: string) { /* ... */ }
}

// ✅ Prefer: Function-based approach
interface LoggerState {
  winston: winston.Logger;
  outputChannel: vscode.OutputChannel;
}

let loggerInstance: LoggerState | null = null;

function getLogger(): LoggerState { /* ... */ }

export function info(message: string): void { /* ... */ }
export function dispose(): void { /* ... */ }
```

**When Classes Are Acceptable**:
- When interfacing with VS Code APIs that expect class instances
- For complex state machines where OOP provides clear benefits
- When implementing interfaces that require class inheritance

## Current Refactoring Status

### ✅ Completed
- `src/utils/logger.ts` - Converted from Logger class to function exports
- `src/ui/statusBar.ts` - Converted from StatusBarManager class to function exports

### 🚧 In Progress
- Large classes in MCP modules still need refactoring
- Copilot integration classes need refactoring

### 📋 TODO
- `src/config/storage.ts` - ConfigurationStorage class
- `src/mcp/manager.ts` - MCPManager class  
- `src/mcp/client/mcpClient.ts` - MCPClient class
- `src/mcp/transport/*.ts` - Transport classes
- `src/copilot/*.ts` - Copilot integration classes

## Other Guidelines

### Testing
- Run `npm run lint` and `npm run type-check` before committing
- Use the pre-release script: `npm run prerelease`

### Deployment
- Package with: `./scripts/package.sh`
- The project uses GitHub Actions for CI/CD
- Extensions are packaged as .vsix files for VS Code marketplace

### Dependencies
- Minimal dependencies preferred
- Use built-in VS Code APIs when possible
- Winston for logging, WS for WebSocket transport