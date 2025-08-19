# Deployment: Extension Packaging and Publishing

## Ticket Description
Set up the build pipeline, packaging process, and publishing workflow for releasing the Copilot-MCP bridge extension to the VS Code marketplace.

## Acceptance Criteria
- [ ] Extension packaged as .vsix file
- [ ] Publisher account configured
- [ ] Automated release pipeline created
- [ ] Documentation and changelog updated
- [ ] Extension published to marketplace

## Implementation Steps

### 1. VS Code Extension Manifest Updates
```json
{
  "name": "copilot-mcp-bridge",
  "displayName": "GitHub Copilot MCP Bridge",
  "description": "Connect GitHub Copilot to MCP (Model Context Protocol) servers for enhanced AI capabilities",
  "version": "1.0.0",
  "publisher": "your-publisher-id",
  "icon": "resources/icon.png",
  "galleryBanner": {
    "color": "#1e1e1e",
    "theme": "dark"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/copilot-mcp-bridge"
  },
  "bugs": {
    "url": "https://github.com/yourusername/copilot-mcp-bridge/issues"
  },
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": [
    "AI",
    "Other"
  ],
  "keywords": [
    "copilot",
    "mcp",
    "ai",
    "model-context-protocol",
    "github-copilot"
  ],
  "activationEvents": [
    "onStartupFinished"
  ],
  "extensionDependencies": [
    "github.copilot-chat"
  ]
}
```

### 2. Build and Package Scripts
```bash
#!/bin/bash
# scripts/package.sh

set -e

echo "Building extension..."
npm run compile

echo "Running tests..."
npm test

echo "Packaging extension..."
vsce package

echo "Extension packaged successfully!"
```

### 3. GitHub Actions Workflow (.github/workflows/release.yml)
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: |
        npm ci
        npm install -g vsce
    
    - name: Run tests
      run: npm test
    
    - name: Package extension
      run: vsce package
    
    - name: Upload VSIX
      uses: actions/upload-artifact@v3
      with:
        name: vsix
        path: '*.vsix'
    
  publish:
    needs: build
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Download VSIX
      uses: actions/download-artifact@v3
      with:
        name: vsix
    
    - name: Publish to VS Code Marketplace
      env:
        VSCE_PAT: ${{ secrets.VSCE_PAT }}
      run: |
        npm install -g vsce
        vsce publish -p $VSCE_PAT
    
    - name: Create GitHub Release
      uses: softprops/action-gh-release@v1
      with:
        files: '*.vsix'
        body: |
          See [CHANGELOG.md](https://github.com/${{ github.repository }}/blob/main/CHANGELOG.md) for details.
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 4. Pre-release Checklist Script
```typescript
// scripts/prerelease.ts
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface CheckResult {
  passed: boolean;
  message: string;
}

class PrereleaseChecker {
  private checks: Array<() => CheckResult> = [
    this.checkVersion,
    this.checkChangelog,
    this.checkTests,
    this.checkLint,
    this.checkBuild,
    this.checkDependencies,
    this.checkDocumentation
  ];
  
  async runChecks(): Promise<boolean> {
    console.log('Running pre-release checks...\n');
    
    let allPassed = true;
    
    for (const check of this.checks) {
      const result = check.call(this);
      const emoji = result.passed ? '✅' : '❌';
      console.log(`${emoji} ${result.message}`);
      
      if (!result.passed) {
        allPassed = false;
      }
    }
    
    console.log('\n' + (allPassed ? '✅ All checks passed!' : '❌ Some checks failed.'));
    return allPassed;
  }
  
  private checkVersion(): CheckResult {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const currentVersion = packageJson.version;
    
    // Check if version follows semver
    const semverRegex = /^\d+\.\d+\.\d+(-\w+(\.\d+)?)?$/;
    const passed = semverRegex.test(currentVersion);
    
    return {
      passed,
      message: `Version format (${currentVersion})`
    };
  }
  
  private checkChangelog(): CheckResult {
    const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
    const exists = fs.existsSync(changelogPath);
    
    if (!exists) {
      return {
        passed: false,
        message: 'CHANGELOG.md missing'
      };
    }
    
    const changelog = fs.readFileSync(changelogPath, 'utf8');
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const hasVersionEntry = changelog.includes(`## [${packageJson.version}]`);
    
    return {
      passed: hasVersionEntry,
      message: `CHANGELOG.md updated for v${packageJson.version}`
    };
  }
  
  private checkTests(): CheckResult {
    try {
      execSync('npm test', { stdio: 'pipe' });
      return {
        passed: true,
        message: 'All tests passing'
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Tests failing'
      };
    }
  }
  
  private checkLint(): CheckResult {
    try {
      execSync('npm run lint', { stdio: 'pipe' });
      return {
        passed: true,
        message: 'No linting errors'
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Linting errors found'
      };
    }
  }
  
  private checkBuild(): CheckResult {
    try {
      execSync('npm run compile', { stdio: 'pipe' });
      return {
        passed: true,
        message: 'Build successful'
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Build failed'
      };
    }
  }
  
  private checkDependencies(): CheckResult {
    try {
      execSync('npm audit --production', { stdio: 'pipe' });
      return {
        passed: true,
        message: 'No security vulnerabilities'
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Security vulnerabilities found'
      };
    }
  }
  
  private checkDocumentation(): CheckResult {
    const requiredFiles = ['README.md', 'LICENSE'];
    const missing = requiredFiles.filter(file => !fs.existsSync(file));
    
    return {
      passed: missing.length === 0,
      message: missing.length === 0 
        ? 'All documentation present' 
        : `Missing: ${missing.join(', ')}`
    };
  }
}

