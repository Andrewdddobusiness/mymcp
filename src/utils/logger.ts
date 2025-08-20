import * as vscode from 'vscode';
import * as winston from 'winston';

interface LoggerState {
  winston: winston.Logger;
  outputChannel: vscode.OutputChannel;
}

let loggerInstance: LoggerState | null = null;

function getLogLevel(): string {
  const config = vscode.workspace.getConfiguration('copilot-mcp');
  return config.get<string>('logLevel', 'info');
}

function createLogger(): LoggerState {
  const outputChannel = vscode.window.createOutputChannel('Copilot MCP Bridge');
  
  const winstonLogger = winston.createLogger({
    level: getLogLevel(),
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

  return {
    winston: winstonLogger,
    outputChannel
  };
}

function getLogger(): LoggerState {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}

export function info(message: string, meta?: any): void {
  const logger = getLogger();
  logger.winston.info(message, meta);
  logger.outputChannel.appendLine(`[INFO] ${message}`);
  if (meta) {
    logger.outputChannel.appendLine(`  ${JSON.stringify(meta, null, 2)}`);
  }
}

export function warn(message: string, meta?: any): void {
  const logger = getLogger();
  logger.winston.warn(message, meta);
  logger.outputChannel.appendLine(`[WARN] ${message}`);
  if (meta) {
    logger.outputChannel.appendLine(`  ${JSON.stringify(meta, null, 2)}`);
  }
}

export function error(message: string, meta?: any): void {
  const logger = getLogger();
  logger.winston.error(message, meta);
  logger.outputChannel.appendLine(`[ERROR] ${message}`);
  if (meta) {
    logger.outputChannel.appendLine(`  ${JSON.stringify(meta, null, 2)}`);
  }
}

export function debug(message: string, meta?: any): void {
  const logger = getLogger();
  logger.winston.debug(message, meta);
  if (getLogLevel() === 'debug') {
    logger.outputChannel.appendLine(`[DEBUG] ${message}`);
    if (meta) {
      logger.outputChannel.appendLine(`  ${JSON.stringify(meta, null, 2)}`);
    }
  }
}

export function show(): void {
  const logger = getLogger();
  logger.outputChannel.show();
}

export function dispose(): void {
  if (loggerInstance) {
    loggerInstance.outputChannel.dispose();
    loggerInstance = null;
  }
}