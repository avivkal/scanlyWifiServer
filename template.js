const handlebars = require("handlebars");
const fs = require("fs");

module.exports = function (file, template) {
  const _template = handlebars.compile(fs.readFileSync(file).toString());

  return _template(template);
};
