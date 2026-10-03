module.exports = {
  apps: [
    {
      name: 'notaiogiusto-it',
      script: './dist/server/entry.mjs',
      cwd: '/var/www/notaiogiusto-it',
      node_args: '--env-file=.env --env-file=smtp-brevo.env --env-file=google-oauth.env --env-file=google-places.env',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '4330',
      },
    },
  ],
};
