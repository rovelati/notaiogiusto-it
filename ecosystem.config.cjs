module.exports = {
  apps: [
    {
      name: 'notaiogiusto-it',
      script: './dist/server/entry.mjs',
      cwd: '/var/www/notaiogiusto-it',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '4330',
      },
    },
  ],
};
