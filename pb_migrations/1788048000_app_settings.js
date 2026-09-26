migrate((app) => {
  const settings = app.settings();
  settings.meta.appName = "Iconator";
  app.save(settings);
});
