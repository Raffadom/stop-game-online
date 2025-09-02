const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: "https://stop-paper.netlify.app/",
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
    experimentalStudio: true, // ✅ correção aqui
  },
});
