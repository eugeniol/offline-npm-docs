#!/usr/bin/env node
const express = require('express');
const marked = require('marked');
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const app = express();
const modulesPath = path.resolve('./node_modules');
const files = glob.sync(`${modulesPath}/*/README.md`);
const routesPairs = files.map(file => [
  path.dirname(path.relative(modulesPath, file)),
  file,
  require(path.join(path.dirname(file), 'package.json'))
]);

app.get('/', (req, res) => res.contentType('text/html').send(layout(req, '')));

routesPairs.forEach(([route, file, pkg]) =>
  app.get('/' + route, (req, res, next) =>
    fs.readFile(file, (err, data) =>
      err ? next(err) : res.send(layout(req, docContentLayout(pkg, data.toString('utf8'))))
    )
  )
);

const layout = (req, content) => `
 <!DOCTYPE html>
<html>
<head>
<!-- Latest compiled and minified CSS -->
<link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/3.4.1/css/bootstrap.min.css" integrity="sha384-HSMxcRTRxnN+Bdg0JdbxYKrThecOKuH5zCYotlSAcp1+c8xmyTe9GYg1l9a69psu" crossorigin="anonymous">

<!-- Optional theme -->
<link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/3.4.1/css/bootstrap-theme.min.css" integrity="sha384-6pzBo3FDv/PJ8r2KRkGHifhEocL+1X2rVCTTkUfGk7/0pbek5mMa1upzvWbrUbOZ" crossorigin="anonymous">
</head>
<body style="margin:10px;">
<div class="container">
<div class="row">
    <div class="col-md-3">
        <div class="input-group">
            <input class="form-control" id="filter">
            <span class="input-group-addon">?</span>
        </div>
    </div>
    <div class="col-md-9"><hr></div>
</div>
    <div class="row">
        <div class="col-md-3">
            <div class="panel panel-default">
                      
                <div class="panel-body">
                    <ul id="navigation" class='nav nav-pills nav-stacked'>
                    ${routesPairs
                      .map(
                        ([route]) =>
                          `<li class='nav-item' rel="${path.dirname(route)}"><a href="/${route}">${route}</a></li>`
                      )
                      .join('')}
                    </ul>
                </div>
            </div>
        </div>
        <div class="col-md-9">
            ${content}
        </div>
    </div>
</div>
<script>
    document.getElementById('filter').value = ${JSON.stringify(req.url.replace(/^\//, '').replace(/\/$/, ''))};
    const filterList = list => value => {
        value = value.trim();
        list.forEach(li => {
            li.style.display = !value || li.textContent.trim().startsWith(value) ? 'block':'none';
        });
    }
    const filterNav = filterList(document.querySelectorAll('#navigation li'));
    document.getElementById('filter')
        .addEventListener('keyup', ({target:{value}})=>filterNav(value))
    //filterNav(document.getElementById('filter').value)
</script>
</body>
</html>
`;

const docContentLayout = (pkg, readme) => {
  return `
    <div class='row'>
        <div class='col-md-9'>${marked(readme)}</div>
        <div class='col-md-3'>
            <span class="label label-lg label-primary">${pkg.name}</span>
            <span class="label label-lg  label-success">${pkg.version}</span>
        </div>
    </div>
    `;
};
const port = process.env.PORT || 3007;

app.listen(port, () => {
  console.log(`Docs served http://localhost:${port}`);
});

module.exports = app;
