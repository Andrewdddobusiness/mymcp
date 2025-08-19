import * as vscode from 'vscode';
import { MCPManager } from '../mcp/manager';
import { Logger } from '../types';

export class CopilotIntegration {
  constructor(
    private context: vscode.ExtensionContext,
    private mcpManager: MCPManager,
    private logger: Logger
  ) {}

  async register(): Promise<void> {
    this.logger.info('CopilotIntegration registered (placeholder)');
  }
}