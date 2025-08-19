import * as vscode from 'vscode';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private connectionCount = 0;
  private hasErrors = false;

  constructor(private context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    
    this.statusBarItem.command = 'copilot-mcp.showStatus';
    this.statusBarItem.tooltip = 'Click to view MCP server status';
    
    this.context.subscriptions.push(this.statusBarItem);
    this.updateDisplay();
  }

  updateConnectionCount(count: number): void {
    this.connectionCount = count;
    this.updateDisplay();
  }

  setError(hasError: boolean): void {
    this.hasErrors = hasError;
    this.updateDisplay();
  }

  private updateDisplay(): void {
    if (this.hasErrors) {
      this.statusBarItem.text = '$(error) MCP: Error';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    } else if (this.connectionCount === 0) {
      this.statusBarItem.text = '$(circle-outline) MCP: No servers';
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = undefined;
    } else {
      this.statusBarItem.text = `$(plug) MCP: ${this.connectionCount}`;
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.color = undefined;
    }
    
    this.statusBarItem.tooltip = this.getTooltip();
  }

  private getTooltip(): string {
    if (this.hasErrors) {
      return 'MCP Bridge: Connection errors detected. Click for details.';
    } else if (this.connectionCount === 0) {
      return 'MCP Bridge: No servers connected. Click to configure.';
    } else {
      const serverText = this.connectionCount === 1 ? 'server' : 'servers';
      return `MCP Bridge: ${this.connectionCount} ${serverText} connected. Click for status.`;
    }
  }

  show(): void {
    this.statusBarItem.show();
  }

  hide(): void {
    this.statusBarItem.hide();
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}