import type { Config } from 'prettier';

const config: Config = {
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  proseWrap: 'preserve',
  // The documents are wrapped at 150, as the design, the roadmap and the epics are written.
  overrides: [{ files: '*.md', options: { printWidth: 150 } }],
};

export default config;
