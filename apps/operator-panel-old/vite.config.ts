import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const tunnelHostname = env.VITE_DEV_HOSTNAME || 'dev.brigidforge.com';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('@walletconnect') || id.includes('@reown')) {
              return 'walletconnect';
            }
            if (id.includes('ethers')) {
              return 'ethers';
            }
            if (id.includes('react') || id.includes('react-router')) {
              return 'react-vendor';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5175,
      strictPort: true,
      allowedHosts: [tunnelHostname],
      hmr: {
        host: tunnelHostname,
        protocol: 'wss',
        clientPort: 443,
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
