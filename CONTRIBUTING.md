# Contributing to Copilot MCP Bridge

Thank you for your interest in contributing to the Copilot MCP Bridge extension! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:
- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Respect differing viewpoints and experiences

## How to Contribute

### Reporting Issues

1. Check if the issue already exists in [GitHub Issues](https://github.com/yourusername/copilot-mcp-bridge/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (VS Code version, OS, etc.)
   - Relevant logs from Output panel

### Suggesting Features

1. Check existing feature requests
2. Create a new issue with label `enhancement`
3. Describe the feature and use cases
4. Explain why it would benefit users

### Contributing Code

#### Setup Development Environment

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/copilot-mcp-bridge.git
   cd copilot-mcp-bridge
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

#### Development Workflow

1. Make your changes
2. Follow the coding standards (see below)
3. Add/update tests as needed
4. Run tests and linting:
   ```bash
   npm run lint
   npm run type-check
   npm test
   ```

5. Build and test the extension:
   ```bash
   npm run compile
   # Press F5 in VS Code to test
   ```

#### Submitting Pull Requests

1. Commit your changes:
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

2. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

3. Create a Pull Request with:
   - Clear title and description
   - Reference any related issues
   - Screenshots/GIFs for UI changes
   - Updated documentation

### Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Test additions or corrections
- `chore:` Maintenance tasks

Examples:
```
feat: add WebSocket transport support
fix: handle connection timeout properly
docs: update README with new examples
```

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Provide type annotations for public APIs
- Avoid `any` type unless absolutely necessary
- Use interfaces over type aliases when possible

### Code Style

- Follow existing code style
- Use ESLint and Prettier configurations
- Maximum line length: 100 characters
- Use meaningful variable and function names

### Error Handling

- Always handle errors gracefully
- Provide helpful error messages
- Log errors appropriately
- Never expose sensitive information

### Testing

- Write unit tests for new functionality
- Maintain or improve code coverage
- Test edge cases and error conditions
- Use descriptive test names

## Project Structure

```
src/
├── extension.ts       # Extension entry point
├── copilot/          # Copilot integration
├── mcp/              # MCP protocol implementation
│   ├── client/       # MCP client
│   ├── transport/    # Transport layers
│   └── types/        # Protocol types
├── ui/               # UI components
├── config/           # Configuration management
└── utils/            # Utility functions
```

## Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### Manual Testing

1. Build the extension
2. Press F5 in VS Code to launch Extension Host
3. Test your changes thoroughly
4. Verify no regressions

## Documentation

- Update README.md for user-facing changes
- Update inline documentation
- Add JSDoc comments for public APIs
- Update CHANGELOG.md

## Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Run pre-release checks:
   ```bash
   npm run prerelease
   ```
4. Create a release PR
5. After merge, tag release:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

## Getting Help

- Join our [Discord community](https://discord.gg/example)
- Check the [documentation](https://github.com/yourusername/copilot-mcp-bridge/wiki)
- Ask questions in GitHub Discussions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.