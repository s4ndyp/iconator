migrate(
  (app) => {
    const collection = new Collection({
      type: "base",
      name: "icons",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
      fields: [
        {
          name: "name",
          type: "text",
          max: 120,
          presentable: true,
        },
        {
          name: "icon",
          type: "file",
          required: true,
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ["image/png"],
        },
        {
          name: "mask",
          type: "select",
          maxSelect: 1,
          values: ["round", "square"],
        },
        {
          name: "transparent",
          type: "bool",
        },
        {
          name: "created",
          type: "autodate",
          onCreate: true,
          onUpdate: false,
        },
        {
          name: "updated",
          type: "autodate",
          onCreate: true,
          onUpdate: true,
        },
      ],
    });

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("icons");
    app.delete(collection);
  }
);
