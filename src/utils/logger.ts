import * as vscode from 'vscode';
import * as winston from 'winston';

export class Logger {
  private winston: winston.Logger;
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Copilot MCP Bridge');
    
    this.winston = winston.createLogger({
      level: this.getLogLevel(),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  private getLogLevel(): string {
    const config = vscode.workspace.getConfiguration('copilot-mcp');
    return config.get<string>('logLevel', 'info');
  }

  info(message: string, meta?: any): void {
    this.winston.info(message, meta);
    this.outputChannel.appendLine(`[INFO] ${message}`);
    if (meta) {
      this.outputChannel.appendLine(`  ${JSON.stringify(meta, null, 2)}`);
    }
  }

  warn(message: string, meta?: any): void {
    this.winston.warn(message, meta);
    this.outputChannel.appendLine(`[WARN] ${message}`);
    if (meta) {
      this.outputChannel.appendLine(`  ${JSON.stringify(meta, null, 2)}`);
    }
  }

  error(message: string, meta?: any): void {
    this.winston.error(message, meta);
    this.outputChannel.appendLine(`[ERROR] ${message}`);
    if (meta) {
      this.outputChannel.appendLine(`  ${JSON.stringify(meta, null, 2)}`);
    }
  }

  debug(message: string, meta?: any): void {
    this.winston.debug(message, meta);
    if (this.getLogLevel() === 'debug') {
      this.outputChannel.appendLine(`[DEBUG] ${message}`);
      if (meta) {
        this.outputChannel.appendLine(`  ${JSON.stringify(meta, null, 2)}`);
      }
    }
  }

  show(): void {
    this.outputChannel.show();
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}