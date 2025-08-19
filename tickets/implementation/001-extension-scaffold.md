# Implementation: Extension Scaffold Setup

## Ticket Description
Create the initial VS Code extension scaffold with TypeScript configuration, build system, and basic extension structure.

## Acceptance Criteria
- [ ] VS Code extension project initialized
- [ ] TypeScript configuration set up
- [ ] Build and bundling system configured
- [ ] Basic extension activation working
- [ ] Development environment documented

## Implementation Steps

### 1. Initialize Project
```bash
npm init -y
npm install -D @types/vscode @types/node typescript esbuild
npm install -D @vscode/test-electron @types/mocha mocha
```

### 2. Package.json Configuration
```json
{
  "name": "copilot-mcp-bridge",
  "displayName": "Copilot MCP Bridge",
  "description": "Connect GitHub Copilot to MCP servers",
  "version": "0.0.1",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "activationEvents": [
    "onStartupFinished"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "copilot-mcp.configure",
        "title": "Configure MCP Servers"
      }
    ],
    "configuration": {
      "title": "Copilot MCP Bridge",
      "properties": {
        "copilot-mcp.servers": {
          "type": "array",
          "default": [],
          "description": "MCP server configurations"
        }
      }
    },
    "chatParticipants": [
      {
        "id": "mcp-bridge",
        "name": "MCP",
        "description": "Access MCP server tools"
      }
    ]
  }
}
```

### 3. TypeScript Configuration (tsconfig.json)
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", ".vscode-test"]
}
```

### 4. Build Configuration (esbuild.js)
```javascript
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
    plugins: [/* custom plugins */]
  });
  
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
```

### 5. Extension Entry Point (src/extension.ts)
```typescript
import * as vscode from 'vscode';
import { ExtensionContext } from './types';
import { MCPManager } from './mcp/manager';
import { CopilotIntegration } from './copilot/integration';

export async function activate(context: vscode.ExtensionContext) {
  console.log('Copilot MCP Bridge is activating...');
  
  // Initialize core components
  const mcpManager = new MCPManager(context);
  const copilotIntegration = new CopilotIntegration(context, mcpManager);
  
  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('copilot-mcp.configure', () => {
      // Open configuration UI
    })
  );
  
  // Initialize components
  await mcpManager.initialize();
  await copilotIntegration.register();
  
  console.log('Copilot MCP Bridge activated successfully');
}

export function deactivate() {
  console.log('Copilot MCP Bridge is deactivating...');
}
```

### 6. NPM Scripts
```json
{
  "scripts": {
    "vscode:prepublish": "npm run package",
    "compile": "node esbuild.js",
    "watch": "node esbuild.js --watch",
    "package": "node esbuild.js --production",
    "test": "node ./out/test/runTest.js",
    "lint": "eslint src --ext ts",
    "format": "prettier --write \"src/**/*.ts\""
  }
}
```

## File Structure
```
copilot-mcp-bridge/
├── .vscode/
│   ├── launch.json      # Debug configuration
│   └── tasks.json       # Build tasks
├── src/
│   ├── extension.ts     # Entry point
│   ├── types/           # TypeScript types
│   ├── mcp/            # MCP implementation
│   ├── copilot/        # Copilot integration
│   └── test/           # Unit tests
├── package.json
├── tsconfig.json
├── esbuild.js
├── .gitignore
├── .eslintrc.js
└── README.md
```