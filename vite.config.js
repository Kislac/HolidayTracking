import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: "/HolidayTracking/", // <-- cseréld REPO-ra a repo nevét, pl. "/holiday-tracker/"
  plugins: [react()],
})
