import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Prevent multiple React runtimes in dev (fixes: "A React Element from an older version of React was rendered")
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  preview: {
    allowedHosts: ['dashywashy.onrender.com'],
  },
})




