// Run checks
new PrereleaseChecker().runChecks().then(passed => {
  process.exit(passed ? 0 : 1);
});
```

### 5. Documentation Files

#### README.md
```markdown
# GitHub Copilot MCP Bridge

Connect GitHub Copilot to MCP (Model Context Protocol) servers to enhance AI capabilities with external tools and data sources.

## Features

- 🔌 **Easy MCP Server Integration**: Connect to any MCP-compatible server
- 🤖 **Seamless Copilot Integration**: Access MCP tools through Copilot chat
- 🛠️ **Multiple Transport Support**: Stdio, HTTP, and WebSocket connections
- 📦 **Import from Claude Desktop**: Reuse existing MCP configurations
- 🔒 **Secure Credential Storage**: Built-in secret management

## Installation

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=your-publisher.copilot-mcp-bridge)
2. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. Run "Copilot MCP: Configure Servers"

## Quick Start

### Adding an MCP Server

1. Click the MCP icon in the sidebar
2. Click "Add Server"
3. Configure your server:
   - **Name**: Display name for the server
   - **Transport**: Choose stdio, HTTP, or WebSocket
   - **Command**: For stdio servers, the command to run
   - **URL**: For HTTP/WebSocket servers

### Using MCP Tools in Copilot

```
@mcp list tools
@mcp run weather city="San Francisco"
```

## Supported MCP Servers

- [Weather MCP Server](https://github.com/example/weather-mcp)
- [Database MCP Server](https://github.com/example/db-mcp)
- [File System MCP Server](https://github.com/example/fs-mcp)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
```

#### CHANGELOG.md
```markdown
# Changelog

All notable changes to the Copilot MCP Bridge extension will be documented in this file.

## [1.0.0] - 2024-01-15

### Added
- Initial release
- GitHub Copilot chat integration
- MCP server connection management
- Support for stdio, HTTP, and WebSocket transports
- Configuration UI
- Import from Claude Desktop
- Secure credential storage

## [0.1.0] - 2024-01-01

### Added
- Beta release for testing
```

### 6. Publishing Checklist

1. **Create Publisher**
   ```bash
   vsce create-publisher your-publisher-id
   ```

2. **Get Personal Access Token**
   - Go to https://dev.azure.com/your-org
   - Create PAT with Marketplace (Manage) scope

3. **Update package.json**
   - Set correct publisher ID
   - Update version number
   - Add icon and screenshots

4. **Run Pre-release Checks**
   ```bash
   npm run prerelease
   ```

5. **Package Extension**
   ```bash
   vsce package
   ```

6. **Test VSIX Locally**
   ```bash
   code --install-extension copilot-mcp-bridge-*.vsix
   ```

7. **Publish to Marketplace**
   ```bash
   vsce publish
   ```

## File Structure
```
.github/
├── workflows/
│   ├── ci.yml           # Continuous integration
│   └── release.yml      # Release automation
scripts/
├── package.sh          # Packaging script
└── prerelease.ts       # Pre-release checks
resources/
├── icon.png           # Extension icon (128x128)
├── screenshots/       # Marketplace screenshots
└── demo.gif          # Demo animation
```