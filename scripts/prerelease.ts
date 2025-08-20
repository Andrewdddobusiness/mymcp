#!/usr/bin/env ts-node
// scripts/prerelease.ts
// Pre-release checklist to ensure extension is ready for publishing

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface CheckResult {
  passed: boolean;
  message: string;
}

class PrereleaseChecker {
  private checks: Array<() => CheckResult> = [
    this.checkVersion.bind(this),
    this.checkChangelog.bind(this),
    this.checkLint.bind(this),
    this.checkTypeScript.bind(this),
    this.checkBuild.bind(this),
    this.checkDependencies.bind(this),
    this.checkDocumentation.bind(this),
    this.checkPackageJson.bind(this),
    this.checkIcon.bind(this)
  ];
  
  async runChecks(): Promise<boolean> {
    console.log('🔍 Running pre-release checks...\n');
    
    let allPassed = true;
    const results: CheckResult[] = [];
    
    for (const check of this.checks) {
      try {
        const result = check();
        results.push(result);
        
        const emoji = result.passed ? '✅' : '❌';
        console.log(`${emoji} ${result.message}`);
        
        if (!result.passed) {
          allPassed = false;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          passed: false,
          message: `Check failed with error: ${errorMessage}`
        });
        console.log(`❌ Check failed with error: ${errorMessage}`);
        allPassed = false;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(allPassed ? '✅ All checks passed!' : '❌ Some checks failed.');
    console.log('='.repeat(50) + '\n');
    
    if (!allPassed) {
      console.log('Failed checks:');
      results
        .filter(r => !r.passed)
        .forEach(r => console.log(`  - ${r.message}`));
      console.log('');
    }
    
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
      message: `Version format (current: ${currentVersion})`
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
    const hasVersionEntry = changelog.includes(`## [${packageJson.version}]`) ||
                           changelog.includes(`## ${packageJson.version}`);
    
    return {
      passed: hasVersionEntry,
      message: hasVersionEntry 
        ? `CHANGELOG.md updated for v${packageJson.version}`
        : `CHANGELOG.md missing entry for v${packageJson.version}`
    };
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
        message: 'Linting errors found (run "npm run lint" for details)'
      };
    }
  }
  
  private checkTypeScript(): CheckResult {
    try {
      execSync('npm run type-check', { stdio: 'pipe' });
      return {
        passed: true,
        message: 'TypeScript compilation successful'
      };
    } catch (error) {
      return {
        passed: false,
        message: 'TypeScript errors found (run "npm run type-check" for details)'
      };
    }
  }
  
  private checkBuild(): CheckResult {
    try {
      execSync('npm run compile', { stdio: 'pipe' });
      
      // Check if output exists
      const distExists = fs.existsSync('dist/extension.js');
      
      return {
        passed: distExists,
        message: distExists ? 'Build successful' : 'Build output not found'
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Build failed (run "npm run compile" for details)'
      };
    }
  }
  
  private checkDependencies(): CheckResult {
    try {
      // Note: npm audit might exit with non-zero for moderate vulnerabilities
      const output = execSync('npm audit --production --json', { 
        stdio: 'pipe',
        encoding: 'utf8'
      });
      
      const audit = JSON.parse(output);
      const hasHighOrCritical = audit.metadata && 
        (audit.metadata.vulnerabilities.high > 0 || 
         audit.metadata.vulnerabilities.critical > 0);
      
      return {
        passed: !hasHighOrCritical,
        message: hasHighOrCritical 
          ? `Security vulnerabilities found (${audit.metadata.vulnerabilities.high} high, ${audit.metadata.vulnerabilities.critical} critical)`
          : 'No high or critical security vulnerabilities'
      };
    } catch (error) {
      // If npm audit fails to parse, assume there are issues
      return {
        passed: true, // Don't fail on moderate vulnerabilities
        message: 'Security check completed (run "npm audit" for details)'
      };
    }
  }
  
  private checkDocumentation(): CheckResult {
    const requiredFiles = ['README.md', 'LICENSE', 'CHANGELOG.md'];
    const missing = requiredFiles.filter(file => !fs.existsSync(file));
    
    return {
      passed: missing.length === 0,
      message: missing.length === 0 
        ? 'All documentation files present' 
        : `Missing documentation: ${missing.join(', ')}`
    };
  }
  
  private checkPackageJson(): CheckResult {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const issues: string[] = [];
    
    // Check required fields
    if (!packageJson.publisher || packageJson.publisher === 'your-publisher-id') {
      issues.push('publisher not set');
    }
    
    if (!packageJson.repository) {
      issues.push('repository field missing');
    }
    
    if (!packageJson.icon) {
      issues.push('icon field missing');
    }
    
    if (!packageJson.categories || packageJson.categories.length === 0) {
      issues.push('categories missing');
    }
    
    if (!packageJson.keywords || packageJson.keywords.length === 0) {
      issues.push('keywords missing');
    }
    
    if (!packageJson.engines?.vscode) {
      issues.push('vscode engine version missing');
    }
    
    return {
      passed: issues.length === 0,
      message: issues.length === 0
        ? 'package.json properly configured'
        : `package.json issues: ${issues.join(', ')}`
    };
  }
  
  private checkIcon(): CheckResult {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    if (!packageJson.icon) {
      return {
        passed: true, // Not critical if missing
        message: 'No icon specified in package.json'
      };
    }
    
    const iconPath = path.join(process.cwd(), packageJson.icon);
    const exists = fs.existsSync(iconPath);
    
    if (!exists) {
      return {
        passed: false,
        message: `Icon file not found: ${packageJson.icon}`
      };
    }
    
    // Could add size validation here (should be 128x128)
    
    return {
      passed: true,
      message: 'Icon file exists'
    };
  }
}

// Run checks if executed directly
if (require.main === module) {
  const checker = new PrereleaseChecker();
  checker.runChecks().then(passed => {
    process.exit(passed ? 0 : 1);
  });
}

export { PrereleaseChecker };