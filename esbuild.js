const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
    define: {
      'process.env.NODE_ENV': production ? '"production"' : '"development"'
    },
    metafile: true,
    plugins: [
      {
        name: 'copy-media',
        setup(build) {
          build.onEnd(async (result) => {
            if (result.errors.length === 0) {
              // Copy media files
              const fs = require('fs');
              const path = require('path');
              
              if (fs.existsSync('media')) {
                if (!fs.existsSync('dist/media')) {
                  fs.mkdirSync('dist/media', { recursive: true });
                }
                
                const copyRecursive = (src, dest) => {
                  const stat = fs.statSync(src);
                  if (stat.isDirectory()) {
                    if (!fs.existsSync(dest)) {
                      fs.mkdirSync(dest);
                    }
                    fs.readdirSync(src).forEach(file => {
                      copyRecursive(path.join(src, file), path.join(dest, file));
                    });
                  } else {
                    fs.copyFileSync(src, dest);
                  }
                };
                
                copyRecursive('media', 'dist/media');
              }
            }
          });
        }
      }
    ]
  });
  
  if (watch) {
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    const result = await ctx.rebuild();
    await ctx.dispose();
    
    if (production && result.metafile) {
      // Write bundle analysis
      const fs = require('fs');
      fs.writeFileSync('dist/metafile.json', JSON.stringify(result.metafile, null, 2));
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});