module.exports = {
  "**/*.{js,mjs,cjs,vue}": ["eslint --fix", "prettier --write"],
  "**/*.{json,md,html,css,scss,less,yml,yaml}": ["prettier --write"],
  "package.json": ["prettier --write"]
};
