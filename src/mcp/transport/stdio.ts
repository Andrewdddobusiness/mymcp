import { ChildProcess, spawn } from 'child_process';
import * as readline from 'readline';
import { Transport } from './base';
import { MCPMessage, TransportConfig, ConnectionState } from '../types/protocol';

export class StdioTransport extends Transport {
  private process?: ChildProcess;
  private readline?: readline.Interface;
  private isClosing = false;

  constructor(config: TransportConfig) {
    super(config);
    
    if (!config.command) {
      throw new Error('Stdio transport requires a command');
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    this.setState(ConnectionState.Connecting);
    await this.connectWithTimeout();
  }

  protected async performConnect(): Promise<void> {
    try {
      const { command, args = [], env = {} } = this.config;

      // Spawn the process
      this.process = spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
      });

      // Set up readline for line-by-line reading
      this.readline = readline.createInterface({
        input: this.process.stdout!,
        crlfDelay: Infinity
      });

      // Handle incoming messages
      this.readline.on('line', (line) => {
        if (line.trim()) {
          this.handleMessage(line);
        }
      });

      // Handle process events
      this.process.on('error', (error) => {
        this.handleError(new Error(`Process error: ${error.message}`));
      });

      this.process.on('close', (code, signal) => {
        if (!this.isClosing) {
          const message = signal 
            ? `Process terminated by signal ${signal}`
            : `Process exited with code ${code}`;
          this.handleError(new Error(message));
        }
        this.cleanup();
      });

      this.process.on('exit', (code, signal) => {
        if (!this.isClosing) {
          const message = signal 
            ? `Process killed by signal ${signal}`
            : `Process exited with code ${code}`;
          this.handleError(new Error(message));
        }
      });

      // Handle stderr for logging
      this.process.stderr!.on('data', (data) => {
        const message = data.toString().trim();
        if (message) {
          this.emit('stderr', message);
        }
      });

      // Wait for process to be ready
      await this.waitForProcessReady();
      
      this.handleConnect();
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  private async waitForProcessReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error('Process not spawned'));
        return;
      }

      // Check if process is already dead
      if (this.process.killed || this.process.exitCode !== null) {
        reject(new Error('Process died during startup'));
        return;
      }

      // Wait a short time for the process to stabilize
      const timeout = setTimeout(() => {
        if (this.process && !this.process.killed && this.process.exitCode === null) {
          resolve();
        } else {
          reject(new Error('Process not ready'));
        }
      }, 100);

      // If process dies during wait, reject immediately
      this.process.once('exit', () => {
        clearTimeout(timeout);
        reject(new Error('Process exited during startup'));
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected && !this.process) {
      return;
    }

    this.isClosing = true;
    this.setState(ConnectionState.Disconnected);

    try {
      if (this.process && !this.process.killed) {
        // Try graceful shutdown first
        this.process.kill('SIGTERM');

        // Wait for graceful shutdown
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            // Force kill if graceful shutdown takes too long
            if (this.process && !this.process.killed) {
              this.process.kill('SIGKILL');
            }
            resolve();
          }, 5000);

          if (this.process) {
            this.process.once('exit', () => {
              clearTimeout(timeout);
              resolve();
            });
          } else {
            clearTimeout(timeout);
            resolve();
          }
        });
      }
    } catch (error) {
      // Ignore errors during shutdown
    } finally {
      this.cleanup();
      this.handleDisconnect();
    }
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.isConnected || !this.process || !this.process.stdin) {
      throw new Error('Transport not connected');
    }

    await this.sendJson(message);
  }

  protected async sendRaw(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new Error('Process stdin not available'));
        return;
      }

      const written = this.process.stdin.write(data, 'utf8', (error) => {
        if (error) {
          reject(new Error(`Failed to write to stdin: ${error.message}`));
        } else {
          resolve();
        }
      });

      if (!written) {
        // Handle backpressure
        this.process.stdin.once('drain', resolve);
      }
    });
  }

  private cleanup(): void {
    this.isClosing = false;

    if (this.readline) {
      this.readline.close();
      this.readline = undefined;
    }

    if (this.process) {
      // Remove all listeners to prevent memory leaks
      this.process.removeAllListeners();
      
      if (this.process.stdin) {
        this.process.stdin.removeAllListeners();
        this.process.stdin.destroy();
      }
      
      if (this.process.stdout) {
        this.process.stdout.removeAllListeners();
        this.process.stdout.destroy();
      }
      
      if (this.process.stderr) {
        this.process.stderr.removeAllListeners();
        this.process.stderr.destroy();
      }

      this.process = undefined;
    }
  }

  // Get process information
  getProcessInfo(): {
    pid?: number;
    killed: boolean;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
  } | null {
    if (!this.process) {
      return null;
    }

    return {
      pid: this.process.pid,
      killed: this.process.killed,
      exitCode: this.process.exitCode,
      signalCode: this.process.signalCode
    };
  }

  // Send a signal to the process
  killProcess(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    if (!this.process || this.process.killed) {
      return false;
    }

    return this.process.kill(signal);
  }

  dispose(): void {
    this.disconnect().catch(() => {
      // Ignore errors during disposal
    });
    super.dispose();
  }
}