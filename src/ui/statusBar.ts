import * as vscode from 'vscode';

interface StatusBarState {
  statusBarItem: vscode.StatusBarItem;
  connectionCount: number;
  hasErrors: boolean;
}

let statusBarInstance: StatusBarState | null = null;

function createStatusBar(context: vscode.ExtensionContext): StatusBarState {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  
  statusBarItem.command = 'copilot-mcp.showStatus';
  statusBarItem.tooltip = 'Click to view MCP server status';
  
  context.subscriptions.push(statusBarItem);
  
  const state = {
    statusBarItem,
    connectionCount: 0,
    hasErrors: false
  };
  
  updateDisplay(state);
  return state;
}

function getStatusBar(context: vscode.ExtensionContext): StatusBarState {
  if (!statusBarInstance) {
    statusBarInstance = createStatusBar(context);
  }
  return statusBarInstance;
}

function updateDisplay(state: StatusBarState): void {
  if (state.hasErrors) {
    state.statusBarItem.text = '$(error) MCP: Error';
    state.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    state.statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
  } else if (state.connectionCount === 0) {
    state.statusBarItem.text = '$(circle-outline) MCP: No servers';
    state.statusBarItem.backgroundColor = undefined;
    state.statusBarItem.color = undefined;
  } else {
    state.statusBarItem.text = `$(plug) MCP: ${state.connectionCount}`;
    state.statusBarItem.backgroundColor = undefined;
    state.statusBarItem.color = undefined;
  }
  
  state.statusBarItem.tooltip = getTooltip(state);
}

function getTooltip(state: StatusBarState): string {
  if (state.hasErrors) {
    return 'MCP Bridge: Connection errors detected. Click for details.';
  } else if (state.connectionCount === 0) {
    return 'MCP Bridge: No servers connected. Click to configure.';
  } else {
    const serverText = state.connectionCount === 1 ? 'server' : 'servers';
    return `MCP Bridge: ${state.connectionCount} ${serverText} connected. Click for status.`;
  }
}

export function initializeStatusBar(context: vscode.ExtensionContext): void {
  getStatusBar(context);
}

export function updateConnectionCount(context: vscode.ExtensionContext, count: number): void {
  const state = getStatusBar(context);
  state.connectionCount = count;
  updateDisplay(state);
}

export function setError(context: vscode.ExtensionContext, hasError: boolean): void {
  const state = getStatusBar(context);
  state.hasErrors = hasError;
  updateDisplay(state);
}

export function show(context: vscode.ExtensionContext): void {
  const state = getStatusBar(context);
  state.statusBarItem.show();
}

export function hide(): void {
  if (statusBarInstance) {
    statusBarInstance.statusBarItem.hide();
  }
}

export function dispose(): void {
  if (statusBarInstance) {
    statusBarInstance.statusBarItem.dispose();
    statusBarInstance = null;
  }
}