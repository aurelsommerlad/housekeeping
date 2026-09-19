import nextConfig from 'eslint-config-next';

const eslintConfig = [
  // Die bisherige Vanilla-JS-Housekeeping-App (api/*.js Serverless Functions, app.js,
  // admin/index.html-Shell) ist bewusst nicht Teil dieser Migration (siehe MIGRATION_PLAN.md)
  // und wird hier nicht mitgelintet, um die Backend-Logik unangetastet zu lassen.
  {
    ignores: ['api/**', 'app.js', 'sw.js', 'admin/**', 'icons/**', '.next/**', 'node_modules/**'],
  },
  ...nextConfig,
];

export default eslintConfig;
