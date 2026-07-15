/** @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions} */
const config = {
  semi: true,
  singleQuote: true,
  jsxSingleQuote: false,
  trailingComma: 'es5',
  tabWidth: 2,
  printWidth: 88,
  plugins: ['prettier-plugin-tailwindcss'],
};

export default config;
