module.exports = {
  apps: [
    {
      name: 'naukri-bot',
      script: 'src/api/server.js',
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
  ],
};
