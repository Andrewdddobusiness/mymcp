# DevOps Agent

## Role
Specialized in CI/CD, build automation, release management, and infrastructure setup for the VS Code extension.

## Expertise
- GitHub Actions workflows
- VS Code extension packaging (vsce)
- Automated testing pipelines
- Release automation
- Security scanning
- Performance monitoring
- Documentation generation

## Assigned Tickets
1. `deployment/001-packaging-publishing`
2. CI/CD pipeline setup
3. Release automation
4. Documentation and changelog management

## Execution Plan

### CI/CD Pipeline Setup

#### 1. GitHub Actions Workflows
```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        vscode-version: [stable, insiders]
    
    runs-on: ${{ matrix.os }}
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Lint
      run: npm run lint
    
    - name: Type check
      run: npm run type-check
    
    - name: Unit tests
      run: npm run test:unit
    
    - name: Integration tests
      uses: coactions/setup-xvfb@v1
      with:
        run: npm run test:integration
      env:
        VSCODE_VERSION: ${{ matrix.vscode-version }}
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info

  security:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Run security audit
      run: npm audit --production
    
    - name: Run Snyk scan
      uses: snyk/actions/node@master
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
    
    - name: SAST scan
      uses: github/super-linter@v4
      env:
        DEFAULT_BRANCH: main
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### 2. Release Workflow
```yaml
# .github/workflows/release.yml
name: Release

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Release version (e.g., 1.0.0)'
        required: true
      prerelease:
        description: 'Is this a pre-release?'
        type: boolean
        default: false

jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.version }}
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Validate version
      id: version
      run: |
        VERSION=${{ github.event.inputs.version }}
        if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9]+)?$ ]]; then
          echo "Invalid version format"
          exit 1
        fi
        echo "version=$VERSION" >> $GITHUB_OUTPUT
    
    - name: Update version
      run: |
        npm version ${{ github.event.inputs.version }} --no-git-tag-version
        git config user.name github-actions
        git config user.email github-actions@github.com
        git add package.json package-lock.json
        git commit -m "chore: bump version to ${{ github.event.inputs.version }}"
        git push

  build-and-publish:
    needs: prepare
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
      with:
        ref: main
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: |
        npm ci
        npm install -g vsce
    
    - name: Package extension
      run: vsce package
    
    - name: Publish to marketplace
      if: ${{ !github.event.inputs.prerelease }}
      run: vsce publish -p ${{ secrets.VSCE_PAT }}
    
    - name: Create GitHub release
      uses: softprops/action-gh-release@v1
      with:
        tag_name: v${{ needs.prepare.outputs.version }}
        name: Release ${{ needs.prepare.outputs.version }}
        files: '*.vsix'
        prerelease: ${{ github.event.inputs.prerelease }}
        generate_release_notes: true
```

### Build Optimization

#### 1. ESBuild Configuration
```javascript
// esbuild.config.js
const esbuild = require('esbuild');
const { copy } = require('esbuild-plugin-copy');

const production = process.argv.includes('--production');

module.exports = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node16',
  sourcemap: !production,
  minify: production,
  metafile: true,
  plugins: [
    copy({
      assets: {
        from: ['./src/media/*'],
        to: ['./media']
      }
    })
  ],
  define: {
    'process.env.NODE_ENV': production ? '"production"' : '"development"'
  }
};
```

#### 2. Bundle Analysis
```javascript
// scripts/analyze-bundle.js
const fs = require('fs');
const path = require('path');

async function analyzeBundle() {
  const metafile = JSON.parse(
    fs.readFileSync('dist/metafile.json', 'utf8')
  );
  
  // Analyze bundle size
  const outputs = Object.values(metafile.outputs);
  const totalSize = outputs.reduce((acc, output) => acc + output.bytes, 0);
  
  console.log(`Total bundle size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  
  // Find large dependencies
  const inputs = Object.entries(metafile.inputs)
    .sort(([, a], [, b]) => b.bytes - a.bytes)
    .slice(0, 10);
  
  console.log('\nTop 10 largest modules:');
  inputs.forEach(([file, data]) => {
    console.log(`  ${file}: ${(data.bytes / 1024).toFixed(2)} KB`);
  });
}

analyzeBundle();
```

### Infrastructure as Code

#### 1. Development Container
```json
// .devcontainer/devcontainer.json
{
  "name": "Copilot MCP Bridge Dev",
  "image": "mcr.microsoft.com/vscode/devcontainers/typescript-node:18",
  "features": {
    "github-cli": "latest"
  },
  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "ms-vscode.vscode-typescript-next"
      ],
      "settings": {
        "typescript.tsdk": "node_modules/typescript/lib"
      }
    }
  },
  "postCreateCommand": "npm install",
  "remoteUser": "node"
}
```

#### 2. Docker Support
```dockerfile
# Dockerfile for testing MCP servers
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 8080

CMD ["node", "test-server.js"]
```

### Documentation Automation

#### 1. API Documentation
```javascript
// scripts/generate-docs.js
const typedoc = require('typedoc');

async function generateDocs() {
  const app = new typedoc.Application();
  
  app.options.addReader(new typedoc.TSConfigReader());
  app.options.addReader(new typedoc.TypeDocReader());
  
  app.bootstrap({
    entryPoints: ['src/index.ts'],
    plugin: ['typedoc-plugin-markdown'],
    out: 'docs/api',
    theme: 'markdown',
    excludePrivate: true,
    excludeProtected: true,
    githubPages: false
  });
  
  const project = app.convert();
  
  if (project) {
    await app.generateDocs(project, 'docs/api');
    console.log('API documentation generated');
  }
}

generateDocs();
```

#### 2. Changelog Generation
```javascript
// scripts/update-changelog.js
const { execSync } = require('child_process');
const fs = require('fs');

function updateChangelog(version) {
  const date = new Date().toISOString().split('T')[0];
  const commits = execSync(
    'git log --pretty=format:"- %s (%h)" --no-merges HEAD...$(git describe --tags --abbrev=0)',
    { encoding: 'utf8' }
  );
  
  const entry = `## [${version}] - ${date}\n\n${commits}\n\n`;
  
  const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
  const updated = changelog.replace(
    '# Changelog\n\n',
    `# Changelog\n\n${entry}`
  );
  
  fs.writeFileSync('CHANGELOG.md', updated);
}

updateChangelog(process.argv[2]);
```

### Monitoring and Analytics

#### 1. Telemetry Setup
```typescript
// src/telemetry/analytics.ts
import * as vscode from 'vscode';

export class Analytics {
  private reporter?: TelemetryReporter;
  
  initialize(context: vscode.ExtensionContext) {
    if (vscode.env.isTelemetryEnabled) {
      this.reporter = new TelemetryReporter(
        'copilot-mcp-bridge',
        context.extension.packageJSON.version,
        'YOUR_APP_INSIGHTS_KEY'
      );
      
      context.subscriptions.push(this.reporter);
    }
  }
  
  trackEvent(name: string, properties?: Record<string, string>) {
    this.reporter?.sendTelemetryEvent(name, properties);
  }
  
  trackError(error: Error, properties?: Record<string, string>) {
    this.reporter?.sendTelemetryErrorEvent(
      error.name,
      { ...properties, stack: error.stack }
    );
  }
}
```

## Git Branch Strategy
- Branch: `feature/devops-infrastructure`
- Commits: Infrastructure as code
- PR Strategy: Include workflow run results