import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import type { Plugin } from 'vite';

function hoistMockVarDeclarations(): Plugin {
  return {
    name: 'hoist-mock-var-declarations',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.test.ts') && !id.endsWith('.test.tsx')) return null;
      if (!code.includes('vi.fn') || !code.match(/\bconst\s+mock\w+\s*=/)) return null;

      const lines = code.split('\n');
      const result = lines.map((line) => {
        const m = line.match(/^(\s*const\s+mock\w+\s*=\s*)(vi\.fn\(.*)$/);
        if (!m) return line;

        const prefix = m[1];
        const rhs = m[2];

        let depth = 0;
        let endIdx = -1;
        for (let i = 0; i < rhs.length; i++) {
          const ch = rhs[i];
          if (ch === '(') depth++;
          else if (ch === ')') {
            depth--;
            if (depth === 0) { endIdx = i; break; }
          }
        }
        if (endIdx === -1) return line;

        const fnCall = rhs.substring(0, endIdx + 1);
        const rest = rhs.substring(endIdx + 1);
        return `${prefix}vi.hoisted(() => ${fnCall})${rest}`;
      });

      return result.join('\n');
    },
  };
}

export default defineConfig({
  plugins: [hoistMockVarDeclarations()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
