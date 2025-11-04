/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.{html,js}",
  ],
  darkMode: 'class', // Enable dark mode with class strategy
  theme: {
    extend: {
      colors: {
        'primary': '#0070F0',
        'chat-bg': '#f2f2f2',
        'text-primary': '#303437'
      },
      fontFamily: {
        'sans': ['"PingFang SC"', '"Microsoft YaHei"', '"Noto Sans SC"', '"Hiragino Sans GB"', 'sans-serif'],
        'pingfang': ['"PingFang SC"', '"Microsoft YaHei"', '"Noto Sans SC"', '"Hiragino Sans GB"', 'sans-serif']
      }
    }
  },
  plugins: []
}