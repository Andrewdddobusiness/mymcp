# Frontend Development Agent

## Role
Specialized in VS Code UI/UX development, webviews, and user interaction components for the extension.

## Expertise
- VS Code Webview API
- HTML/CSS/JavaScript for webviews
- VS Code UI components (TreeView, StatusBar, QuickPick)
- React/Vue (if needed for complex UIs)
- Secure communication between webview and extension
- Responsive design for VS Code themes

## Assigned Tickets
1. `implementation/004-configuration-ui`
2. UI components for server management
3. Status bar indicators
4. Progress notifications

## Execution Plan

### Ticket: implementation/004-configuration-ui
```bash
# Create UI resources
mkdir -p media/{css,js,icons}
touch media/config.html
touch media/config.css
touch media/config.js

# Create UI components
mkdir -p src/ui/components
touch src/ui/configWebview.ts
touch src/ui/statusBar.ts
touch src/ui/notifications.ts
```

### Webview Implementation Strategy
```typescript
// 1. Create webview provider
class ConfigurationWebviewProvider implements vscode.WebviewViewProvider {
  // Handle webview lifecycle
  // Manage message passing
  // Update UI state
}

// 2. Design message protocol
interface WebviewMessage {
  command: string;
  payload?: any;
}

// 3. Implement two-way communication
webview.postMessage({ command: 'updateServers', servers });
webview.onDidReceiveMessage(handleMessage);
```

### UI Components to Build

#### 1. Server Configuration Form
```html
<!-- Clean, accessible form design -->
<form class="server-config">
  <div class="form-group">
    <label>Server Name</label>
    <input type="text" required>
  </div>
  <div class="form-group">
    <label>Transport Type</label>
    <select>
      <option>Stdio</option>
      <option>HTTP</option>
      <option>WebSocket</option>
    </select>
  </div>
</form>
```

#### 2. Server List View
```javascript
// Dynamic server list with actions
function renderServerList(servers) {
  return servers.map(server => `
    <div class="server-item">
      <span class="server-name">${server.name}</span>
      <div class="server-actions">
        <button onclick="testServer('${server.id}')">Test</button>
        <button onclick="editServer('${server.id}')">Edit</button>
        <button onclick="deleteServer('${server.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}
```

#### 3. Status Bar Item
```typescript
// Show MCP connection status
const statusBarItem = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Right,
  100
);
statusBarItem.text = "$(plug) MCP: Connected";
statusBarItem.tooltip = "3 servers connected";
statusBarItem.command = 'copilot-mcp.showStatus';
```

## Design System
```css
/* VS Code theme-aware styling */
:root {
  --vscode-button-background: var(--vscode-button-background);
  --vscode-button-foreground: var(--vscode-button-foreground);
  --vscode-input-background: var(--vscode-input-background);
}

.button {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 6px 14px;
  cursor: pointer;
}

.form-group {
  margin-bottom: 12px;
}

.server-item {
  display: flex;
  justify-content: space-between;
  padding: 8px;
  border-bottom: 1px solid var(--vscode-panel-border);
}
```

## Security Considerations
1. Sanitize all user inputs
2. Use nonces for webview scripts
3. Restrict webview capabilities
4. Validate messages between contexts
5. No inline scripts or styles

## Integration Points
- **With Backend Agent**: Server management API
- **With Testing Agent**: UI component tests
- **With Integration Agent**: Copilot UI integration

## Testing Strategy
- Unit tests for UI logic
- Integration tests for webview communication
- Manual testing across VS Code themes
- Accessibility testing

## Git Branch Strategy
- Branch: `feature/frontend-ui`
- Commits: Component-based commits
- PR Strategy: Include screenshots/GIFs